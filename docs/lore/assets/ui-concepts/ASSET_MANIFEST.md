# UI Concepts — Asset Manifest

**Date:** 2026-07-01
**Target:** `docs/lore/assets/ui-concepts/[concept]/assets/`

---

## Audit Result

All three HTML concept pages currently render everything with CSS/JS/emoji.
No `<img src="...">` or `background-image: url(...)` references exist in any mockup.
This manifest defines the **minimal asset set** needed to evolve each concept from
"CSS placeholders" → "asset-backed visual proposal".

---

## 1. Isometric District Map

**Concept directory:** `docs/lore/assets/ui-concepts/isometric-map/`

### Required Assets

| # | Asset | File | Size | Notes |
|---|-------|------|------|-------|
| 1 | Tile texture: street | `assets/tile_street.png` | 256×256 | Seamless top-down asphalt with pastel cracks |
| 2 | Tile texture: beach sand | `assets/tile_beach_sand.png` | 256×256 | Seamless top-down warm sand |
| 3 | Tile texture: ocean water | `assets/tile_water_ocean.png` | 256×256 | Top-down turquoise, no horizon |
| 4 | Tile texture: river water | `assets/tile_water_river.png` | 256×256 | Murky green-brown, chemical sheen |
| 5 | Tile texture: park grass | `assets/tile_grass_park.png` | 256×256 | Seamless top-down green, dappled light |
| 6 | Tile texture: cobblestone | `assets/tile_cobblestone.png` | 256×256 | Weathered Old Town cobbles with moss |
| 7 | Tile texture: industrial concrete | `assets/tile_industrial_concrete.png` | 256×256 | Cracked concrete, oil stains, cold gray |
| 8 | Tile texture: desert sand | `assets/tile_desert_sand.png` | 256×256 | Fine golden grain, wind ripples |
| 9 | Tile texture: civic building | `assets/tile_building_civic.png` | 256×256 | Top-down stone roof, official crest |
| 10 | Tile texture: residential | `assets/tile_building_residential.png` | 256×256 | Faded paint, laundry lines |
| 11 | Landmark overlay: Palacio Municipal | `assets/lm_palacio_municipal.png` | 256×256 | Transparent PNG, top-down civic footprint |
| 12 | Landmark overlay: World Trade Center | `assets/lm_world_trade_center.png` | 256×256 | Transparent PNG, top-down skyscraper shape |
| 13 | Landmark overlay: Playa entrance | `assets/lm_playa_entrada.png` | 256×256 | Transparent PNG, beach access signage shape |
| 14 | Landmark overlay: Teatro Nacional | `assets/lm_teatro_nacional.png` | 256×256 | Transparent PNG, facade shape |
| 15 | Landmark overlay: Electra Battery factory | `assets/lm_electra.png` | 256×256 | Transparent PNG, industrial footprint |
| 16 | Landmark overlay: Iglesia Vieja | `assets/lm_iglesia_vieja.png` | 256×256 | Transparent PNG, church shape |

### Current state in HTML
- Tiles use CSS `background: #hex` from the `TERRAIN` map (no images).
- Landmarks render as emoji (`🏛️`, `🏢`, `🌊`, `🎭`, `🏭`, `🛐`) inside `<div class="tile-icon">`.
- No tile-image or overlay-image fields in JS data model.

### Upgrade path
1. Replace `tile.style.background = TERRAIN[t].color` with `background-image: url('assets/tile_street.png')`.
2. Add optional `imageUrl` to each LANDMARK entry; render `<img>` inside the tile instead of emoji when present.
3. Add day/night tile variants by swapping url or layering CSS tint.

---

## 2. Visual Novel Interface

**Concept directory:** `docs/lore/assets/ui-concepts/vn-interface/`

### Required Assets

| # | Asset | File | Size | Notes |
|---|-------|------|------|-------|
| 1 | Location BG: Puerto noche | `assets/bg_puerto_noche.jpg` | 1920×1080 | Wet neon-drenched pier, boilerplate location scene |
| 2 | Location BG: Callejon Centro | `assets/bg_callejon_centro.jpg` | 1920×1080 | Shadowed alley, amber light pools |
| 3 | Location BG: Laboratorio | `assets/bg_laboratorio.jpg` | 1920×1080 | Dim workshop, screens, cables |
| 4 | Portrait: Alex Garcia | `assets/portrait_alex.png` | 512×768 | Transparent PNG, night student look |
| 5 | Portrait: Mateo | `assets/portrait_mateo.png` | 512×768 | Transparent PNG, older dockworker look |

