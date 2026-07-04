#!/bin/bash
#
# dev-cleanup.sh - Find and clean development artifacts
#
# Usage:
#   ./dev-cleanup.sh [--dry-run] [--categories cat1,cat2,...] [--help]
#
# Examples:
#   ./dev-cleanup.sh                     # Scan and report
#   ./dev-cleanup.sh --dry-run           # Show what would be removed
#   ./dev-cleanup.sh --categories temp,task   # Only check temp and task refs
#   ./dev-cleanup.sh --delete            # Actually delete found files
#
set -e

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=true
CATEGORIES=""
DELETE_FILES=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Find and help clean up development artifacts from the repository.

Options:
    --dry-run           Show what would be found/deleted (default)
    --delete            Actually delete found files (requires confirmation)
    --categories CATS   Comma-separated categories to scan (default: all)
    --help, -h          Show this help message

Categories:
    temp        - Temporary files (FIX_*, VERIFY_*, *_FIX.md, etc.)
    task        - Task references (task 1.x, task 2.x, etc.)
    debug       - Debug scripts and test files (test_*.sh, verify_*.sh)
    build       - Build artifacts (.next, dist, node_modules check)
    ide         - IDE-specific files (.idea, .vscode, *.swp)

Examples:
    $(basename "$0")                          # Scan and report
    $(basename "$0") --dry-run                # Show what would be removed
    $(basename "$0") --categories temp,debug  # Only scan temp and debug files
    $(basename "$0") --delete                 # Delete found files (with confirm)

EOF
    exit 0
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${CYAN}=== $1 ===${NC}"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            usage
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --delete)
            DELETE_FILES=true
            DRY_RUN=false
            shift
            ;;
        --categories)
            CATEGORIES="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Development Artifacts Cleanup${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "Project: $PROJECT_ROOT"
echo "Mode: $([ "$DRY_RUN" == "true" ] && echo "Dry Run" || echo "Delete")"

# Helper function to find files
find_files() {
    local pattern="$1"
    local description="$2"
    local files

    files=$(find "$PROJECT_ROOT" -type f \( -name "*.md" -o -name "*.txt" -o -name "*.sh" \) \
        -exec grep -l -i "$pattern" {} \; 2>/dev/null || true)

    if [[ -n "$files" ]]; then
        log_section "$description"
        echo "$files" | while IFS= read -r file; do
            # Make path relative to project root
            rel_path="${file#$PROJECT_ROOT/}"
            echo "  - $rel_path"
        done
        return 0
    fi
    return 1
}

# Track findings
declare -A findings
total_files=0

# Check if a category should be scanned
should_scan() {
    local cat="$1"
    if [[ -z "$CATEGORIES" ]]; then
        return 0
    fi
    IFS=',' read -ra CATS <<< "$CATEGORIES"
    for c in "${CATS[@]}"; do
        if [[ "$c" == "$cat" ]]; then
            return 0
        fi
    done
    return 1
}

# Category: Temporary documentation files
scan_temp() {
    if ! should_scan "temp"; then
        return
    fi

    log_section "Temporary Documentation"

    local patterns=("FIX_" "VERIFY_" "COMPLETE" "SUMMARY" "CLEANUP_")
    local found=0

    for pattern in "${patterns[@]}"; do
        while IFS= read -r file; do
            rel_path="${file#$PROJECT_ROOT/}"
            echo "  - $rel_path"
            ((total_files++))
            found=1
        done < <(find "$PROJECT_ROOT" -maxdepth 1 -type f -name "*${pattern}*" 2>/dev/null || true)
    done

    if [[ $found -eq 0 ]]; then
        echo "  (none found)"
    fi
}

