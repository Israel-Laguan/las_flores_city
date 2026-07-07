# Next Steps: Generate All Asset Drafts

> Copy this entire document into the next chat to generate all asset drafts using the new pipeline.

---

## Context

The Las Flores 2077 asset pipeline has been fully integrated. All prompt types now use the new style prefix ("premium contemporary graphic novel realism") and the global negative prompt. Legacy assets from `docs/lore/assets/references/` should remain untouched for comparison.

## What Needs to Be Done

Generate draft assets for ALL categories using the new pipeline, then compare with old versions in `references/`.

---

## Step 1: Generate All Prompts

Run these commands to generate `.prompt.md` files for every asset type:

```bash
# Character portraits (from lore figures)
node docs/lore/assets/scripts/generate-prompt.mjs \
  --type portrait \
  --batch docs/lore/figures/ \
  --force

# Scene backgrounds (from landmarks)
node docs/lore/assets/scripts/generate-prompt.mjs \
  --type background \
  --batch docs/lore/landmarks/ \
  --force

# Terrain tiles (from districts)
node docs/lore/assets/scripts/generate-prompt.mjs \
  --type tile \
  --batch docs/lore/districts/ \
  --force

# Landmark overlays (from landmarks)
node docs/lore/assets/scripts/generate-prompt.mjs \
  --type overlay \
  --batch docs/lore/landmarks/ \
  --force

# Phone wallpapers (from districts)
node docs/lore/assets/scripts/generate-prompt.mjs \
  --type phone-wallpaper \
  --batch docs/lore/districts/ \
  --force

# App icons (from districts)
node docs/lore/assets/scripts/generate-prompt.mjs \
  --type app-icon \
  --batch docs/lore/districts/ \
  --force

# Biometric sheets (for Diego Huamán MVP)
node docs/lore/assets/scripts/generate-prompt.mjs \
  --type biometric \
  --source content/characters/char_diego_huaman.yaml

# Expression strips (for Diego Huamán MVP)
node docs/lore/assets/scripts/generate-prompt.mjs \
  --type expression \
  --source content/characters/char_diego_huaman.yaml

# Outfit poses (for Diego Huamán MVP)
node docs/lore/assets/scripts/generate-prompt.mjs \
  --type outfit-pose \
  --source content/characters/char_diego_huaman.yaml
```

**Output:** `.prompt.md` files co-located next to source lore files.

---

## Step 2: Generate Draft Assets

Use the NIM/Flux pipeline to generate actual images from the prompts.

### Option A: Automated (NIM primary, Pollinations fallback)

```bash
# Initialize state
bash docs/lore/assets/scripts/generate-drafts.sh init

# Generate all drafts
bash docs/lore/assets/scripts/generate-drafts.sh run

# Or filter by type
bash docs/lore/assets/scripts/generate-drafts.sh run --filter portrait,background,tile
```

**Output:** Draft PNGs written to `<prompt_basename>.prompt/drafts/` folders.

### Option B: Manual (MidJourney / DALL-E 3 / Flux)

For each `.prompt.md` file:
1. Open the file
2. Copy the prompt section
3. Paste into your AI tool with the recommended settings
4. Download the generated asset
5. Upload to MinIO using the path specified in the prompt

**MinIO upload example:**
```bash
curl -X PUT http://localhost:9000/las-flores/tiles/tile_street.png \
  -H "Content-Type: image/png" \
  --data-binary @tile_street.png
```

---

## Step 3: Comparison with Legacy Assets

### Where to Find Old Versions

All legacy assets are in `docs/lore/assets/references/`:

