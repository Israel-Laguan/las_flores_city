#!/bin/bash
# Las Flores 2077 - Schema Migration Applier
# Usage: ./scripts/apply-migrations.sh [oltp|olap|both|status|verify]
#
# Applies SQL migrations from server/src/database/migrations/ to Docker databases.
# Tracks applied migrations in the schema_migrations table.
# Uses migration-targets.json to determine which migrations go to which database.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_ROOT/server/src/database/migrations"
TARGETS_FILE="$MIGRATIONS_DIR/migration-targets.json"

# Database connection info
OLTP_DB="las_flores"
OLTP_USER="las_flores"
OLTP_HOST="las-flores-postgres-oltp"
OLTP_PORT="5432"

OLAP_DB="las_flores_analytics"
OLAP_USER="las_flores_analytics"
OLAP_HOST="las-flores-postgres-olap"
OLAP_PORT="5432"

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "${BLUE}$1${NC}"
}

# Calculate SHA256 checksum of a file
calculate_checksum() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo "file_not_found"
        return 1
    fi
    if command -v sha256sum &> /dev/null; then
        sha256sum "$file" | awk '{print $1}'
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$file" | awk '{print $1}'
    else
        echo "unsupported"
    fi
}

# Check if a migration is already applied
is_applied() {
    local db_host="$1"
    local db_port="$2"
    local db_name="$3"
    local db_user="$4"
    local version="$5"
    
    local count=$(docker exec "$db_host" psql -h localhost -p "$db_port" -U "$db_user" -d "$db_name" -t -c \
        "SELECT COUNT(*) FROM schema_migrations WHERE version = '$version' AND database_name = '$db_name';" 2>/dev/null | tr -d ' ')
    
    [ "$count" = "1" ]
}

# Get the checksum of an applied migration
get_applied_checksum() {
    local db_host="$1"
    local db_port="$2"
    local db_name="$3"
    local db_user="$4"
    local version="$5"
    
    docker exec "$db_host" psql -h localhost -p "$db_port" -U "$db_user" -d "$db_name" -t -c \
        "SELECT checksum FROM schema_migrations WHERE version = '$version' AND database_name = '$db_name';" 2>/dev/null | tr -d ' '
}

# Record a migration as applied
record_migration() {
    local db_host="$1"
    local db_port="$2"
    local db_name="$3"
    local db_user="$4"
    local version="$5"
    local filename="$6"
    local checksum="$7"
    
    docker exec -i "$db_host" psql -h localhost -p "$db_port" -U "$db_user" -d "$db_name" -c \
        "INSERT INTO schema_migrations (version, filename, checksum, database_name) \
         VALUES ('$version', '$filename', '$checksum', '$db_name') \
         ON CONFLICT (version, database_name) DO UPDATE SET \
         filename = EXCLUDED.filename, checksum = EXCLUDED.checksum, applied_at = NOW();" > /dev/null 2>&1
}

# Apply a single migration
apply_migration() {
    local db_host="$1"
    local db_port="$2"
    local db_name="$3"
    local db_user="$4"
    local migration_file="$5"
    
    local filename=$(basename "$migration_file")
    local version=$(echo "$filename" | grep -oE '^[0-9]+')
    local checksum=$(calculate_checksum "$migration_file")
    
    if [ "$checksum" = "file_not_found" ]; then
        log_error "Migration file not found: $migration_file"
        return 1
    fi
    
    if is_applied "$db_host" "$db_port" "$db_name" "$db_user" "$version"; then
        local applied_checksum=$(get_applied_checksum "$db_host" "$db_port" "$db_name" "$db_user" "$version")
        if [ "$applied_checksum" = "$checksum" ]; then
            log_info "Migration $version ($filename) already applied to $db_name (checksum matches)"
        else
            log_warn "Migration $version ($filename) already recorded but checksum differs!"
            log_warn "  Applied: $applied_checksum"
            log_warn "  Current: $checksum"
            log_warn "  Consider re-applying if schema changes are needed."
        fi
        return 0
    fi
    
    log_info "Applying migration $version ($filename) to $db_name..."
    
    # Apply the migration
    if docker exec -i "$db_host" psql -h localhost -p "$db_port" -U "$db_user" -d "$db_name" < "$migration_file" 2>&1; then
        record_migration "$db_host" "$db_port" "$db_name" "$db_user" "$version" "$filename" "$checksum"
        log_info "✓ Migration $version applied successfully to $db_name"
        return 0
    else
        log_error "✗ Migration $version failed to apply to $db_name"
        return 1
    fi
}

# Get migrations for a database type from the targets file
get_migrations_for_db() {
    local db_type="$1"
    local migrations_dir="$2"
    
    if [ -f "$TARGETS_FILE" ]; then
        # Extract migration filenames for the given database type
        jq -r ".$db_type[]" "$TARGETS_FILE" 2>/dev/null | while read -r filename; do
            if [ -f "$migrations_dir/$filename" ]; then
                echo "$migrations_dir/$filename"
            fi
        done
    else
        # Fallback: use numeric sorting for all SQL files
        ls -1 "$migrations_dir"/[0-9]*.sql 2>/dev/null | sort -V
    fi
}

