#!/bin/bash
# Las Flores 2077 — Milestone 99 Validation Checklist Script
# Usage: ./scripts/validate-milestones.sh [OPTIONS]
#
# Automated validation of all milestone requirements from docs/milestones/99_validation-checklist.md

# DO NOT use set -e - individual checks must not abort the entire script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Color codes (follow existing script patterns)
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0
WARN=0
SKIP=0

# Verbose mode
VERBOSE=false

# MinIO bucket name
MINIO_BUCKET="las-flores"

# Container runtime (auto-detect podman first, then docker)
CONTAINER_RUNTIME=""

# Detect container runtime
detect_container_runtime() {
    if command -v podman &> /dev/null; then
        CONTAINER_RUNTIME="podman"
    elif command -v docker &> /dev/null; then
        CONTAINER_RUNTIME="docker"
    else
        CONTAINER_RUNTIME=""
    fi
}

# Logging functions
log_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    PASS=$((PASS + 1))
}

log_fail() {
    echo -e "  ${RED}✗${NC} $1"
    FAIL=$((FAIL + 1))
}

log_warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    WARN=$((WARN + 1))
}

log_skip() {
    echo -e "  ${CYAN}-${NC} $1"
    SKIP=$((SKIP + 1))
}

log_info() {
    if [ "$VERBOSE" = true ]; then
        echo -e "  ${BLUE}ℹ${NC} $1"
    fi
}

log_section() {
    echo ""
    echo "── $1 ────────────────────────────────────"
}

log_header() {
    echo ""
    echo -e "${BLUE}$1${NC}"
}

# Check if container runtime is available
check_runtime() {
    if [ -z "$CONTAINER_RUNTIME" ]; then
        log_warn "No container runtime (podman/docker) found - DB checks will be skipped"
        return 1
    fi
    return 0
}

# Check if DB container is running
check_db_running() {
    local db_container="$1"
    if ! $CONTAINER_RUNTIME inspect "$db_container" &> /dev/null; then
        log_skip "$db_container container not running - skipping DB checks"
        return 1
    fi
    return 0
}

# Execute SQL query against OLTP DB
execute_oltp_query() {
    local query="$1"
    if ! check_runtime; then
        return 1
    fi
    if ! check_db_running "las-flores-postgres-oltp"; then
        return 1
    fi
    
    $CONTAINER_RUNTIME exec las-flores-postgres-oltp psql -U las_flores -d las_flores -tA -F '|' -c "$query" 2>/dev/null
}

# Execute SQL query against OLAP DB
execute_olap_query() {
    local query="$1"
    if ! check_runtime; then
        return 1
    fi
    if ! check_db_running "las-flores-postgres-olap"; then
        return 1
    fi
    
    $CONTAINER_RUNTIME exec las-flores-postgres-olap psql -U las_flores_analytics -d las_flores_analytics -tA -F '|' -c "$query" 2>/dev/null
}

# Execute command in server container
execute_in_server() {
    local cmd="$1"
    if ! check_runtime; then
        return 1
    fi
    if ! $CONTAINER_RUNTIME inspect las-flores-server &> /dev/null; then
        log_skip "las-flores-server container not running"
        return 1
    fi
    
    $CONTAINER_RUNTIME exec las-flores-server sh -c "$cmd" 2>/dev/null
}

# ============================================================================
# SHARED CHECKS (run after every milestone)
# ============================================================================

check_server_lint() {
    local label="Server lint"
    cd "$PROJECT_ROOT"
    
    if npm run lint --workspace=server > /dev/null 2>&1; then
        log_pass "$label: clean"
        return 0
    else
        log_fail "$label: has errors"
        return 1
    fi
}

check_server_build() {
    local label="Server build"
    cd "$PROJECT_ROOT"
    
    if npm run build --workspace=server > /dev/null 2>&1; then
        log_pass "$label: clean"
        return 0
    else
        log_fail "$label: has errors"
        return 1
    fi
}

check_server_tests() {
    local label="Server tests"
    cd "$PROJECT_ROOT"
    
    if npm run test --workspace=server > /dev/null 2>&1; then
        log_pass "$label: all green"
        return 0
    else
        log_fail "$label: has failures"
        return 1
    fi
}

