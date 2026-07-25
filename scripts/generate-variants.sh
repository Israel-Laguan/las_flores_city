#!/usr/bin/env bash
set -euo pipefail

# generate-variants.sh — Generate image-to-image variants using akool-cli
#
# Reads variant definitions from .prompt.md files and runs akool-cli
# image-to-image generation against a base image URL.
#
# Usage:
#   ./scripts/generate-variants.sh <entity_dir>                    # all variants
#   ./scripts/generate-variants.sh <entity_dir> --variant <slug>   # single variant
#   ./scripts/generate-variants.sh <entity_dir> --dry-run          # preview only
#   ./scripts/generate-variants.sh --all --filter characters       # all characters
#   ./scripts/generate-variants.sh --all --filter locations        # all locations

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

header() { echo -e "\n${BLUE}${BOLD}══► $1${NC}"; }
ok()     { echo -e "  ${GREEN}✓${NC} $1"; }
warn()   { echo -e "  ${YELLOW}!${NC} $1"; }
fail()   { echo -e "  ${RED}✗${NC} $1"; }

# ── Parse arguments ────────────────────────────────────────────────────────

DRY_RUN=false
VARIANT_SLUG=""
ENTITY_DIR=""
FILTER_TYPE=""
RUN_ALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)    DRY_RUN=true; shift ;;
    --variant)    VARIANT_SLUG="$2"; shift 2 ;;
    --filter)     FILTER_TYPE="$2"; shift 2 ;;
    --all)        RUN_ALL=true; shift ;;
    --help|-h)    echo "Usage: $0 <entity_dir> [--variant <slug>] [--dry-run]"
                  echo "       $0 --all --filter <characters|locations> [--dry-run]"
                  exit 0 ;;
    *)            ENTITY_DIR="$1"; shift ;;
  esac
done

# ── Discover entity directories ────────────────────────────────────────────

discover_entities() {
  local type="$1"
  case "$type" in
    characters) find "$ROOT/content/characters" -maxdepth 1 -mindepth 1 -type d | sort ;;
    locations)  find "$ROOT/content/districts" -mindepth 2 -maxdepth 3 -type d -path "*/locations/*" | sort ;;
    scenes)     find "$ROOT/content/scenes" -maxdepth 1 -mindepth 1 -type d | sort ;;
    *)          echo "Unknown type: $type"; exit 1 ;;
  esac
}

# ── Parse YAML asset_paths.portrait_base_url ───────────────────────────────

parse_base_url() {
  local yaml_file="$1"
  # Simple grep for portrait_base_url in asset_paths section
  grep -A5 'asset_paths:' "$yaml_file" 2>/dev/null | grep 'portrait_base_url:' | head -1 | sed 's/.*portrait_base_url:\s*["'\'']\?\([^"'\'']*\)["'\'']\?/\1/' | tr -d '[:space:]'
}

# ── Parse variant sections from .prompt.md ─────────────────────────────────

parse_variants_from_md() {
  local prompt_file="$1"
  node --input-type=module -e "
    import fs from 'node:fs';
    const { parseVariants } = await import('./scripts/asset-pipeline/scripts/generate-prompt.mjs');
    const content = fs.readFileSync('$prompt_file', 'utf-8');
    const variants = parseVariants(content);
    // Output as tab-separated: slug\tscale\tedit_prompt
    for (const v of variants) {
      // Collapse edit_prompt to single line (replace newlines with spaces)
      const prompt = v.edit_prompt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      console.log([v.slug, v.scale, prompt].join('\t'));
    }
  "
}

# ── Generate a single variant ──────────────────────────────────────────────

generate_variant() {
  local entity_dir="$1"
  local base_url="$2"
  local slug="$3"
  local scale="$4"
  local edit_prompt="$5"
  local assets_dir="$entity_dir/assets"
  local entity_name
  entity_name=$(basename "$entity_dir")
  local output_file="$assets_dir/${entity_name}__${slug}.png"

  if [[ "$DRY_RUN" == true ]]; then
    echo -e "  ${CYAN}[dry-run]${NC} Would generate: $(basename "$output_file")"
    echo -e "    Scale: $scale"
    echo -e "    Prompt: ${edit_prompt:0:80}..."
    return 0
  fi

  mkdir -p "$assets_dir"

  if [[ -f "$output_file" ]]; then
    local size
    size=$(stat -c%s "$output_file" 2>/dev/null || stat -f%z "$output_file" 2>/dev/null || echo 0)
    if [[ "$size" -ge 5000 ]]; then
      warn "Already exists ($(basename "$output_file"), ${size} bytes) — skipping"
      return 0
    fi
  fi

  echo -e "  ${CYAN}Generating${NC} $(basename "$output_file")..."
  echo -e "    Scale: $scale"
  echo -e "    Prompt: ${edit_prompt:0:100}..."

  local result
  result=$(akool-cli --json image generate \
    --prompt "$edit_prompt" \
    --source-image "$base_url" \
    --scale "$scale" \
    --wait 2>&1) || {
    fail "akool-cli failed for variant '$slug'"
    echo "$result" | head -5
    return 1
  }

  # Extract URL from JSON response
  local image_url
  image_url=$(echo "$result" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try { const j=JSON.parse(d); console.log(j.data?.upscaled_urls?.[0] || ''); }
      catch { console.log(''); }
    })
  ")

  if [[ -z "$image_url" ]]; then
    fail "No image URL in response for variant '$slug'"
    return 1
  fi

  # Download the image
  wget -q -O "$output_file" "$image_url" 2>/dev/null || {
    fail "Failed to download image for variant '$slug'"
    return 1
  }

  local final_size
  final_size=$(stat -c%s "$output_file" 2>/dev/null || stat -f%z "$output_file" 2>/dev/null || echo 0)
  if [[ "$final_size" -lt 5000 ]]; then
    fail "Downloaded file too small (${final_size} bytes) for variant '$slug'"
    rm -f "$output_file"
    return 1
  fi

  ok "Generated $(basename "$output_file") (${final_size} bytes)"
  return 0
}

