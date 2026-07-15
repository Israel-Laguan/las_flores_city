#!/usr/bin/env bash
set -euo pipefail
# Full docs/lore/ → content/lore/ migration
# Moves all player-facing lore content into content/lore/.
# Stays in docs/lore/: guides/, assets/scripts/, assets/references/
# Idempotent: skips files that already exist at the target.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p content/lore

move_dir() {
  local src_dir=$1 tgt_dir=$2
  if [ ! -d "$src_dir" ]; then return; fi
  mkdir -p "$tgt_dir"
  for f in "$src_dir"/*; do
    [ -e "$f" ] || continue
    local bname=$(basename "$f")
    if [ -f "$f" ] && [ ! -f "$tgt_dir/$bname" ]; then
      git mv "$f" "$tgt_dir/$bname" 2>/dev/null || mv "$f" "$tgt_dir/$bname"
      echo "  moved $f -> $tgt_dir/$bname"
    fi
  done
}

move_nested() {
  local src=$1 tgt=$2 depth=${3:-2}
  if [ ! -d "$src" ]; then return; fi
  # Also move root-level files (e.g. README.md) in the source directory
  mkdir -p "$tgt"
  for f in "$src"/*; do
    [ -e "$f" ] || continue
    if [ -f "$f" ]; then
      local bname=$(basename "$f")
      if [ ! -f "$tgt/$bname" ]; then
        git mv "$f" "$tgt/$bname" 2>/dev/null || mv "$f" "$tgt/$bname"
        echo "  moved $f -> $tgt/$bname"
      fi
    fi
  done
  for dir in "$src"/*/; do
    [ -d "$dir" ] || continue
    local name=$(basename "$dir")
    local target="$tgt/$name"
    mkdir -p "$target"
    for f in "$dir"*; do
      [ -e "$f" ] || continue
      local bname=$(basename "$f")
      if [ -f "$f" ] && [ ! -f "$target/$bname" ]; then
        git mv "$f" "$target/$bname" 2>/dev/null || mv "$f" "$target/$bname"
        echo "  moved $f -> $target/$bname"
      elif [ -d "$f" ]; then
        if [ "$depth" -ge 3 ]; then
          # 3 levels deep: create subdir and recurse one more level
          mkdir -p "$target/$bname"
          for subf in "$f"/*; do
            [ -e "$subf" ] || continue
            local subname=$(basename "$subf")
            if [ -f "$subf" ] && [ ! -f "$target/$bname/$subname" ]; then
              git mv "$subf" "$target/$bname/$subname" 2>/dev/null || mv "$subf" "$target/$bname/$subname"
              echo "  moved $subf -> $target/$bname/$subname"
            elif [ -d "$subf" ]; then
              mkdir -p "$target/$bname/$subname"
              for deepf in "$subf"/*; do
                [ -e "$deepf" ] || continue
                local deepname=$(basename "$deepf")
                if [ ! -f "$target/$bname/$subname/$deepname" ]; then
                  git mv "$deepf" "$target/$bname/$subname/$deepname" 2>/dev/null || mv "$deepf" "$target/$bname/$subname/$deepname"
                  echo "  moved $deepf -> $target/$bname/$subname/$deepname"
                fi
              done
            fi
          done
        else
          mkdir -p "$target/$bname"
          for subf in "$f"/*; do
            [ -e "$subf" ] || continue
            local subname=$(basename "$subf")
            if [ ! -f "$target/$bname/$subname" ]; then
              git mv "$subf" "$target/$bname/$subname" 2>/dev/null || mv "$subf" "$target/$bname/$subname"
              echo "  moved $subf -> $target/$bname/$subname"
            fi
          done
        fi
      fi
    done
  done
}

echo "=== Phase 1: Top-level reference docs ==="
for f in geography.md timeline.md climate.md demography.md transportation.md city_overview.md city_atmosphere.md city_map_layout.md game_systems.md leisure_and_destinations.md; do
  [ -f "docs/lore/$f" ] || continue
  [ -f "content/lore/$f" ] && { echo "  skip: content/lore/$f"; continue; }
  git mv "docs/lore/$f" "content/lore/$f" 2>/dev/null || mv "docs/lore/$f" "content/lore/$f"
  echo "  moved docs/lore/$f -> content/lore/$f"
done

echo "=== Phase 2: organizations/ ===" && move_nested "docs/lore/organizations" "content/lore/organizations"
echo "=== Phase 3: media/ ===" && move_nested "docs/lore/media" "content/lore/media"
echo "=== Phase 4: communities/ ===" && move_nested "docs/lore/communities" "content/lore/communities"
echo "=== Phase 5: events/ ===" && move_nested "docs/lore/events" "content/lore/events"
echo "=== Phase 6: conflicts/ ===" && move_nested "docs/lore/conflicts" "content/lore/conflicts"
echo "=== Phase 7: stories/ ===" && move_nested "docs/lore/stories" "content/lore/stories"
echo "=== Phase 8: landmarks/ ===" && move_nested "docs/lore/landmarks" "content/lore/landmarks"
echo "=== Phase 9: shared/ ===" && move_nested "docs/lore/shared" "content/lore/shared" 3
echo "=== Phase 10: governance/ ===" && move_nested "docs/lore/governance" "content/lore/governance"
echo "=== Phase 11: districts/ ===" && move_nested "docs/lore/districts" "content/lore/districts"

echo ""
echo "=== Done! docs/lore/ → content/lore/ migration complete ==="
echo "docs/lore/ now contains: guides/, assets/ (ui-concepts, scripts, registries, references), README.md, PROMPT_GUIDELINES.md"