run_per_milestone_checks() {
    log_section "Per-milestone minimum checks"
    
    check_server_lint
    check_server_build
    check_server_tests
}

# ============================================================================
# MILESTONE 01 CHECKS (colocation)
# ============================================================================

check_content_validation() {
    local label="Content validation"
    cd "$PROJECT_ROOT"
    
    if npm run validate:content > /dev/null 2>&1; then
        log_pass "$label: passes"
        return 0
    else
        log_fail "$label: has errors"
        return 1
    fi
}

check_content_migration() {
    local label="Content migration"
    cd "$PROJECT_ROOT"
    
    if npm run migrate > /dev/null 2>&1; then
        log_pass "$label: succeeds"
        return 0
    else
        log_fail "$label: has errors"
        return 1
    fi
}

check_character_lore_paths() {
    local label="Character lore paths"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! check_db_running "las-flores-postgres-oltp"; then
        log_skip "$label: DB not running"
        return 0
    fi
    
    # Get all characters with their lore_path
    local query="SELECT id, name, lore_path FROM characters WHERE lore_path IS NOT NULL;"
    local results=$(execute_oltp_query "$query")
    
    if [ -z "$results" ]; then
        log_skip "$label: no characters with lore_path"
        return 0
    fi
    
    local total=0
    local resolved=0
    
    while IFS='|' read -r id name lore_path; do
        # Skip empty lines
        [ -n "$id" ] || continue
        
        total=$((total + 1))
        
        # Extract directory from lore_path (remove .md extension and get parent)
        local yaml_dir="$PROJECT_ROOT/content/characters/${name}"
        local expected_file="$yaml_dir/${lore_path}"
        
        if [ -f "$expected_file" ]; then
            resolved=$((resolved + 1))
        else
            log_info "Character '$name': lore_path '$lore_path' not found at $expected_file"
        fi
    done <<< "$results"
    
    if [ $total -eq $resolved ]; then
        log_pass "$label: $resolved/$total resolved"
        return 0
    else
        log_fail "$label: $resolved/$total resolved"
        return 1
    fi
}

check_scene_lore_paths() {
    local label="Scene lore paths"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! check_db_running "las-flores-postgres-oltp"; then
        log_skip "$label: DB not running"
        return 0
    fi
    
    # Get all scenes with their lore_path
    local query="SELECT id, slug, lore_path FROM scenes WHERE lore_path IS NOT NULL;"
    local results=$(execute_oltp_query "$query")
    
    if [ -z "$results" ]; then
        log_skip "$label: no scenes with lore_path"
        return 0
    fi
    
    local total=0
    local resolved=0
    
    while IFS='|' read -r id slug lore_path; do
        # Skip empty lines
        [ -n "$id" ] || continue
        
        total=$((total + 1))
        
        local yaml_dir="$PROJECT_ROOT/content/scenes/${slug}"
        local expected_file="$yaml_dir/${lore_path}"
        
        if [ -f "$expected_file" ]; then
            resolved=$((resolved + 1))
        else
            log_info "Scene '$slug': lore_path '$lore_path' not found at $expected_file"
        fi
    done <<< "$results"
    
    if [ $total -eq $resolved ]; then
        log_pass "$label: $resolved/$total resolved"
        return 0
    else
        log_fail "$label: $resolved/$total resolved"
        return 1
    fi
}

check_old_lore_removed() {
    local label="Old lore removed"
    local old_lore_path="$PROJECT_ROOT/docs/lore/figures"
    
    if [ ! -d "$old_lore_path" ]; then
        log_pass "$label: docs/lore/figures/ absent"
        return 0
    fi
    
    local file_count=$(find "$old_lore_path" -type f 2>/dev/null | wc -l)
    
    if [ "${file_count:-0}" -eq 0 ]; then
        log_pass "$label: docs/lore/figures/ empty"
        return 0
    else
        log_fail "$label: docs/lore/figures/ has $file_count files"
        return 1
    fi
}

