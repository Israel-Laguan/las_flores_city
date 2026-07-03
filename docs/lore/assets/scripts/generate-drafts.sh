#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Derive project root deterministically:
# This script lives in docs/lore/assets/scripts, so repo root is 4 levels up.
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
PROMPT_ROOT="$ROOT/docs/lore/assets/ui-concepts"
JS_SCRIPT="$SCRIPT_DIR/generate-pollinations-drafts.mjs"
NIM_SCRIPT="$SCRIPT_DIR/generate-nim-drafts.mjs"
STATE_FILE="$SCRIPT_DIR/generate-drafts-state.tsv"
DRAFTS_DIR="drafts"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
header() { echo -e "\n${BLUE}${BOLD}══► $1${NC}"; }
ok()     { echo -e "  ${GREEN}✓${NC} $1"; }
warn()   { echo -e "  ${YELLOW}!${NC} $1"; }
fail()   { echo -e "  ${RED}✗${NC} $1"; }

function build_manifest() {
  local prompt_files
  prompt_files=$(find "$PROMPT_ROOT" -name '*.prompt.md' | sort)

  while IFS= read -r pf; do
    [[ -z "$pf" ]] && continue
    local rel="${pf#"$PROMPT_ROOT"/}"
    local type
    type=$(sed -n 's/.*\*\*Type:\*\*[[:space:]]*\([^[:space:]]*\).*/\1/p' "$pf" | head -1 | tr '[:upper:]' '[:lower:]')
    local dim_line
    dim_line=$(sed -n 's/.*\*\*Dimensions:\*\*[[:space:]]*\([0-9xX×]*\).*/\1/p' "$pf" | head -1)
    local w h
    w=$(echo "$dim_line" | tr -cs '0-9' ' ' | cut -d' ' -f1)
    h=$(echo "$dim_line" | tr -cs '0-9' ' ' | cut -d' ' -f2)

    case "$type" in
      tile|overlay|phaser-sprite) w=${w:-512}; h=${h:-512} ;;
      background|html-background)  w=${w:-1280}; h=${h:-720} ;;
      portrait)                     w=${w:-512}; h=${h:-768} ;;
      phone-wallpaper)              w=${w:-1080}; h=${h:-1920} ;;
      app-icon)                     w=${w:-128}; h=${h:-128} ;;
      *)                            w=${w:-512}; h=${h:-512} ;;
    esac
    local variants
    variants=$(sed -n 's/^## Prompt — \(.*\)/\1/p' "$pf" | sed 's/[[:space:]]*$//')
    while IFS= read -r variant; do
      [[ -z "$variant" ]] && continue
      printf "%s\t%s\t%s\t%s\n" "$rel" "$variant" "$w" "$h"
    done <<< "$variants"
  done <<< "$prompt_files"
}

function cmd_init() {
  header "Initializing draft state..."
  rm -f "$STATE_FILE"
  printf "prompt_rel\tvariant\tw\th\tdraft_path\tsize_bytes\tstatus\tupdated_at\n" > "$STATE_FILE"
  local count=0 completed=0 pending=0
  while IFS=$'\t' read -r rel variant w h; do
    [[ -z "$rel" ]] && continue
    count=$((count+1))
    local base
    base=$(basename "$rel" .prompt.md)
    local slug
    slug=$(echo "$variant" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g' | sed 's/^_\|_$//g')
    local draft_path_rel="$(dirname "$rel")/$DRAFTS_DIR/${base}__${slug}.png"
    local draft_path_abs="$PROMPT_ROOT/$draft_path_rel"
    local size=0
    if [[ -f "$draft_path_abs" ]]; then
      size=$(stat -c%s "$draft_path_abs" 2>/dev/null || stat -f%z "$draft_path_abs" 2>/dev/null || echo 0)
    fi
    local status="pending"
    if [[ "$size" -ge 5000 ]]; then status="completed"; completed=$((completed+1)); else pending=$((pending+1)); fi
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$rel" "$variant" "$w" "$h" "$draft_path_rel" "$size" "$status" "$(date -Iseconds)" >> "$STATE_FILE"
  done < <(build_manifest)

  echo -e "  Total variants: ${BOLD}$count${NC}"
  echo -e "  ${GREEN}Completed: $completed${NC}"
  echo -e "  ${YELLOW}Pending:   $pending${NC}"
  ok "State → $STATE_FILE"
}

function cmd_status() {
  header "Draft generation status"
  if [[ ! -f "$STATE_FILE" ]]; then warn "No state file. Run: $0 init"; return; fi
  local t=0 c=0 p=0 f=0
  while IFS=$'\t' read -r _rel _var _w _h _dp _size status _ts; do
    [[ "$_rel" == "prompt_rel" ]] && continue
    t=$((t+1)); case "$status" in completed) c=$((c+1));; pending) p=$((p+1));; failed) f=$((f+1));; *) echo "DEBUG: unknown status '$status' for $_rel";; esac
  done < "$STATE_FILE"
  echo -e "  Total: ${BOLD}$t${NC}  ${GREEN}Completed: $c${NC}  ${YELLOW}Pending: $p${NC}  ${RED}Failed: $f${NC}"
  [[ $t -gt 0 ]] && echo -e "  Progress: ${BOLD}${GREEN}$c${NC}/${t} ($(( (c+f)*100/t ))%)"
}

