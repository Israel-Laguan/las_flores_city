#!/usr/bin/env bash
set -euo pipefail

# M01: Colocate lore into content/
# Moves per-entity lore files from docs/lore/ into content/ per-folder layout.
# Idempotent: skips directories/files that already exist at the target.

echo "=== Phase 1: Move character lore from docs/lore/figures/ ==="
for fig_dir in docs/lore/figures/*/; do
  [ -d "$fig_dir" ] || continue
  slug=$(basename "$fig_dir")

  # Skip non-entity directories
  [[ "$slug" == CHARACTER_PROMPT_AUDIT ]] && continue
  [[ "$slug" == gdd_friends ]] && continue
  [[ "$slug" == constitution_backstory ]] && continue

  target="content/characters/$slug"
  mkdir -p "$target"

  # Move all files from the figure directory to the target
  for f in "$fig_dir"*; do
    [ -e "$f" ] || continue
    basename_f=$(basename "$f")
    if [ -f "$f" ]; then
      if [ ! -f "$target/$basename_f" ]; then
        git mv "$f" "$target/$basename_f"
        echo "  moved $f -> $target/$basename_f"
      fi
    elif [ -d "$f" ] && [ "$basename_f" = "assets" ]; then
      # Handle assets directory - move individual files
      mkdir -p "$target/assets"
      for asset in "$f"/*; do
        [ -e "$asset" ] || continue
        asset_name=$(basename "$asset")
        if [ -f "$asset" ] && [ ! -f "$target/assets/$asset_name" ]; then
          # Check if file is tracked by git
          if git ls-files --error-unmatch "$asset" >/dev/null 2>&1; then
            git mv "$asset" "$target/assets/$asset_name"
          else
            mv "$asset" "$target/assets/$asset_name"
          fi
          echo "  moved $asset -> $target/assets/$asset_name"
        fi
      done
    fi
  done
done

echo ""
echo "=== Phase 2: Move flat character YAMLs into per-folder layout ==="
for yaml in content/characters/char_*.yaml; do
  [ -f "$yaml" ] || continue
  slug=$(echo "$yaml" | sed 's|content/characters/char_||; s|\.yaml$||')
  target="content/characters/$slug"
  mkdir -p "$target"
  if [ ! -f "$target/char_$slug.yaml" ]; then
    git mv "$yaml" "$target/char_$slug.yaml"
    echo "  moved $yaml -> $target/char_$slug.yaml"
  fi
done

echo ""
echo "=== Phase 3: Move landmark lore from docs/lore/districts/ ==="
for landmark_dir in docs/lore/districts/*/landmarks/*/; do
  [ -d "$landmark_dir" ] || continue
  slug=$(basename "$landmark_dir")
  target="content/locations/$slug"
  mkdir -p "$target"

  # Move all files from the landmark directory to the target
  for f in "$landmark_dir"*; do
    [ -e "$f" ] || continue
    basename_f=$(basename "$f")
    if [ -f "$f" ]; then
      if [ ! -f "$target/$basename_f" ]; then
        git mv "$f" "$target/$basename_f"
        echo "  moved $f -> $target/$basename_f"
      fi
    elif [ -d "$f" ] && [ "$basename_f" = "assets" ]; then
      # Handle assets directory - move individual files
      mkdir -p "$target/assets"
      for asset in "$f"/*; do
        [ -e "$asset" ] || continue
        asset_name=$(basename "$asset")
        if [ -f "$asset" ] && [ ! -f "$target/assets/$asset_name" ]; then
          # Check if file is tracked by git
          if git ls-files --error-unmatch "$asset" >/dev/null 2>&1; then
            git mv "$asset" "$target/assets/$asset_name"
          else
            mv "$asset" "$target/assets/$asset_name"
          fi
          echo "  moved $asset -> $target/assets/$asset_name"
        fi
      done
    fi
  done
done

echo ""
echo "=== Phase 4: Move flat location YAMLs into per-folder layout ==="
for yaml in content/locations/location_*.yaml; do
  [ -f "$yaml" ] || continue
  slug=$(echo "$yaml" | sed 's|content/locations/location_||; s|\.yaml$||')
  target="content/locations/$slug"
  mkdir -p "$target"
  if [ ! -f "$target/location_$slug.yaml" ]; then
    git mv "$yaml" "$target/location_$slug.yaml"
    echo "  moved $yaml -> $target/location_$slug.yaml"
  fi
done

echo ""
echo "=== Phase 5: Move flat scene YAMLs into per-folder layout ==="
for yaml in content/scenes/scene_*.yaml content/scenes/old_town_cafe.yaml content/scenes/the_apartment.yaml content/scenes/welcome_center.yaml; do
  [ -f "$yaml" ] || continue
  # Extract slug from filename (remove prefix and .yaml suffix)
  basename_yaml=$(basename "$yaml" .yaml)
  slug=$(echo "$basename_yaml" | sed 's|^scene_||')
  target="content/scenes/$slug"
  mkdir -p "$target"
  if [ ! -f "$target/$basename_yaml.yaml" ]; then
    git mv "$yaml" "$target/$basename_yaml.yaml"
    echo "  moved $yaml -> $target/$basename_yaml.yaml"
  fi
done

echo ""
echo "=== Phase 6: Move flat overlay YAMLs into per-folder layout ==="
for yaml in content/overlays/overlay_*.yaml; do
  [ -f "$yaml" ] || continue
  slug=$(echo "$yaml" | sed 's|content/overlays/overlay_||; s|\.yaml$||')
  target="content/overlays/$slug"
  mkdir -p "$target"
  if [ ! -f "$target/overlay_$slug.yaml" ]; then
    git mv "$yaml" "$target/overlay_$slug.yaml"
    echo "  moved $yaml -> $target/overlay_$slug.yaml"
  fi
done

echo ""
echo "=== Phase 7: Move flat mission YAMLs into per-folder layout ==="
for yaml in content/missions/mission_*.yaml; do
  [ -f "$yaml" ] || continue
  slug=$(echo "$yaml" | sed 's|content/missions/mission_||; s|\.yaml$||')
  target="content/missions/$slug"
  mkdir -p "$target"
  if [ ! -f "$target/mission_$slug.yaml" ]; then
    git mv "$yaml" "$target/mission_$slug.yaml"
    echo "  moved $yaml -> $target/mission_$slug.yaml"
  fi
done

echo ""
echo "=== Phase 8: Clean up empty directories ==="
# Remove empty figure directories
find docs/lore/figures -maxdepth 1 -type d -empty -delete 2>/dev/null || true
# Remove empty landmark directories
find docs/lore/districts -type d -name "landmarks" -empty -delete 2>/dev/null || true
find docs/lore/districts -type d -empty -delete 2>/dev/null || true

echo ""
echo "=== Done! ==="
echo "Summary of moves:"
echo "  Characters: $(ls -d content/characters/*/ 2>/dev/null | wc -l) folders"
echo "  Locations: $(ls -d content/locations/*/ 2>/dev/null | wc -l) folders"
echo "  Scenes: $(ls -d content/scenes/*/ 2>/dev/null | wc -l) folders"
echo "  Overlays: $(ls -d content/overlays/*/ 2>/dev/null | wc -l) folders"
echo "  Missions: $(ls -d content/missions/*/ 2>/dev/null | wc -l) folders"