# Apply all migrations to a database
apply_to_database() {
    local db_type="$1"
    local db_host=""
    local db_port=""
    local db_name=""
    local db_user=""
    
    case "$db_type" in
        oltp)
            db_host="$OLTP_HOST"
            db_port="$OLTP_PORT"
            db_name="$OLTP_DB"
            db_user="$OLTP_USER"
            ;;
        olap)
            db_host="$OLAP_HOST"
            db_port="$OLAP_PORT"
            db_name="$OLAP_DB"
            db_user="$OLAP_USER"
            ;;
        *)
            log_error "Unknown database type: $db_type"
            return 1
            ;;
    esac
    
    log_header "========================================"
    log_header "Applying migrations to $db_type database ($db_name)"
    log_header "========================================"
    
    local migrations=$(get_migrations_for_db "$db_type" "$MIGRATIONS_DIR")
    local count=0
    local applied=0
    local failed=0
    
    for migration in $migrations; do
        count=$((count + 1))
        if apply_migration "$db_host" "$db_port" "$db_name" "$db_user" "$migration"; then
            applied=$((applied + 1))
        else
            failed=$((failed + 1))
        fi
    done
    
    log_info ""
    if [ $failed -eq 0 ]; then
        log_info "$db_type Summary: $applied/$count migrations applied successfully"
    else
        log_error "$db_type Summary: $applied/$count migrations applied, $failed failed"
    fi
}

# Verify migrations (check for drift)
verify_migrations() {
    local db_type="$1"
    local db_host=""
    local db_port=""
    local db_name=""
    local db_user=""
    
    case "$db_type" in
        oltp)
            db_host="$OLTP_HOST"
            db_port="$OLTP_PORT"
            db_name="$OLTP_DB"
            db_user="$OLTP_USER"
            ;;
        olap)
            db_host="$OLAP_HOST"
            db_port="$OLAP_PORT"
            db_name="$OLAP_DB"
            db_user="$OLAP_USER"
            ;;
        *)
            log_error "Unknown database type: $db_type"
            return 1
            ;;
    esac
    
    log_header ""
    log_header "========================================"
    log_header "Verifying migrations: $db_type ($db_name)"
    log_header "========================================"
    
    local migrations=$(get_migrations_for_db "$db_type" "$MIGRATIONS_DIR")
    local drift_detected=0
    
    for migration in $migrations; do
        local filename=$(basename "$migration")
        local version=$(echo "$filename" | grep -oE '^[0-9]+')
        local file_checksum=$(calculate_checksum "$migration")
        
        if [ "$file_checksum" = "file_not_found" ]; then
            continue
        fi
        
        if is_applied "$db_host" "$db_port" "$db_name" "$db_user" "$version"; then
            local applied_checksum=$(get_applied_checksum "$db_host" "$db_port" "$db_name" "$db_user" "$version")
            if [ "$applied_checksum" != "$file_checksum" ]; then
                log_warn "⚠️  Drift detected: $version ($filename)"
                log_warn "   File checksum:    $file_checksum"
                log_warn "   Applied checksum: $applied_checksum"
                drift_detected=$((drift_detected + 1))
            else
                log_info "✓ $version ($filename) - checksum verified"
            fi
        else
            log_warn "⚠️  Missing: $version ($filename) not recorded in schema_migrations"
            drift_detected=$((drift_detected + 1))
        fi
    done
    
    if [ $drift_detected -eq 0 ]; then
        log_info "✓ All migrations verified for $db_type"
    else
        log_warn "⚠️  $drift_detected issues found for $db_type"
    fi
}

# Show migration status
show_status() {
    local db_type="$1"
    local db_host=""
    local db_port=""
    local db_name=""
    local db_user=""
    
    case "$db_type" in
        oltp)
            db_host="$OLTP_HOST"
            db_port="$OLTP_PORT"
            db_name="$OLTP_DB"
            db_user="$OLTP_USER"
            ;;
        olap)
            db_host="$OLAP_HOST"
            db_port="$OLAP_PORT"
            db_name="$OLAP_DB"
            db_user="$OLAP_USER"
            ;;
        *)
            log_error "Unknown database type: $db_type"
            return 1
            ;;
    esac
    
    log_header ""
    log_header "========================================"
    log_header "Migration Status: $db_type ($db_name)"
    log_header "========================================"
    
    docker exec "$db_host" psql -h localhost -p "$db_port" -U "$db_user" -d "$db_name" -c \
        "SELECT version, filename, applied_at FROM schema_migrations ORDER BY CAST(version AS INTEGER);"
}

# Main
main() {
    local target="${1:-status}"
    
    log_header "Las Flores 2077 - Schema Migration Applier"
    log_header "============================================"
    
    # Ensure migrations directory exists
    if [ ! -d "$MIGRATIONS_DIR" ]; then
        log_error "Migrations directory not found: $MIGRATIONS_DIR"
        exit 1
    fi
    
    # Check for jq (for JSON parsing)
    if [ -f "$TARGETS_FILE" ] && ! command -v jq &> /dev/null; then
        log_warn "jq not found, falling back to numeric sorting for migrations"
    fi
    
    case "$target" in
        oltp)
            apply_to_database "oltp"
            show_status "oltp"
            ;;
        olap)
            apply_to_database "olap"
            show_status "olap"
            ;;
        both)
            apply_to_database "oltp"
            apply_to_database "olap"
            
            log_info ""
            show_status "oltp"
            show_status "olap"
            ;;
        verify)
            verify_migrations "oltp"
            verify_migrations "olap"
            ;;
        status)
            show_status "oltp"
            show_status "olap"
            ;;
        *)
            log_error "Unknown command: $target"
            log_error "Usage: $0 {oltp|olap|both|status|verify}"
            exit 1
            ;;
    esac
    
    log_info ""
    log_info "Done!"
}

main "$@"