# ── Process a single entity ────────────────────────────────────────────────

process_entity() {
  local entity_dir="$1"
  local entity_name
  entity_name=$(basename "$entity_dir")
  local prompt_file="$entity_dir/${entity_name}.prompt.md"
  local yaml_file="$entity_dir/char_${entity_name}.yaml"

  # Try alternative YAML naming for non-characters
  if [[ ! -f "$yaml_file" ]]; then
    yaml_file="$entity_dir/location_${entity_name}.yaml"
  fi
  if [[ ! -f "$yaml_file" ]]; then
    yaml_file="$entity_dir/scene_${entity_name}.yaml"
  fi

  if [[ ! -f "$prompt_file" ]]; then
    warn "No prompt file: $entity_name"
    return 0
  fi

  # Parse base URL from YAML
  local base_url=""
  if [[ -f "$yaml_file" ]]; then
    base_url=$(parse_base_url "$yaml_file")
  fi

  if [[ -z "$base_url" ]]; then
    warn "No portrait_base_url in YAML: $entity_name — skipping"
    return 0
  fi

  header "$entity_name"

  # Parse variants from prompt file
  local variants
  variants=$(parse_variants_from_md "$prompt_file")

  if [[ -z "$variants" ]]; then
    warn "No variants defined in prompt file"
    return 0
  fi

  local count=0
  local total=0
  while IFS=$'\t' read -r slug scale edit_prompt; do
    [[ -z "$slug" ]] && continue
    total=$((total + 1))

    # If --variant specified, only run that one
    if [[ -n "$VARIANT_SLUG" && "$slug" != "$VARIANT_SLUG" ]]; then
      continue
    fi

    count=$((count + 1))
    generate_variant "$entity_dir" "$base_url" "$slug" "$scale" "$edit_prompt" || true
  done <<< "$variants"

  if [[ "$count" -eq 0 && -n "$VARIANT_SLUG" ]]; then
    warn "Variant '$VARIANT_SLUG' not found"
  fi

  echo -e "  ${BOLD}Processed $count variant(s)${NC}"
}

# ── Main ───────────────────────────────────────────────────────────────────

main() {
  echo -e "${BLUE}${BOLD}
  ╔════════════════════════════════════════════════════╗
  ║   Variant Generator (akool-cli image-to-image)    ║
  ╚════════════════════════════════════════════════════╝${NC}"

  if [[ "$DRY_RUN" == true ]]; then
    echo -e "  ${YELLOW}${BOLD}DRY RUN — no images will be generated${NC}"
  fi

  if [[ "$RUN_ALL" == true ]]; then
    if [[ -z "$FILTER_TYPE" ]]; then
      echo "Error: --all requires --filter <type>"; exit 1
    fi
    header "Processing all $FILTER_TYPE..."
    local entities
    entities=$(discover_entities "$FILTER_TYPE")
    local count=0
    while IFS= read -r dir; do
      [[ -z "$dir" ]] && continue
      process_entity "$dir" || true
      count=$((count + 1))
    done <<< "$entities"
    echo -e "\n${BOLD}Processed $count entities${NC}"
  elif [[ -n "$ENTITY_DIR" ]]; then
    # Resolve to absolute path
    if [[ ! -d "$ENTITY_DIR" ]]; then
      # Try relative to content/
      ENTITY_DIR="$ROOT/content/$ENTITY_DIR"
    fi
    if [[ ! -d "$ENTITY_DIR" ]]; then
      fail "Entity directory not found: $ENTITY_DIR"
      exit 1
    fi
    process_entity "$ENTITY_DIR"
  else
    echo "Usage: $0 <entity_dir> [--variant <slug>] [--dry-run]"
    echo "       $0 --all --filter <characters|locations> [--dry-run]"
    exit 1
  fi
}

main