function cmd_run() {
  header "Running Draft Generator (NIM → Pollinations fallback)"
  echo -e "  ${CYAN}Delay: 30s between requests per provider${NC}"
  echo -e "  ${CYAN}Filter:${NC} $*"

  header "Step 1: NVIDIA NIM (FLUX.2 Klein)"
  if [[ -f "$NIM_SCRIPT" ]]; then
    node "$NIM_SCRIPT" "$@" || true
  else
    warn "NIM script not found: $NIM_SCRIPT — skipping to Pollinations"
  fi

  header "Step 2: Pollinations (fallback)"
  echo -e "  ${CYAN}Filter:${NC} $*"
  node "$JS_SCRIPT" "$@"
  echo ""
  header "Updating state..."
  if [[ -f "$STATE_FILE" ]]; then
    local tmp; tmp=$(mktemp)
    printf "prompt_rel\tvariant\tw\th\tdraft_path\tsize_bytes\tstatus\tupdated_at\n" > "$tmp"
    while IFS=$'\t' read -r rel var w h dp_rel size status; do
      [[ "$rel" == "prompt_rel" ]] && continue
      local abs="$PROMPT_ROOT/$dp_rel"
      if [[ -f "$abs" ]]; then
        local sz; sz=$(stat -c%s "$abs" 2>/dev/null || stat -f%z "$abs" 2>/dev/null || echo 0)
        if [[ "$sz" -ge 5000 ]]; then
          printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$rel" "$var" "$w" "$h" "$dp_rel" "$sz" "completed" "$(date -Iseconds)" >> "$tmp"
          continue
        fi
      fi
      printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$rel" "$var" "$w" "$h" "$dp_rel" "$size" "pending" "$(date -Iseconds)" >> "$tmp"
    done < "$STATE_FILE"
    mv "$tmp" "$STATE_FILE"
  fi
  ok "State updated"
}

function cmd_list_failed() {
  header "Failed variants"
  [[ ! -f "$STATE_FILE" ]] && { warn "No state file. Run: $0 init"; return; }
  local found=0
  while IFS=$'\t' read -r rel var _w _h _dp _size status _ts; do
    [[ "$rel" == "prompt_rel" ]] && continue
    if [[ "$status" == "failed" ]]; then fail "$rel [$var]"; found=$((found+1)); fi
  done < "$STATE_FILE"
  [[ $found -eq 0 ]] && ok "No failures"
}

function cmd_retry() {
  header "Retrying failed / pending items"
  echo -e "  ${CYAN}Passing args to JS: $*${NC}"
  if [[ -f "$STATE_FILE" ]]; then
    while IFS=$'\t' read -r rel var _w _h dp_rel _size status _ts; do
      [[ "$rel" == "prompt_rel" ]] && continue
      if [[ "$status" == "failed" ]]; then
        local abs="$PROMPT_ROOT/$dp_rel"
        [[ -f "$abs" ]] && rm -f "$abs" && echo -e "  ${YELLOW}Cleaned${NC} $(basename "$abs")"
      fi
    done < "$STATE_FILE"
  fi
  cmd_run "$@"
}

function cmd_clean() {
  header "Cleaning corrupt small files (< 5KB)"
  local cleaned=0
  while IFS= read -r f; do
    local sz; sz=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)
    if [[ "$sz" -lt 5000 ]]; then rm -f "$f"; fail "$(basename "$f") (${sz} bytes)"; cleaned=$((cleaned+1)); fi
  done < <(find "$PROMPT_ROOT" -path "*/$DRAFTS_DIR/*.png" -type f)
  if [[ $cleaned -eq 0 ]]; then
    ok "Nothing to clean"
  else
    warn "Removed $cleaned files"
  fi
}

function cmd_reset() {
  header "Resetting all to pending"
  if [[ -f "$STATE_FILE" ]]; then
    local tmp; tmp=$(mktemp)
    printf "prompt_rel\tvariant\tw\th\tdraft_path\tsize_bytes\tstatus\tupdated_at\n" > "$tmp"
    while IFS=$'\t' read -r rel var w h dp_rel _size _ts; do
      [[ "$rel" == "prompt_rel" ]] && continue
      printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$rel" "$var" "$w" "$h" "$dp_rel" "0" "pending" "$(date -Iseconds)" >> "$tmp"
    done < "$STATE_FILE"
    mv "$tmp" "$STATE_FILE"
    ok "All reset to pending"
  else warn "No state file. Run: $0 init"; fi
}

echo -e "${BLUE}${BOLD}
  ╔════════════════════════════════════════════════════╗
  ║   Draft Generator (NIM primary + Pollinations FB)  ║
  ╚════════════════════════════════════════════════════╝${NC}"
if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <command> [options]"
  echo ""
  echo "Commands:"
  echo "  init              Initialize state from prompt files"
  echo "  run [opts]        Generate pending via NIM → Pollinations fallback"
  echo "  status            Show progress summary"
  echo "  list-failed       List failed variants"
  echo "  retry [opts]      Delete failed drafts and regenerate"
  echo "  clean             Remove corrupt small files (< 5KB)"
  echo "  reset             Set all variants back to pending"
  exit 0
fi
CMD="$1"; shift || true
case "$CMD" in
  init) cmd_init "$@" ;;
  run) cmd_run "$@" ;;
  status) cmd_status "$@" ;;
  list-failed) cmd_list_failed "$@" ;;
  retry) cmd_retry "$@" ;;
  clean) cmd_clean ;;
  reset) cmd_reset ;;
  -h|--help|help)
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  init              Initialize state from prompt files"
    echo "  run [opts]        Generate pending via NIM → Pollinations fallback"
    echo "  status            Show progress summary"
    echo "  list-failed       List failed variants"
    echo "  retry [opts]      Delete failed drafts and regenerate"
    echo "  clean             Remove corrupt small files (< 5KB)"
    echo "  reset             Set all variants back to pending"
    ;;
  *) fail "Unknown command: $CMD"; echo "Run: $0 --help"; exit 1 ;;
esac