| Category | Old Location | Count |
|---|---|---|
| Terrain tiles | `references/ui-concepts/isometric-map/assets/tile_*.prompt.md` + `drafts/` | 17 tiles + ~51 PNGs |
| Landmark overlays | `references/ui-concepts/isometric-map/assets/lm_*.prompt.md` + `drafts/` | 15 landmarks + ~45 PNGs |
| Scene backgrounds | `references/ui-concepts/vn-interface/assets/bg_*.prompt.md` + `drafts/` | 8 backgrounds + ~24 PNGs |
| Character portraits | `references/ui-concepts/vn-interface/assets/portrait_*.prompt.md` + `drafts/` | 2 portraits + ~6 PNGs |
| Phone wallpaper | `references/ui-concepts/phone-terminal/assets/wallpaper_*.prompt.md` + `drafts/` | 1 wallpaper + ~3 PNGs |
| App icons | `references/ui-concepts/phone-terminal/assets/app_*.prompt.md` + `drafts/` | 8 icons + ~24 PNGs |

### Comparison Checklist

For each asset category:
1. **Review old draft PNGs** in `references/ui-concepts/*/assets/*.prompt/drafts/`
2. **Generate new asset** using the new prompt from the registry
3. **Compare side-by-side:**
   - Style consistency (new style prefix vs old "soft cyberpunk")
   - Color palette (muted desaturated vs old oversaturated)
   - Quality (clean lines vs old artifacts)
   - Composition (does it match the intended use?)
4. **Document findings:** Note any assets that need prompt refinement

---

## Step 4: Upload to MinIO and Update Content YAMLs

After generating and validating assets:

### Upload to MinIO

```bash
# Tiles
curl -X PUT http://localhost:9000/las-flores/tiles/tile_street.png \
  -H "Content-Type: image/png" \
  --data-binary @tile_street.png

# Overlays
curl -X PUT http://localhost:9000/las-flores/overlays/lm_palacio_municipal.png \
  -H "Content-Type: image/png" \
  --data-binary @lm_palacio_municipal.png

# Backgrounds
curl -X PUT http://localhost:9000/las-flores/backgrounds/bg_puerto_noche.jpg \
  -H "Content-Type: image/jpeg" \
  --data-binary @bg_puerto_noche.jpg

# Phone assets
curl -X PUT http://localhost:9000/las-flores/phone/app_mapa.png \
  -H "Content-Type: image/png" \
  --data-binary @app_mapa.png

curl -X PUT http://localhost:9000/las-flores/phone/wallpaper_las_flores.jpg \
  -H "Content-Type: image/jpeg" \
  --data-binary @wallpaper_las_flores.jpg
```

### Update Content YAMLs

Add asset URLs to the corresponding content files:

```yaml
# content/locations/location_puerto_de_las_flores.yaml
scene:
  background_url: "http://minio:9000/las-flores/backgrounds/bg_puerto_noche.jpg"

# content/maps/map_centro.yaml (example)
tiles:
  - terrain_type: "street"
    base_image_url: "http://minio:9000/las-flores/tiles/tile_street.png"
  - terrain_type: "cobblestone"
    base_image_url: "http://minio:9000/las-flores/tiles/tile_cobblestone.png"
overlays:
  - landmark_id: "lm_palacio_municipal"
    overlay_image_url: "http://minio:9000/las-flores/overlays/lm_palacio_municipal.png"
```

---

## Step 5: Verify Assets

```bash
# Check all referenced assets exist in MinIO
node docs/lore/assets/scripts/verify-assets.mjs

# Check MIME types match extensions
node docs/lore/assets/scripts/verify-assets.mjs --check-mime

# Check aspect ratios match expectations
node docs/lore/assets/scripts/verify-assets.mjs --check-dimensions
```

---

## Step 6: Rebuild Server and Test

```bash
docker compose build server && docker compose up -d server
docker exec las-flores-server wget -qO- http://localhost:3000/health
```

Then test in the client:
- Load a location scene and verify background renders
- Open the phone overlay and verify wallpaper + app icons render
- Load the map and verify tiles + overlays render

---

## Registry Reference

All asset definitions are in `docs/lore/assets/registries/`:

| Registry | Assets | Prompt Type |
|---|---|---|
| `tiles.yaml` | 17 terrain tiles | `tile` |
| `landmarks.yaml` | 15 landmark overlays | `overlay` |
| `backgrounds.yaml` | 8 scene backgrounds | `background` |
| `app_icons.yaml` | 8 phone app icons | `app-icon` |
| `phone_wallpapers.yaml` | 1 phone wallpaper | `phone-wallpaper` |
| `body_shapes.yaml` | 9 body types | (used by biometric) |
| `ethnicities.yaml` | 8 ethnic face bases | (used by biometric) |
| `personality_poses.yaml` | 25+ personalities | (used by biometric) |
| `poses.yaml` | 35+ poses | (used by biometric) |
| `expressions.yaml` | 17 expressions | (used by biometric) |

