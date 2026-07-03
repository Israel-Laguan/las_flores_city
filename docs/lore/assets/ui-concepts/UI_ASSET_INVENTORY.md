# UI Asset Inventory — Las Flores 2077

> **Purpose:** Complete inventory of all visual assets needed to evolve the three UI concepts (isometric map, VN interface, phone-terminal) from CSS/emoji placeholders to asset-backed interfaces.
>
> **Workflow:** Step 1 (Inventory) → Step 2 (Generate assets from prompts) → Step 3 (Apply to client code)
>
> **Last updated:** 2026-07-02

---

## Table of Contents

1. [Workflow Overview](#workflow-overview)
2. [Asset Summary](#asset-summary)
3. [Concept A: Isometric District Map](#concept-a-isometric-district-map)
4. [Concept B: Visual Novel Interface](#concept-b-visual-novel-interface)
5. [Concept C: Phone & Terminal](#concept-c-phone--terminal)
6. [Generation Settings Reference](#generation-settings-reference)
7. [MinIO Upload Paths](#minio-upload-paths)
8. [Client Integration Map](#client-integration-map)

---

## Workflow Overview

```
Step 1: INVENTORY (this document)
        └── Review what assets are needed, where they go, and how they're used

Step 2: GENERATE ASSETS (you do this)
        ├── Open each .prompt.md file in your AI tool of choice
        ├── Use the generation settings specified in each prompt
        ├── Download the generated asset
        └── Upload to MinIO (or local assets directory)

Step 3: APPLY TO CLIENT (second chat)
        ├── Update CSS/TSX to reference the new asset URLs
        ├── Add portrait/background rendering to dialogue system
        ├── Add app icon grid and wallpaper to phone overlay
        └── Add isometric transforms and info panel to map view
```

---

## Asset Summary

| Concept | Assets | Total | Status |
|---------|--------|-------|--------|
| Isometric Map | 17 tiles + 15 landmark overlays | 32 | Prompts ready |
| VN Interface | 8 backgrounds + 2 portraits | 10 | Prompts ready |
| Phone & Terminal | 1 wallpaper + 8 app icons | 9 | Prompts ready |
| **Total** | | **46** | **All prompts generated** |

---

## Concept A: Isometric District Map

**Concept file:** `docs/lore/assets/ui-concepts/isometric-map/index.html`
**Prompt directory:** `docs/lore/assets/ui-concepts/isometric-map/assets/`

### A1 — Tile Textures (17 assets)

These are seamless top-down textures used as the base layer of the isometric grid. Each tile is rendered as `background-image` on a CSS-transformed `<div>`.

| # | Asset | Prompt File | Dimensions | Format | Consumer Tag |
|---|-------|-------------|-----------|--------|-------------|
| 1 | Street | `tile_street.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 2 | Beach Sand | `tile_beach_sand.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 3 | Ocean Water | `tile_water_ocean.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 4 | River Water | `tile_water_river.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 5 | Park Grass | `tile_grass_park.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 6 | Cobblestone | `tile_cobblestone.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 7 | Industrial Concrete | `tile_industrial_concrete.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 8 | Desert Sand | `tile_desert_sand.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 9 | Civic Building | `tile_building_civic.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 10 | Residential Building | `tile_building_residential.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 11 | Sidewalk | `tile_sidewalk.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 12 | Port Asphalt | `tile_port_asphalt.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 13 | Mountain Rock | `tile_mountain_rock.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 14 | Forest | `tile_forest.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 15 | Swamp | `tile_swamp.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 16 | Farmland | `tile_farmland.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |
| 17 | Runway | `tile_runway.prompt.md` | 256×256 | PNG/JPG | `[CONSUMER: tile]` |

**Key requirements:**
- Seamless/tileable (edges must match when repeated)
- No horizon, no sky, no people, no objects
- Soft cyberpunk pastel palette
- Square 1:1 aspect ratio

**How they're used in the client:**
- `MapView.tsx` renders a grid of `<div>` elements
- Each tile's `background-image` is set from `TERRAIN[t].image` (already in the data model)
- The concept adds CSS 3D transforms (`rotateX(60deg) rotateZ(-45deg)`) for isometric perspective
- Day/night toggle applies CSS filter: `brightness(0.65) hue-rotate(215deg) saturate(0.6)`

**Client integration (Step 3):**
- File: `client/src/components/MapView.tsx` — line ~176, `baseStyle.backgroundImage` already supports `tile.baseImageUrl`
- File: `client/src/styles/map.css` — add `.tile-grid-iso` class with perspective transforms
- The `TERRAIN_COLORS` object in `MapView.tsx` already has `image` fields matching these filenames

---

### A2 — Landmark Overlays (15 assets)

These are transparent PNG overlays rendered on top of specific tiles to represent notable locations.

| # | Asset | Prompt File | Dimensions | Format | Consumer Tag |
|---|-------|-------------|-----------|--------|-------------|
| 1 | Palacio Municipal | `lm_palacio_municipal.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 2 | World Trade Center | `lm_world_trade_center.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 3 | Playa Entrance | `lm_playa_entrada.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 4 | Teatro Nacional | `lm_teatro_nacional.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 5 | Electra Battery | `lm_electra.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 6 | Iglesia Vieja | `lm_iglesia_vieja.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 7 | Governor's Offices | `lm_governor_offices.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 8 | Mercado Central | `lm_mercado_central.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 9 | Universidad Nacional | `lm_universidad_nacional.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 10 | Luz del Río | `lm_luz_del_rio.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 11 | Puerto de Las Flores | `lm_puerto_de_las_flores.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 12 | Parque de las Montañas | `lm_parque_de_las_montanas.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 13 | Mall de las Estrellas | `lm_mall_de_las_estrellas.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 14 | Van der Meer Northern Mine | `lm_van_der_meer_northern_mine.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 15 | Far South Outpost | `lm_far_south_outpost.prompt.md` | 256×256 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |

**Key requirements:**
- **Must have transparent background** (PNG with alpha channel)
- Top-down view, centered composition
- No external shadows, no environmental background
- Isolated asset only

**How they're used in the client:**
- `MapView.tsx` renders `<img>` inside the tile when `tile.overlayImageUrl` is present (line ~201)
- The concept renders them as `<img class="tile-icon">` absolutely positioned over the tile
- Clicking a landmark tile opens the info panel with details (name, district, safety, TB cost)

**Client integration (Step 3):**
- File: `client/src/components/MapView.tsx` — the `LANDMARKS` array in the concept maps to `tile.metadata` in the current data model
- File: `client/src/types/map.ts` — `Tile` type already has `overlayImageUrl?: string`
- The info panel (new component) shows: name, district, safety level, travel TB cost

---

## Concept B: Visual Novel Interface

**Concept file:** `docs/lore/assets/ui-concepts/vn-interface/index.html`
**Prompt directory:** `docs/lore/assets/ui-concepts/vn-interface/assets/`

### B1 — Scene Backgrounds (8 assets)

Full-screen background images for dialogue scenes. Rendered behind the dialogue overlay.

| # | Asset | Prompt File | Dimensions | Format | Consumer Tag |
|---|-------|-------------|-----------|--------|-------------|
| 17 | Puerto Noche | `bg_puerto_noche.prompt.md` | 1920×1080 | JPG | `[CONSUMER: html-background]` |
| 18 | Callejon Centro | `bg_callejon_centro.prompt.md` | 1920×1080 | JPG | `[CONSUMER: html-background]` |
| 19 | Laboratorio | `bg_laboratorio.prompt.md` | 1920×1080 | JPG | `[CONSUMER: html-background]` |
| 20 | Governor's Offices | `bg_governor_offices.prompt.md` | 1920×1080 | JPG | `[CONSUMER: html-background]` |
| 21 | Mercado Central | `bg_mercado_central.prompt.md` | 1920×1080 | JPG | `[CONSUMER: html-background]` |
| 22 | Puerto de Las Flores | `bg_puerto_de_las_flores.prompt.md` | 1920×1080 | JPG | `[CONSUMER: html-background]` |
| 23 | Luz del Río | `bg_luz_del_rio.prompt.md` | 1920×1080 | JPG | `[CONSUMER: html-background]` |
| 24 | Van der Meer Mine | `bg_van_der_meer_mine.prompt.md` | 1920×1080 | JPG | `[CONSUMER: html-background]` |

**Key requirements:**
- 16:9 landscape aspect ratio
- No transparency needed (JPG is fine)
- No text, no logos
- Soft cyberpunk aesthetic with pastel + neon accents

**How they're used in the client:**
- The concept renders `<img class="scene-bg">` inside `.game-viewport` at `z-index: 0`
- The current `DialogueUI.ts` does NOT have scene background support — this is new functionality
- Background changes when speaker changes (cross-fade transition)
- The concept also has atmosphere layers on top: scanlines, vignette, neon flare

**Client integration (Step 3):**
- File: `client/src/components/DialogueUI.ts` — add `sceneBackgroundUrl` state, render `<img class="scene-bg">` behind dialogue
- File: `client/src/styles/dialogue.css` — add `.scene-bg` styles (cover, z-index, brightness filter)
- File: `client/src/utils/dialogue-templates.ts` — add background URL to dialogue node data
- The `DialogueNode` type already has `speaker` with `avatar_url` — extend with `background_url` if needed

---

### B2 — Character Portraits (2 assets)

Transparent PNG portraits displayed in the dialogue UI next to the speaker name.

| # | Asset | Prompt File | Dimensions | Format | Consumer Tag |
|---|-------|-------------|-----------|--------|-------------|
| 20 | Alex Garcia | `portrait_alex.prompt.md` | 512×768 | PNG (transparent) | `[CONSUMER: portrait]` |
| 21 | Mateo | `portrait_mateo.prompt.md` | 512×768 | PNG (transparent) | `[CONSUMER: portrait]` |

**Key requirements:**
- **Must have transparent background** (PNG with alpha)
- 3:4 aspect ratio (portrait orientation)
- Centered bust/crop (shoulders up)
- Soft neon rim lighting, vivid pastels

**How they're used in the client:**
- The concept renders `<img class="sprite">` inside `.portrait-area` (left side, 320×420px)
- Portrait changes when speaker changes
- The current `DialogueUI.ts` has `speaker.avatar_url` in the `DialogueNode` type but does NOT render it visually
- The current `dialogue-templates.ts` only shows speaker name + title, no portrait

**Client integration (Step 3):**
- File: `client/src/utils/dialogue-templates.ts` — add `buildPortraitArea(speaker)` function
- File: `client/src/styles/dialogue.css` — add `.portrait-area` styles (positioned left, rounded frame, glitch overlay)
- The `speaker.avatar_url` field already exists in `DialogueNode` — just needs rendering

---

## Concept C: Phone & Terminal

**Concept file:** `docs/lore/assets/ui-concepts/phone-terminal/index.html`
**Prompt directory:** `docs/lore/assets/ui-concepts/phone-terminal/assets/`

### C1 — Phone Wallpaper (1 asset)

Vertical background image for the phone OS home screen.

| # | Asset | Prompt File | Dimensions | Format | Consumer Tag |
|---|-------|-------------|-----------|--------|-------------|
| 22 | Las Flores Wallpaper | `wallpaper_las_flores.prompt.md` | 1080×1920 | JPG | `[CONSUMER: html-background]` |

**Key requirements:**
- 9:16 vertical aspect ratio (phone portrait)
- Night city skyline from a distance
- Soft pastel lights, wet streets reflecting
- No text, no logos
- Top area should be relatively clear (for clock/status bar)

**How they're used in the client:**
- The concept sets `.phone-frame` background to `url('assets/wallpaper_las_flores.jpg')` with overlay gradient
- Current `phone.css` has `.phone-screen` with flat `background: rgba(3, 7, 18, 0.95)`
- Wallpaper goes behind the app content, with a dark overlay for readability

**Client integration (Step 3):**
- File: `client/src/styles/phone.css` — add `--phone-wallpaper` CSS variable, set `.phone-screen` background to wallpaper + gradient overlay
- File: `client/src/components/PhoneOverlay.ts` — no code change needed if CSS handles it, or add wallpaper URL to state

---

### C2 — App Icons (8 assets)

Small square icons for the phone app grid.

| # | Asset | Prompt File | Dimensions | Format | Consumer Tag |
|---|-------|-------------|-----------|--------|-------------|
| 23 | Mapa | `app_mapa.prompt.md` | 128×128 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 24 | Chat | `app_chat.prompt.md` | 128×128 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 25 | Misiones | `app_misiones.prompt.md` | 128×128 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 26 | Agenda | `app_agenda.prompt.md` | 128×128 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 27 | Noticias | `app_noticias.prompt.md` | 128×128 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 28 | Radio | `app_radio.prompt.md` | 128×128 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 29 | Mercado | `app_mercado.prompt.md` | 128×128 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |
| 30 | Ajustes | `app_ajustes.prompt.md` | 128×128 | PNG (transparent) | `[CONSUMER: phaser-sprite]` |

**Key requirements:**
- **Must have transparent background** (PNG with alpha)
- 1:1 square aspect ratio
- Minimalist geometric icon design
- Sharp edges, no text
- Soft cyberpunk pastel color palette

**How they're used in the client:**
- The concept renders `<img class="app-icon-img">` inside `.app` divs in a 4-column grid
- Current `PhoneOverlay.ts` has text-only nav bar — the app grid replaces or augments it
- The concept's `.apps-grid` uses `grid-template-columns: repeat(4, 1fr)`

**Client integration (Step 3):**
- File: `client/src/components/PhoneOverlay.ts` — add `createAppGrid()` method, render app icons with labels
- File: `client/src/styles/phone.css` — add `.apps-grid`, `.app`, `.app-icon-img` styles
- Each app click emits `phone:navigate` event (already exists in `switchApp()`)

---

### C3 — Phone Frame Notch (1 asset, CSS-derivable)

| # | Asset | File | Dimensions | Format | Notes |
|---|-------|------|-----------|--------|-------|
| — | Phone notch | `assets/phone_notch.png` | 200×40 | PNG | **CSS-derivable** — can be done with `border-radius` + pseudo-element |

**Note:** The phone notch is optional and can be created with pure CSS (rounded pill shape at top of phone frame). Only generate if you want a specific visual texture.

---

## Generation Settings Reference

### MidJourney (recommended for most assets)

| Asset Type | Aspect Ratio | Style | Notes |
|-----------|-------------|-------|-------|
| Tile texture | `--ar 1:1` | `--style raw` | Seamless tileable |
| Landmark overlay | `--ar 1:1` | `--style raw` | Transparent background |
| VN background | `--ar 16:9` | `--style raw` | No people, cinematic |
| VN portrait | `--ar 3:4` | `--style raw` | Transparent background |
| Phone wallpaper | `--ar 9:16` | `--style raw` | Vertical composition |
| App icon | `--ar 1:1` | `--style raw` | Transparent background |

### Stable Diffusion

| Asset Type | Checkpoint | Sampler | CFG Scale | Steps |
|-----------|-----------|---------|-----------|-------|
| Any | Realistic Vision v5.1 | DPM++ 2M Karras | 7-9 | 40-50 |

### DALL-E 3

| Asset Type | Quality | Style | Notes |
|-----------|---------|-------|-------|
| Any | HD | Photorealistic | Use full sentences |

### Universal Negative Prompts

Add to ALL generations:
```
--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no modern day, no 2020s, no utopian, no pristine environments, no oversaturated colors, no cartoonish, no anime, no text, no logos
```

---

## MinIO Upload Paths

After generating each asset, upload to the following MinIO paths:

### Isometric Map Tiles
```
las-flores/tiles/tile_street.png
las-flores/tiles/tile_beach_sand.png
las-flores/tiles/tile_water_ocean.png
las-flores/tiles/tile_water_river.png
las-flores/tiles/tile_grass_park.png
las-flores/tiles/tile_cobblestone.png
las-flores/tiles/tile_industrial_concrete.png
las-flores/tiles/tile_desert_sand.png
las-flores/tiles/tile_building_civic.png
las-flores/tiles/tile_building_residential.png
las-flores/tiles/tile_sidewalk.png
las-flores/tiles/tile_port_asphalt.png
las-flores/tiles/tile_mountain_rock.png
las-flores/tiles/tile_forest.png
las-flores/tiles/tile_swamp.png
las-flores/tiles/tile_farmland.png
las-flores/tiles/tile_runway.png
```

### Isometric Map Landmarks
```
las-flores/overlays/lm_palacio_municipal.png
las-flores/overlays/lm_world_trade_center.png
las-flores/overlays/lm_playa_entrada.png
las-flores/overlays/lm_teatro_nacional.png
las-flores/overlays/lm_electra.png
las-flores/overlays/lm_iglesia_vieja.png
las-flores/overlays/lm_governor_offices.png
las-flores/overlays/lm_mercado_central.png
las-flores/overlays/lm_universidad_nacional.png
las-flores/overlays/lm_luz_del_rio.png
las-flores/overlays/lm_puerto_de_las_flores.png
las-flores/overlays/lm_parque_de_las_montanas.png
las-flores/overlays/lm_mall_de_las_estrellas.png
las-flores/overlays/lm_van_der_meer_northern_mine.png
las-flores/overlays/lm_far_south_outpost.png
```

### VN Backgrounds
```
las-flores/backgrounds/bg_puerto_noche.jpg
las-flores/backgrounds/bg_callejon_centro.jpg
las-flores/backgrounds/bg_laboratorio.jpg
las-flores/backgrounds/bg_governor_offices.jpg
las-flores/backgrounds/bg_mercado_central.jpg
las-flores/backgrounds/bg_puerto_de_las_flores.jpg
las-flores/backgrounds/bg_luz_del_rio.jpg
las-flores/backgrounds/bg_van_der_meer_mine.jpg
```

### VN Portraits
```
las-flores/portraits/portrait_alex.png
las-flores/portraits/portrait_mateo.png
```

### Phone Assets
```
las-flores/phone/wallpaper_las_flores.jpg
las-flores/phone/app_mapa.png
las-flores/phone/app_chat.png
las-flores/phone/app_misiones.png
las-flores/phone/app_agenda.png
las-flores/phone/app_noticias.png
las-flores/phone/app_radio.png
las-flores/phone/app_mercado.png
las-flores/phone/app_ajustes.png
```

---

## Client Integration Map

This section maps each asset to the exact files that need to change in Step 3.

### Isometric Map Integration

| File | Change | Lines |
|------|--------|-------|
| `client/src/styles/map.css` | Add `.tile-grid-iso` with `perspective: 1200px`, `.iso-world` with `rotateX(60deg) rotateZ(-45deg)`, `.iso-tile` with hover lift | New section |
| `client/src/components/MapView.tsx` | Add info panel component (name, district, safety, TB cost, asset preview) | After line ~210 |
| `client/src/components/MapView.tsx` | Add isometric toggle class to tile grid | Line ~165 |
| `client/src/types/map.ts` | Add optional `safety`, `district` to Tile metadata | Line ~10 |

### VN Dialogue Integration

| File | Change | Lines |
|------|--------|-------|
| `client/src/utils/dialogue-templates.ts` | Add `buildPortraitArea(speaker)` function using `speaker.avatar_url` | After line ~24 |
| `client/src/utils/dialogue-templates.ts` | Add `buildSceneBackground(backgroundUrl)` function | After line ~28 |
| `client/src/components/DialogueUI.ts` | Add `sceneBackgroundUrl` state, render `<img class="scene-bg">` | After line ~55 |
| `client/src/components/DialogueUI.ts` | Add portrait rendering to `renderDialogue()` | Line ~344 |
| `client/src/styles/dialogue.css` | Add `.portrait-area` (left side, 320×420px, rounded frame, glitch overlay) | New section |
| `client/src/styles/dialogue.css` | Add `.scene-bg` (cover, z-index: 0, brightness filter) | New section |
| `client/src/styles/dialogue.css` | Add `.hud-block` (top-left TB, top-right suspicion) | New section |
| `client/src/styles/dialogue.css` | Add scanlines, vignette, neon flare atmosphere effects | New section |
| `client/src/styles/dialogue.css` | Add choice button fade-in animation (staggered) | Line ~82 |

### Phone & Terminal Integration

| File | Change | Lines |
|------|--------|-------|
| `client/src/styles/phone.css` | Add `--phone-wallpaper` CSS variable, set `.phone-screen` background | Line ~58 |
| `client/src/styles/phone.css` | Add `.apps-grid` (4-column grid), `.app` (card), `.app-icon-img` (32px) | New section |
| `client/src/styles/phone.css` | Add `.status-bar-fill` (progress bar for TB, energy) | New section |
| `client/src/styles/phone.css` | Add `.actions-list`, `.action` (TB-cost action items) | New section |
| `client/src/components/PhoneOverlay.ts` | Add `createAppGrid()` method with 8 app icons | After line ~48 |
| `client/src/components/PhoneOverlay.ts` | Add status bars (TB progress, energy) | After line ~103 |
| `client/src/components/PhoneOverlay.ts` | Add actions list (run, study, investigate, sleep) | After line ~103 |
| `client/src/components/TerminalModal.ts` | (Optional) Add command terminal mode with `ayuda`, `estado`, `mapa`, etc. | New class or extend existing |

---

## Quick Reference: Prompt File Locations

```
docs/lore/assets/ui-concepts/
├── ASSET_MANIFEST.md                          ← Original manifest (updated with prompt refs)
├── UI_ASSET_INVENTORY.md                      ← THIS FILE — complete workflow reference
├── isometric-map/
│   ├── index.html                             ← Concept mockup
│   └── assets/
│       ├── tile_street.prompt.md              ← Copy-paste into AI tool
│       ├── tile_beach_sand.prompt.md
│       ├── ... (10 tile prompts)
│       ├── lm_palacio_municipal.prompt.md
│       ├── ... (6 landmark prompts)
├── vn-interface/
│   ├── index.html                             ← Concept mockup
│   └── assets/
│       ├── bg_puerto_noche.prompt.md
│       ├── bg_callejon_centro.prompt.md
│       ├── bg_laboratorio.prompt.md
│       ├── portrait_alex.prompt.md
│       └── portrait_mateo.prompt.md
└── phone-terminal/
    ├── index.html                             ← Concept mockup
    └── assets/
        ├── wallpaper_las_flores.prompt.md
        ├── app_mapa.prompt.md
        ├── app_chat.prompt.md
        ├── ... (8 app icon prompts)
```

---

## Step-by-Step: What to Do Next

### Step 2 — Generate Assets (you do this)

Each `.prompt.md` now contains multiple prompt variants (Base + Night/Weather + Alt). The Pollinations draft script can generate first drafts automatically; final production assets should still be run through MidJourney/DALL-E for quality.

#### Option A: Auto-generate first drafts with Pollinations (recommended starting point)

```bash
# One-time: initialize state manifest
bash docs/lore/assets/scripts/generate-drafts.sh init

# Check status
bash docs/lore/assets/scripts/generate-drafts.sh status

# Generate all drafts (saves to docs/lore/assets/ui-concepts/*/drafts/)
bash docs/lore/assets/scripts/generate-drafts.sh run

# Generate only specific types
bash docs/lore/assets/scripts/generate-drafts.sh run --filter tile
bash docs/lore/assets/scripts/generate-drafts.sh run --filter portrait,background

# Preview without downloading
bash docs/lore/assets/scripts/generate-drafts.sh run --dry-run
```

Output structure:
```
docs/lore/assets/ui-concepts/
├── isometric-map/assets/
│   ├── tile_street.prompt.md
│   └── drafts/
│       ├── tile_street__base.png
│       ├── tile_street__night_variant.png
│       └── tile_street__wet_rainy_variant.png
├── vn-interface/assets/
│   ├── bg_puerto_noche.prompt.md
│   └── drafts/
│       ├── bg_puerto_noche__base.png
│       └── ...
```

#### Option B: Manual generation with MidJourney / DALL-E / Stable Diffusion

1. Open each `.prompt.md` file
2. Copy the prompt variant you want into your AI tool
3. Use the generation settings specified in the prompt header
4. Download the generated asset
5. Upload to MinIO using the paths in [MinIO Upload Paths](#minio-upload-paths)

#### Finalize

After generating drafts or production assets:
```bash
# Verify all referenced assets exist in MinIO
node docs/lore/assets/scripts/verify-assets.mjs

# Check MIME types match extensions
node docs/lore/assets/scripts/verify-assets.mjs --check-mime

# Check aspect ratios match expectations
node docs/lore/assets/scripts/verify-assets.mjs --check-dimensions
```

### Step 3 — Apply to Client (second chat)

1. Open a new chat with the context: "We have all 30 UI assets uploaded to MinIO. Apply them to the client following the integration map in `docs/lore/assets/ui-concepts/UI_ASSET_INVENTORY.md`"
2. The second chat will:
   - Update `map.css` + `MapView.tsx` for isometric rendering
   - Update `dialogue.css` + `dialogue-templates.ts` + `DialogueUI.ts` for VN portraits/backgrounds
   - Update `phone.css` + `PhoneOverlay.ts` for wallpaper/app grid/status bars
   - Run `npm run lint --workspace=client` and `npm run build --workspace=client`