check_old_landmarks_removed() {
    local label="Old landmarks removed"
    local old_landmarks_path="$PROJECT_ROOT/docs/lore/districts"
    
    if [ ! -d "$old_landmarks_path" ]; then
        log_pass "$label: docs/lore/districts/ absent"
        return 0
    fi
    
    local file_count=$(find "$old_landmarks_path" -path '*/landmarks/*' -type f 2>/dev/null | wc -l)
    
    if [ "${file_count:-0}" -eq 0 ]; then
        log_pass "$label: docs/lore/districts/*/landmarks/ empty"
        return 0
    else
        log_fail "$label: docs/lore/districts/*/landmarks/ has $file_count files"
        return 1
    fi
}

run_milestone_01() {
    log_section "After Milestone 01 (colocation)"
    
    check_content_validation
    check_content_migration
    check_character_lore_paths
    check_scene_lore_paths
    check_old_lore_removed
    check_old_landmarks_removed
}

# ============================================================================
# MILESTONE 02 CHECKS (state machine)
# ============================================================================

check_migration_049() {
    local label="Migration 049"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! check_db_running "las-flores-postgres-oltp"; then
        log_skip "$label: DB not running"
        return 0
    fi
    
    local count=$(execute_oltp_query "SELECT COUNT(*) FROM schema_migrations WHERE version = '049';" | tr -d ' ')
    
    if [ "$count" = "1" ]; then
        log_pass "$label: applied"
        return 0
    else
        log_fail "$label: not applied (count=$count)"
        return 1
    fi
}

check_migration_050() {
    local label="Migration 050"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! check_db_running "las-flores-postgres-oltp"; then
        log_skip "$label: DB not running"
        return 0
    fi
    
    local count=$(execute_oltp_query "SELECT COUNT(*) FROM schema_migrations WHERE version = '050';" | tr -d ' ')
    
    if [ "$count" = "1" ]; then
        log_pass "$label: applied"
        return 0
    else
        log_fail "$label: not applied (count=$count)"
        return 1
    fi
}

check_content_plans_check() {
    local label="content_plans CHECK constraint"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! check_db_running "las-flores-postgres-oltp"; then
        log_skip "$label: DB not running"
        return 0
    fi
    
    local constraint_def=$(execute_oltp_query "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'content_plans_status_check';" | tr -d ' ')
    
    # Check if constraint allows 7 values (Draft, Proposed, Approved, Staged, Migrated, Verified, Failed)
    if echo "$constraint_def" | grep -q "CHECK.*IN"; then
        # Count the number of allowed values
        local value_count=$(echo "$constraint_def" | grep -oE "'[^']+'" | wc -l)
        if [ "${value_count:-0}" -ge 7 ]; then
            log_pass "$label: allows 7+ values"
            return 0
        else
            log_fail "$label: only allows $value_count values"
            return 1
        fi
    else
        log_fail "$label: CHECK constraint not found"
        return 1
    fi
}

check_verification_report_column() {
    local label="verification_report column"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! check_db_running "las-flores-postgres-oltp"; then
        log_skip "$label: DB not running"
        return 0
    fi
    
    local columns=$(execute_oltp_query "\d content_plans" | grep -o "verification_report")
    
    if [ -n "$columns" ]; then
        log_pass "$label: exists"
        return 0
    else
        log_fail "$label: missing"
        return 1
    fi
}

run_milestone_02() {
    log_section "After Milestone 02 (state machine)"
    
    check_migration_049
    check_migration_050
    check_content_plans_check
    check_verification_report_column
}

# ============================================================================
# MILESTONE 03 CHECKS (local drafts)
# ============================================================================

check_no_drafts_subfolder() {
    local label="No assets/drafts subfolder"
    
    local drafts_count=$(find "$PROJECT_ROOT/content" -path '*/assets/drafts' -type d 2>/dev/null | wc -l)
    
    if [ "${drafts_count:-0}" -eq 0 ]; then
        log_pass "$label: no drafts subfolders found"
        return 0
    else
        log_fail "$label: found $drafts_count drafts subfolders"
        return 1
    fi
}

check_asset_bases_clean() {
    local label="asset_bases table clean"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! check_db_running "las-flores-postgres-oltp"; then
        log_skip "$label: DB not running"
        return 0
    fi
    
    # This is informational - we just report the count
    local count=$(execute_oltp_query "SELECT COUNT(*) FROM asset_bases;" | tr -d ' ')
    
    log_pass "$label: has $count rows (informational)"
    return 0
}

