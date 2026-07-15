#!/usr/bin/env bash
set -euo pipefail

# M01: Rewrite YAML paths after colocation
# Rewrites lore_path, narrative_path, and asset_paths to be relative to the YAML's directory.

echo "=== Rewriting lore_path references ==="
# Characters: lore_path: docs/lore/figures/<slug>/<slug>.md → lore_path: <slug>.md
for yaml in content/characters/*/char_*.yaml; do
  [ -f "$yaml" ] || continue
  dir=$(dirname "$yaml")
  slug=$(basename "$dir")
  
  # Rewrite lore_path
  if grep -q "lore_path: docs/lore/figures/" "$yaml" 2>/dev/null; then
    sed -i "s|lore_path: docs/lore/figures/[^/]*/[^/]*\.md|lore_path: ${slug}.md|g" "$yaml"
    echo "  rewrote lore_path in $yaml"
  fi
  
  # Rewrite narrative_path (if it exists and points to old location)
  if grep -q "narrative_path: content/" "$yaml" 2>/dev/null; then
    sed -i "s|narrative_path: content/[^/]*/*\.md|narrative_path: ${slug}.md|g" "$yaml"
    echo "  rewrote narrative_path in $yaml"
  fi
done

# Locations: same pattern
for yaml in content/locations/*/location_*.yaml; do
  [ -f "$yaml" ] || continue
  dir=$(dirname "$yaml")
  slug=$(basename "$dir")
  
  # Rewrite lore_path
  if grep -q "lore_path: docs/lore/" "$yaml" 2>/dev/null; then
    sed -i "s|lore_path: docs/lore/[^/]*/*landmarks/[^/]*/[^/]*\.md|lore_path: ${slug}.md|g" "$yaml"
    echo "  rewrote lore_path in $yaml"
  fi
done

echo ""
echo "=== Rewriting asset_paths references ==="
# Characters: asset_paths.portrait: characters/<slug>/portrait.png → portrait: <slug>__default.png
for yaml in content/characters/*/char_*.yaml; do
  [ -f "$yaml" ] || continue
  dir=$(dirname "$yaml")
  slug=$(basename "$dir")
  assets_dir="$dir/assets"
  
  # Check if __default.png exists
  if [ -f "$assets_dir/${slug}__default.png" ]; then
    # Rewrite portrait path
    if grep -q "portrait: characters/" "$yaml" 2>/dev/null; then
      sed -i "s|portrait: characters/[^/]*/portrait\.png|portrait: ${slug}__default.png|g" "$yaml"
      echo "  rewrote portrait asset_path in $yaml"
    fi
  fi
done

# Locations: asset_paths.image: locations/location_<slug>/image.jpg → image: <slug>__default.png
for yaml in content/locations/*/location_*.yaml; do
  [ -f "$yaml" ] || continue
  dir=$(dirname "$yaml")
  slug=$(basename "$dir")
  assets_dir="$dir/assets"
  
  # Check if __default.png exists
  if [ -f "$assets_dir/${slug}__default.png" ]; then
    # Rewrite image path
    if grep -q "image: locations/" "$yaml" 2>/dev/null; then
      sed -i "s|image: locations/[^/]*/image\.jpg|image: ${slug}__default.png|g" "$yaml"
      echo "  rewrote image asset_path in $yaml"
    fi
  fi
done

# Scenes: asset_paths.background: scenes/scene_<slug>/background.jpg → background: <slug>__default.png
for yaml in content/scenes/*/scene_*.yaml; do
  [ -f "$yaml" ] || continue
  dir=$(dirname "$yaml")
  slug=$(basename "$dir")
  assets_dir="$dir/assets"
  
  # Check if __default.png exists
  if [ -f "$assets_dir/${slug}__default.png" ]; then
    # Rewrite background path
    if grep -q "background: scenes/" "$yaml" 2>/dev/null; then
      sed -i "s|background: scenes/[^/]*/background\.jpg|background: ${slug}__default.png|g" "$yaml"
      echo "  rewrote background asset_path in $yaml"
    fi
  fi
done

# Overlays: asset_paths.background: overlays/overlay_<slug>/background.jpg → background: <slug>__default.png
for yaml in content/overlays/*/overlay_*.yaml; do
  [ -f "$yaml" ] || continue
  dir=$(dirname "$yaml")
  slug=$(basename "$dir")
  assets_dir="$dir/assets"
  
  # Check if __default.png exists
  if [ -f "$assets_dir/${slug}__default.png" ]; then
    # Rewrite background path
    if grep -q "background: overlays/" "$yaml" 2>/dev/null; then
      sed -i "s|background: overlays/[^/]*/background\.jpg|background: ${slug}__default.png|g" "$yaml"
      echo "  rewrote background asset_path in $yaml"
    fi
  fi
done

echo ""
echo "=== Done! ==="
echo "YAML paths rewritten."