---

## Expected Output Structure

```
docs/lore/assets/
├── registries/                    ← SOURCE OF TRUTH (already created)
│   ├── tiles.yaml
│   ├── landmarks.yaml
│   ├── backgrounds.yaml
│   ├── app_icons.yaml
│   ├── phone_wallpapers.yaml
│   ├── body_shapes.yaml
│   ├── ethnicities.yaml
│   ├── personality_poses.yaml
│   ├── poses.yaml
│   └── expressions.yaml
├── scripts/
│   └── generate-prompt.mjs        ← Updated with new style
├── workflows/
│   ├── asset_pipeline.md          ← Updated with all types
│   ├── media-pipeline-tiers.md    ← Updated with integration
│   └── BIOMETRIC_NEXT_STEPS.md    ← Updated with Phase F
├── references/                    ← OLD ASSETS (do not modify)
│   ├── README.md
│   ├── prompts/
│   ├── style-exploration/
│   └── ui-concepts/
│       ├── isometric-map/
│       ├── phone-terminal/
│   └── vn-interface/
├── tiles/                         ← NEW PROMPTS (generated)
│   ├── tile_street.prompt.md
│   └── ...
├── overlays/                      ← NEW PROMPTS (generated)
│   ├── lm_palacio_municipal.prompt.md
│   └── ...
├── backgrounds/                   ← NEW PROMPTS (generated)
│   ├── bg_puerto_noche.prompt.md
│   └── ...
├── phone/                         ← NEW PROMPTS (generated)
│   ├── app_mapa.prompt.md
│   ├── wallpaper_las_flores.prompt.md
│   └── ...
└── biometric/                     ← MVP PILOT (already done)
    └── diego_huaman/
        └── diego_huaman_biometric.prompt.md
```

---

## Notes

- **Do not modify `references/`** — those are the "before" baseline
- **All new prompts use the new style** — "premium contemporary graphic novel realism"
- **Consumer tags are included** — `[CONSUMER: tile]`, `[CONSUMER: phaser-sprite]`, etc.
- **Pipeline stage is documented** — draft (NIM) → refine (Flux)
- **Old draft PNGs are in `references/`** — compare side-by-side with new generations

---

## Quick Reference: Old vs New

| Asset | Old Style | New Style |
|---|---|---|
| Tiles | "soft cyberpunk aesthetic, photorealistic" | "premium contemporary graphic novel realism, muted desaturated colors" |
| Overlays | "photorealistic, 8K, transparent background" | "premium contemporary graphic novel realism, smooth gradients, crisp rendering" |
| Backgrounds | "soft cyberpunk aesthetic, 8K, cinematic" | "premium contemporary graphic novel realism, no people, no text, no logos" |
| Portraits | "photorealistic, emotional depth, 8K" | "premium contemporary graphic novel realism, transparent background, 512×768" |
| App icons | "soft cyberpunk pastel, minimalist" | "premium contemporary graphic novel realism, sharp edges, no text" |
| Wallpapers | "soft cyberpunk pastel aesthetic, photorealistic" | "premium contemporary graphic novel realism, muted desaturated colors" |

---

## Success Criteria

- [ ] All `.prompt.md` files generated for every asset in registries
- [ ] Draft assets generated for at least 1 tile, 1 overlay, 1 background, 1 app icon, 1 wallpaper
- [ ] New drafts visually distinct from old drafts in `references/`
- [ ] All assets uploaded to MinIO
- [ ] Content YAMLs updated with new URLs
- [ ] `verify-assets.mjs` reports ✅ for all new assets
- [ ] Server rebuilt and health check passes
- [ ] Client renders new assets correctly

---

*This prompt is ready to copy-paste into the next chat.*