run_milestone_03() {
    log_section "After Milestone 03 (local drafts)"
    
    check_no_drafts_subfolder
    check_asset_bases_clean
}

# ============================================================================
# MILESTONE 04 CHECKS (approve & solidify)
# ============================================================================

check_minio_object_naming() {
    local label="MinIO object naming"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! $CONTAINER_RUNTIME inspect las-flores-minio &> /dev/null; then
        log_skip "$label: MinIO container not running"
        return 0
    fi
    
    # Use mc (MinIO client) to list objects
    if ! command -v mc &> /dev/null; then
        log_skip "$label: mc (MinIO client) not installed"
        return 0
    fi
    
    # Check for objects with .dev or .staging suffix
    local mc_output
    mc_output=$(mc ls "${MINIO_BUCKET}/" 2>/dev/null) || { log_fail "$label: mc ls failed"; return 1; }
    local objects_with_suffix
    objects_with_suffix=$(echo "$mc_output" | grep -cE '\.(dev|staging)\.png$')
    
    if [ "${objects_with_suffix:-0}" -eq 0 ]; then
        log_pass "$label: no objects with .dev/.staging suffix"
        return 0
    else
        log_fail "$label: found $objects_with_suffix objects with .dev/.staging suffix"
        return 1
    fi
}

check_portrait_urls_dev_label() {
    local label="portrait_urls dev label"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! check_db_running "las-flores-postgres-oltp"; then
        log_skip "$label: DB not running"
        return 0
    fi
    
    # Check if any character has portrait_urls with label: 'dev'
    local count=$(execute_oltp_query "SELECT COUNT(*) FROM characters WHERE portrait_urls IS NOT NULL AND jsonb_path_exists(portrait_urls, '\$[*].label ? (@ == \"dev\")');" | tr -d ' ')
    
    # Ensure count is a number
    count=${count:-0}
    
    if [ "$count" -gt 0 ]; then
        log_pass "$label: found $count characters with dev label"
        return 0
    else
        log_warn "$label: no characters with dev label (may be expected)"
        return 0
    fi
}

check_yaml_asset_paths_local() {
    local label="YAML asset_paths local filenames"
    
    local yaml_files=$(find "$PROJECT_ROOT/content/characters" -name "char_*.yaml" 2>/dev/null)
    local has_http=0
    local total=0
    
    for yaml_file in $yaml_files; do
        total=$((total + 1))
        if grep -q "asset_paths:" "$yaml_file" && grep -q "http" "$yaml_file"; then
            has_http=$((has_http + 1))
            log_info "HTTP URL found in $yaml_file"
        fi
    done
    
    if [ "${has_http:-0}" -eq 0 ]; then
        log_pass "$label: no HTTP URLs in asset_paths"
        return 0
    else
        log_fail "$label: found $has_http YAML files with HTTP URLs in asset_paths"
        return 1
    fi
}

run_milestone_04() {
    log_section "After Milestone 04 (approve & solidify)"
    
    check_minio_object_naming
    check_portrait_urls_dev_label
    check_yaml_asset_paths_local
}

# ============================================================================
# MILESTONE 05 CHECKS (verification)
# ============================================================================

check_verification_checks_exist() {
    local label="Verification checks exist"
    local service_file="$PROJECT_ROOT/server/src/services/PlanVerificationService.ts"
    
    if [ ! -f "$service_file" ]; then
        log_fail "$label: PlanVerificationService.ts not found"
        return 1
    fi
    
    local required_checks=(
        "lore-path-resolution"
        "narrative-path-resolution"
        "asset-path-resolution"
        "fk-integrity"
        "story-beat-references"
        "cross-plan-consistency"
        "asset-need-status"
    )
    
    local missing=0
    
    for check_name in "${required_checks[@]}"; do
        if ! grep -q "$check_name" "$service_file"; then
            log_info "Missing check: $check_name"
            missing=$((missing + 1))
        fi
    done
    
    if [ "${missing:-0}" -eq 0 ]; then
        log_pass "$label: all 7 check names found"
        return 0
    else
        log_fail "$label: $missing check names missing"
        return 1
    fi
}