### Current state in HTML
- `.portrait-area` contains `.portrait-placeholder` (emoji `🧑‍🎓`) — no `<img>` tag.
- `.game-viewport` background is pure CSS gradients + `bg-city` grid overlay.

### Upgrade path
1. Replace `.portrait-placeholder` div with `<img src="assets/portrait_alex.png" alt="Alex">` and switch `src` on speaker change.
2. Add `<img class="scene-bg" src="assets/bg_puerto_noche.jpg">` inside `.game-viewport` above the effects layers.

---

## 3. Phone & Terminal (Daily Life)

**Concept directory:** `docs/lore/assets/ui-concepts/phone-terminal/`

### Required Assets

| # | Asset | File | Size | Notes |
|---|-------|------|------|-------|
| 1 | Phone wallpaper | `assets/wallpaper_las_flores.jpg` | 1080×1920 | Night skyline, phone lock-screen crop |
| 2 | App icon: Mapa | `assets/app_mapa.png` | 128×128 | Transparent icon |
| 3 | App icon: Chat | `assets/app_chat.png` | 128×128 | Transparent icon |
| 4 | App icon: Misiones | `assets/app_misiones.png` | 128×128 | Transparent icon |
| 5 | App icon: Agenda | `assets/app_agenda.png` | 128×128 | Transparent icon |
| 6 | App icon: Noticias | `assets/app_noticias.png` | 128×128 | Transparent icon |
| 7 | App icon: Radio | `assets/app_radio.png` | 128×128 | Transparent icon |
| 8 | App icon: Mercado | `assets/app_mercado.png` | 128×128 | Transparent icon |
| 9 | App icon: Ajustes | `assets/app_ajustes.png` | 128×128 | Transparent icon |
| 10 | Phone frame notch | `assets/phone_notch.png` | 200×40 | Transparent pill shape, top bezel |

### Current state in HTML
- App icons are emoji inside `.app-icon` divs.
- No wallpaper; phone-frame has flat `background: var(--bg)`.

### Upgrade path
1. Replace emoji in `.app-icon` with `<img src="assets/app_mapa.png" width="32">`.
2. Set `.phone-frame` background to `url('assets/wallpaper_las_flores.jpg')` with blur + overlay.

---

## Generation Plan

Total assets: ~26 files.
Generation order:
1. **Phase A — Tiles (10)** → isometric map base layer
2. **Phase B — Landmark overlays (6)** → isometric map landmarks
3. **Phase C — VN backgrounds (3) + portraits (2)** → VN interface
4. **Phase D — Phone app icons (8) + wallpaper + notch (2)** → Phone terminal

Each asset will be generated via Pollinations free endpoint (`image.pollinations.ai/prompt/...`).
Landmark overlays and portraits request `transparent background`; actual transparency depends
on Pollinations output. Post-process notes included in each prompt.

---

## Prompt Library (condensed)

### Tiles
```
Top-down seamless tileable texture of [DESCRIPTION], Las Flores 2077,
soft cyberpunk pastel palette, photorealistic, 512x512, no objects,
no people, no horizon, no sky, centered square crop.
--no androids, robots, neon, modern objects, buildings, people, text
```

### Landmark overlays
```
Top-down view of [LANDMARK], Las Flores 2077, [DESCRIPTION],
transparent background, centered, isolated asset, realistic, 512x512.
--no people, vehicles, neon, shadows, environmental background, text
```

### VN backgrounds
```
Location scene: [DESCRIPTION], Las Flores 2077, soft cyberpunk,
warm pastels and cold neon accents, cinematic composition,
photorealistic, wide aspect, 1920x1080.
--no androids, robots, text, modern 2020s objects, cartoon, anime
```

### VN portraits
```
Portrait of [CHARACTER], Las Flores 2077, [DESCRIPTION],
transparent background, centered bust, soft neon rim lighting,
vivid pastels, 512x768, photorealistic.
--no full body, environment, background, text, modern 2020s fashion
```

### Phone assets
```
Phone app icon design: [ICON NAME], Las Flores 2077 style,
soft cyberpunk pastel, minimalist geometric icon, transparent background,
centered, 128x128, sharp edges.
--no text, complex details, shadows, gradients, neon glow
```

Wallpaper:
```
Phone wallpaper for Las Flores 2077, night city skyline from a distance,
soft pastel lights, wet streets reflecting, no text, no logos, 1080x1920,
vertical composition.
--no androids, robots, neon signs, modern 2020s buildings, cartoon, anime
```