# Category: Task references in files
scan_task() {
    if ! should_scan "task"; then
        return
    fi

    log_section "Task References in Files"
    local found=0

    while IFS= read -r file; do
        rel_path="${file#$PROJECT_ROOT/}"
        # Find which tasks are referenced
        tasks=$(grep -hi "task [0-9]" "$file" | sort -u | head -3 | sed 's/^/    /')
        if [[ -n "$tasks" ]]; then
            echo "  $rel_path"
            echo "$tasks"
            ((total_files++))
            found=1
        fi
    done < <(find "$PROJECT_ROOT" -type f \( -name "*.md" -o -name "*.ts" -o -name "*.js" \) \
        -exec grep -l -i "task [0-9]" {} \; 2>/dev/null || true)

    if [[ $found -eq 0 ]]; then
        echo "  (none found)"
    fi
}

# Category: Debug/Test scripts
scan_debug() {
    if ! should_scan "debug"; then
        return
    fi

    log_section "Debug/Test Scripts"

    local patterns=("test_*.sh" "verify_*.sh" "debug_*.sh")
    local found=0

    for pattern in "${patterns[@]}"; do
        while IFS= read -r file; do
            rel_path="${file#$PROJECT_ROOT/}"
            echo "  - $rel_path"
            ((total_files++))
            found=1
        done < <(find "$PROJECT_ROOT" -maxdepth 1 -type f -name "$pattern" 2>/dev/null || true)
    done

    if [[ $found -eq 0 ]]; then
        echo "  (none found)"
    fi
}

# Category: Build artifacts
scan_build() {
    if ! should_scan "build"; then
        return
    fi

    log_section "Build Artifacts (info only)"

    local artifacts=(
        "$PROJECT_ROOT/.next"
        "$PROJECT_ROOT/server/dist"
        "$PROJECT_ROOT/client/dist"
        "$PROJECT_ROOT/admin/.next"
    )

    for artifact in "${artifacts[@]}"; do
        if [[ -d "$artifact" ]]; then
            rel_path="${artifact#$PROJECT_ROOT/}"
            echo "  - $rel_path/ (directory)"
        fi
    done

    # Check node_modules (informational only)
    local node_modules=(
        "$PROJECT_ROOT/node_modules"
        "$PROJECT_ROOT/server/node_modules"
        "$PROJECT_ROOT/client/node_modules"
        "$PROJECT_ROOT/admin/node_modules"
    )

    for nm in "${node_modules[@]}"; do
        if [[ -d "$nm" ]]; then
            rel_path="${nm#$PROJECT_ROOT/}"
            echo "  - $rel_path/ (node_modules - do NOT delete)"
        fi
    done

    echo ""
    echo "  Note: Build artifacts and node_modules are intentionally NOT"
    echo "  counted for deletion. They are development dependencies."
}

# Category: IDE files
scan_ide() {
    if ! should_scan "ide"; then
        return
    fi

    log_section "IDE-Specific Files"

    local patterns=(".idea" ".vscode" "*.swp" "*.swo")
    local found=0

    for pattern in "${patterns[@]}"; do
        while IFS= read -r file; do
            rel_path="${file#$PROJECT_ROOT/}"
            echo "  - $rel_path"
            ((total_files++))
            found=1
        done < <(find "$PROJECT_ROOT" -maxdepth 1 -type d -name "$pattern" 2>/dev/null || true)
    done

    if [[ $found -eq 0 ]]; then
        echo "  (none found)"
    fi
}

# Run all scans
scan_temp
scan_task
scan_debug
scan_build
scan_ide

# Summary
log_section "Summary"
echo "Total files found: $total_files"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}This was a dry run. No files were deleted.${NC}"
    echo ""
    echo "To actually delete these files, run:"
    echo "  $0 --delete"
else
    echo -e "${GREEN}Files have been processed.${NC}"
    if [[ $total_files -gt 0 ]]; then
        echo ""
        echo "Note: Only temporary and debug files were considered for deletion."
        echo "Build artifacts and node_modules are preserved."
    fi
fi

echo ""
echo -e "${CYAN}========================================${NC}"