run_milestone_05() {
    log_section "After Milestone 05 (verification)"
    
    check_verification_checks_exist
}

# ============================================================================
# MILESTONE 06 CHECKS (MinIO env stages)
# ============================================================================

check_promotion_endpoints_exist() {
    local label="Promotion endpoints exist"
    local routes_dir="$PROJECT_ROOT/server/src/routes"
    
    local required_endpoints=(
        "promote-staging"
        "promote-production"
        "rollback-staging"
    )
    
    local missing=0
    
    for endpoint in "${required_endpoints[@]}"; do
        if ! grep -rq "$endpoint" "$routes_dir" 2>/dev/null; then
            log_info "Missing endpoint: $endpoint"
            missing=$((missing + 1))
        fi
    done
    
    if [ "${missing:-0}" -eq 0 ]; then
        log_pass "$label: all 3 endpoints found"
        return 0
    else
        log_fail "$label: $missing endpoints missing"
        return 1
    fi
}

check_asset_promotion_page() {
    local label="Asset promotion page"
    local page_file="$PROJECT_ROOT/admin/src/app/asset-promotion/page.tsx"
    
    if [ -f "$page_file" ]; then
        log_pass "$label: exists"
        return 0
    else
        log_fail "$label: not found"
        return 1
    fi
}

run_milestone_06() {
    log_section "After Milestone 06 (MinIO env stages)"
    
    check_promotion_endpoints_exist
    check_asset_promotion_page
}

# ============================================================================
# MILESTONE 07 CHECKS (server cascade)
# ============================================================================

check_asset_stage_resolver() {
    local label="AssetStageResolver"
    local resolver_file="$PROJECT_ROOT/server/src/services/AssetStageResolver.ts"
    
    if [ ! -f "$resolver_file" ]; then
        log_fail "$label: not found"
        return 1
    fi
    
    if grep -q "STAGE_PRIORITY" "$resolver_file"; then
        log_pass "$label: exists with cascade logic"
        return 0
    else
        log_fail "$label: missing STAGE_PRIORITY constant"
        return 1
    fi
}

check_migration_051() {
    local label="Migration 051"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! check_db_running "las-flores-postgres-oltp"; then
        log_skip "$label: DB not running"
        return 0
    fi
    
    local count=$(execute_oltp_query "SELECT COUNT(*) FROM schema_migrations WHERE version = '051';" | tr -d ' ')
    
    if [ "$count" = "1" ]; then
        log_pass "$label: applied"
        return 0
    else
        log_fail "$label: not applied (count=$count)"
        return 1
    fi
}

check_scene_background_urls() {
    local label="Scene background_urls columns"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! check_db_running "las-flores-postgres-oltp"; then
        log_skip "$label: DB not running"
        return 0
    fi
    
    local has_background_urls=0
    local has_image_urls=0
    if execute_oltp_query "SELECT 1 FROM information_schema.columns WHERE table_name = 'scenes' AND column_name = 'background_urls'" 2>/dev/null | grep -q 1; then
        has_background_urls=1
    fi
    if execute_oltp_query "SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'image_urls'" 2>/dev/null | grep -q 1; then
        has_image_urls=1
    fi

    if [ "$has_background_urls" -eq 1 ] && [ "$has_image_urls" -eq 1 ]; then
        log_pass "$label: scenes.background_urls and locations.image_urls exist"
        return 0
    else
        local missing=""
        [ "$has_background_urls" -eq 0 ] && missing="scenes.background_urls"
        [ "$has_image_urls" -eq 0 ] && missing="$missing locations.image_urls"
        log_fail "$label: missing:$missing"
        return 1
    fi
}

check_client_not_modified() {
    local label="Client not modified"
    
    local changes
    changes=$(git diff --name-only "${BASE_REF:-origin/main}...HEAD" -- client/ 2>/dev/null | wc -l)
    
    if [ "${changes:-0}" -eq 0 ]; then
        log_pass "$label: no client changes"
        return 0
    else
        # This is informational - we still pass but report
        log_warn "$label: $changes client files modified (informational)"
        return 0
    fi
}

run_milestone_07() {
    log_section "After Milestone 07 (server cascade)"
    
    check_asset_stage_resolver
    check_migration_051
    check_scene_background_urls
    check_client_not_modified
}

# ============================================================================
# MILESTONE 08 CHECKS (admin UI)
# ============================================================================

check_story_builder_page() {
    local label="Story builder page"
    local page_file="$PROJECT_ROOT/admin/src/app/story-builder/page.tsx"
    
    if [ -f "$page_file" ]; then
        log_pass "$label: exists"
        return 0
    else
        log_fail "$label: not found"
        return 1
    fi
}

check_asset_promotion_page_m08() {
    local label="Asset promotion page"
    local page_file="$PROJECT_ROOT/admin/src/app/asset-promotion/page.tsx"
    
    if [ -f "$page_file" ]; then
        log_pass "$label: exists"
        return 0
    else
        log_fail "$label: not found"
        return 1
    fi
}

check_dashboard_links() {
    local label="Dashboard links"
    local dashboard_file="$PROJECT_ROOT/admin/src/app/page.tsx"
    
    if [ -f "$dashboard_file" ] && grep -q "asset-promotion" "$dashboard_file"; then
        log_pass "$label: contains /asset-promotion link"
        return 0
    else
        log_fail "$label: missing /asset-promotion link"
        return 1
    fi
}

run_milestone_08() {
    log_section "After Milestone 08 (admin UI)"
    
    check_story_builder_page
    check_asset_promotion_page_m08
    check_dashboard_links
}

# ============================================================================
# E2E SMOKE TEST
# ============================================================================

check_e2e_health() {
    local label="Server health"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! $CONTAINER_RUNTIME inspect las-flores-server &> /dev/null; then
        log_skip "$label: server container not running"
        return 0
    fi
    
    local health=$(execute_in_server "wget -qO- http://localhost:3000/health")
    
    if echo "$health" | grep -q '"success":true'; then
        log_pass "$label: healthy"
        return 0
    else
        log_fail "$label: not healthy"
        return 1
    fi
}

check_e2e_characters_api() {
    local label="Characters API"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! $CONTAINER_RUNTIME inspect las-flores-server &> /dev/null; then
        log_skip "$label: server container not running"
        return 0
    fi
    
    # Use curl from within the container, capture HTTP status
    local http_response
    http_response=$(execute_in_server "curl -s -w '\n%{http_code}' http://localhost:3000/api/characters | tail -1")
    local http_code="${http_response:-0}"

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
        log_pass "$label: HTTP $http_code"
        return 0
    else
        log_fail "$label: HTTP $http_code"
        return 1
    fi
}

check_e2e_scenes_api() {
    local label="Scenes API"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! $CONTAINER_RUNTIME inspect las-flores-server &> /dev/null; then
        log_skip "$label: server container not running"
        return 0
    fi
    
    local http_response
    http_response=$(execute_in_server "curl -s -w '\n%{http_code}' http://localhost:3000/api/scenes | tail -1")
    local http_code="${http_response:-0}"

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
        log_pass "$label: HTTP $http_code"
        return 0
    else
        log_fail "$label: HTTP $http_code"
        return 1
    fi
}

check_e2e_portrait_resolution() {
    local label="Portrait URL resolution"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! $CONTAINER_RUNTIME inspect las-flores-server &> /dev/null; then
        log_skip "$label: server container not running"
        return 0
    fi
    
    # Get a scene with NPCs
    local scene_id=$(execute_oltp_query "SELECT id FROM scenes WHERE metadata->>'npcs' IS NOT NULL LIMIT 1;" | tr -d ' ')
    
    if [ -z "$scene_id" ]; then
        log_skip "$label: no scenes with NPCs found"
        return 0
    fi
    
    local response=$(execute_in_server "curl -s http://localhost:3000/api/scene/$scene_id")
    
    if echo "$response" | grep -q "portraitUrl"; then
        log_pass "$label: portraitUrl resolved"
        return 0
    else
        log_fail "$label: portraitUrl not found in response"
        return 1
    fi
}

check_e2e_admin_health() {
    local label="Admin panel health"

    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi

    if ! $CONTAINER_RUNTIME inspect las-flores-admin &> /dev/null; then
        log_skip "$label: admin container not running"
        return 0
    fi

    local http_response
    http_response=$($CONTAINER_RUNTIME exec las-flores-admin sh -c "wget -qO- --server-response http://localhost:3002/ 2>&1 | head -5" 2>/dev/null || echo "")

    if echo "$http_response" | grep -q "200\|301\|302"; then
        log_pass "$label: responds"
        return 0
    else
        log_fail "$label: no response"
        return 1
    fi
}

check_e2e_promotion_status() {
    local label="Promotion status endpoint"
    
    if ! check_runtime; then
        log_skip "$label: container runtime not available"
        return 0
    fi
    
    if ! $CONTAINER_RUNTIME inspect las-flores-server &> /dev/null; then
        log_skip "$label: server container not running"
        return 0
    fi
    
    local http_response
    http_response=$(execute_in_server "curl -s -w '\n%{http_code}' http://localhost:3000/admin/content/assets/promotion-status | tail -1")
    local http_code="${http_response:-0}"

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
        log_pass "$label: HTTP $http_code"
        return 0
    else
        log_fail "$label: HTTP $http_code"
        return 1
    fi
}

run_e2e_smoke() {
    log_section "End-to-end smoke test"
    
    check_e2e_health
    check_e2e_characters_api
    check_e2e_scenes_api
    check_e2e_portrait_resolution
    check_e2e_admin_health
    check_e2e_promotion_status
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

print_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --milestone NN    Run checks for a specific milestone (01-08)"
    echo "  --all             Run all per-milestone checks + E2E smoke test (default)"
    echo "  --e2e             Run only the end-to-end smoke test"
    echo "  --minio-bucket B  MinIO bucket name (default: las-flores)"
    echo "  -v, --verbose     Show additional detail for passing checks"
    echo "  -h, --help        Show help"
    echo ""
    echo "Examples:"
    echo "  $0 --milestone 01"
    echo "  $0 --e2e"
    echo "  $0 --all"
}

print_summary() {
    echo ""
    log_header "── Summary ────────────────────────────────────"
    echo -e "  ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN warnings${NC}, ${CYAN}$SKIP skipped${NC}"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --milestone)
            [ $# -ge 2 ] || { echo "Missing value for --milestone" >&2; exit 1; }
            MILESTONE="$2"
            shift 2
            ;;
        --all)
            RUN_ALL=true
            shift
            ;;
        --e2e)
            RUN_E2E_ONLY=true
            shift
            ;;
        --minio-bucket)
            [ $# -ge 2 ] || { echo "Missing value for --minio-bucket" >&2; exit 1; }
            MINIO_BUCKET="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            print_help
            exit 1
            ;;
    esac
done

# Auto-detect container runtime
detect_container_runtime

# Print header
echo -e "${BLUE}"
echo "Las Flores 2077 — Milestone 99 Validation"
echo "=========================================="
echo -e "${NC}"

# Determine what to run
if [ -n "$RUN_E2E_ONLY" ]; then
    run_e2e_smoke
    print_summary
    exit $((FAIL > 0 ? 1 : 0))
fi

if [ -n "$MILESTONE" ]; then
    # Validate milestone number
    if [[ "$MILESTONE" =~ ^0[1-8]$ ]]; then
        run_per_milestone_checks
        
        case "$MILESTONE" in
            01) run_milestone_01 ;;
            02) run_milestone_02 ;;
            03) run_milestone_03 ;;
            04) run_milestone_04 ;;
            05) run_milestone_05 ;;
            06) run_milestone_06 ;;
            07) run_milestone_07 ;;
            08) run_milestone_08 ;;
        esac
        
        print_summary
        exit $((FAIL > 0 ? 1 : 0))
    else
        echo "Invalid milestone number: $MILESTONE (must be 01-08)"
        exit 1
    fi
fi

# Default: run all checks
if [ -n "$RUN_ALL" ] || [ $# -eq 0 ]; then
    # Run per-milestone checks first
    run_per_milestone_checks
    
    # Run all milestone-specific checks
    run_milestone_01
    run_milestone_02
    run_milestone_03
    run_milestone_04
    run_milestone_05
    run_milestone_06
    run_milestone_07
    run_milestone_08
    
    # Run E2E smoke test
    run_e2e_smoke
    
    print_summary
    exit $((FAIL > 0 ? 1 : 0))
fi
