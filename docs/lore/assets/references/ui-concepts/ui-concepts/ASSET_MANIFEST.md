# UI Concepts — Asset Manifest

**Date:** 2026-07-01
**Target:** `docs/lore/assets/ui-concepts/[concept]/assets/`

---

## Audit Result

All three HTML concept pages currently render everything with CSS/JS/emoji.
No `<img src="...">` or `background-image: url(...)` references exist in any mockup.
This manifest defines the **full asset set** needed to evolve each concept from
"CSS placeholders" → "asset-backed visual proposal", aligned with lore district terrain.

---

## 1. Isometric District Map

**Concept directory:** `docs/lore/assets/ui-concepts/isometric-map/`

### Required Assets

| # | Asset | File | Size | Prompt File | Notes |
|---|-------|------|------|-------------|-------|
| 1 | Tile texture: street | `assets/tile_street.png` | 256×256 | `assets/tile_street.prompt.md` | Seamless top-down asphalt with pastel cracks |
| 2 | Tile texture: beach sand | `assets/tile_beach_sand.png` | 256×256 | `assets/tile_beach_sand.prompt.md` | Seamless top-down warm sand |
| 3 | Tile texture: ocean water | `assets/tile_water_ocean.png` | 256×256 | `assets/tile_water_ocean.prompt.md` | Top-down turquoise, no horizon |
| 4 | Tile texture: river water | `assets/tile_water_river.png` | 256×256 | `assets/tile_water_river.prompt.md` | Murky green-brown, chemical sheen |
| 5 | Tile texture: park grass | `assets/tile_grass_park.png` | 256×256 | `assets/tile_grass_park.prompt.md` | Seamless top-down green, dappled light |
| 6 | Tile texture: cobblestone | `assets/tile_cobblestone.png` | 256×256 | `assets/tile_cobblestone.prompt.md` | Weathered Old Town cobbles with moss |
| 7 | Tile texture: industrial concrete | `assets/tile_industrial_concrete.png` | 256×256 | `assets/tile_industrial_concrete.prompt.md` | Cracked concrete, oil stains, cold gray |
| 8 | Tile texture: desert sand | `assets/tile_desert_sand.png` | 256×256 | `assets/tile_desert_sand.prompt.md` | Fine golden grain, wind ripples |
| 9 | Tile texture: civic building | `assets/tile_building_civic.png` | 256×256 | `assets/tile_building_civic.prompt.md` | Top-down stone roof, official crest |
| 10 | Tile texture: residential | `assets/tile_building_residential.png` | 256×256 | `assets/tile_building_residential.prompt.md` | Faded paint, laundry lines |
| 11 | Tile texture: sidewalk | `assets/tile_sidewalk.png` | 256×256 | `assets/tile_sidewalk.prompt.md` | Concrete slabs, pastel paint marks |
| 12 | Tile texture: port asphalt | `assets/tile_port_asphalt.png` | 256×256 | `assets/tile_port_asphalt.prompt.md` | Weathered tarmac, salt stains, rust |
| 13 | Tile texture: mountain rock | `assets/tile_mountain_rock.png` | 256×256 | `assets/tile_mountain_rock.prompt.md` | Gray-brown scree with mineral flecks |
| 14 | Tile texture: forest | `assets/tile_forest.png` | 256×256 | `assets/tile_forest.prompt.md` | Tropical canopy, dense layered green |
| 15 | Tile texture: swamp | `assets/tile_swamp.png` | 256×256 | `assets/tile_swamp.prompt.md` | Muddy water, cypress roots, peat |
| 16 | Tile texture: farmland | `assets/tile_farmland.png` | 256×256 | `assets/tile_farmland.prompt.md` | Crop rows, irrigation furrows |
| 17 | Tile texture: runway | `assets/tile_runway.png` | 256×256 | `assets/tile_runway.prompt.md` | Airport tarmac, faded centerlines |
| 18 | Landmark overlay: Palacio Municipal | `assets/lm_palacio_municipal.png` | 256×256 | `assets/lm_palacio_municipal.prompt.md` | Transparent PNG, top-down civic footprint |
| 19 | Landmark overlay: World Trade Center | `assets/lm_world_trade_center.png` | 256×256 | `assets/lm_world_trade_center.prompt.md` | Transparent PNG, top-down skyscraper shape |
| 20 | Landmark overlay: Playa entrance | `assets/lm_playa_entrada.png` | 256×256 | `assets/lm_playa_entrada.prompt.md` | Transparent PNG, beach access signage shape |
| 21 | Landmark overlay: Teatro Nacional | `assets/lm_teatro_nacional.png` | 256×256 | `assets/lm_teatro_nacional.prompt.md` | Transparent PNG, facade shape |
| 22 | Landmark overlay: Electra Battery factory | `assets/lm_electra.png` | 256×256 | `assets/lm_electra.prompt.md` | Transparent PNG, industrial footprint |
| 23 | Landmark overlay: Iglesia Vieja | `assets/lm_iglesia_vieja.png` | 256×256 | `assets/lm_iglesia_vieja.prompt.md` | Transparent PNG, church shape |
| 24 | Landmark overlay: Governor's Offices | `assets/lm_governor_offices.png` | 256×256 | `assets/lm_governor_offices.prompt.md` | Transparent PNG, stark modern glass |
| 25 | Landmark overlay: Mercado Central | `assets/lm_mercado_central.png` | 256×256 | `assets/lm_mercado_central.prompt.md` | Transparent PNG, colorful market stalls |
| 26 | Landmark overlay: Universidad Nacional | `assets/lm_universidad_nacional.png` | 256×256 | `assets/lm_universidad_nacional.prompt.md` | Transparent PNG, campus courtyard |
| 27 | Landmark overlay: Luz del Río | `assets/lm_luz_del_rio.png` | 256×256 | `assets/lm_luz_del_rio.prompt.md` | Transparent PNG, dam and turbines |
| 28 | Landmark overlay: Puerto de Las Flores | `assets/lm_puerto_de_las_flores.png` | 256×256 | `assets/lm_puerto_de_las_flores.prompt.md` | Transparent PNG, cargo cranes and piers |
| 29 | Landmark overlay: Parque de las Montañas | `assets/lm_parque_de_las_montanas.png` | 256×256 | `assets/lm_parque_de_las_montanas.prompt.md` | Transparent PNG, pavilion and paths |
| 30 | Landmark overlay: Mall de las Estrellas | `assets/lm_mall_de_las_estrellas.png` | 256×256 | `assets/lm_mall_de_las_estrellas.prompt.md` | Transparent PNG, luxury retail footprint |
| 31 | Landmark overlay: Van der Meer Northern Mine | `assets/lm_van_der_meer_northern_mine.png` | 256×256 | `assets/lm_van_der_meer_northern_mine.prompt.md` | Transparent PNG, open-pit mine terraces |
| 32 | Landmark overlay: Far South Outpost | `assets/lm_far_south_outpost.png` | 256×256 | `assets/lm_far_south_outpost.prompt.md` | Transparent PNG, desert outpost walls |

### Current state in HTML
- Tiles use CSS `background: #hex` from the `TERRAIN` map (no images).
- Landmarks render as emoji (`🏛️`, `🏢`, `🌊`, `🎭`, `🏭`, `🛐`) inside `<div class="tile-icon">`.
- No tile-image or overlay-image fields in JS data model.
- 7 additional terrain types and 9 additional landmarks have prompt files but are not yet represented in the HTML data.

### Upgrade path
1. Replace `tile.style.background = TERRAIN[t].color` with `background-image: url('assets/tile_street.png')`.
2. Add optional `imageUrl` to each LANDMARK entry; render `<img>` inside the tile instead of emoji when present.
3. Add day/night tile variants by swapping url or layering CSS tint.
4. Add new terrain types to `TERRAIN_COLORS` in `MapView.tsx` and map them to prompt-generated tiles.

---

## 2. Visual Novel Interface

**Concept directory:** `docs/lore/assets/ui-concepts/vn-interface/`

### Required Assets

| # | Asset | File | Size | Prompt File | Notes |
|---|-------|------|------|-------------|-------|
| 1 | Location BG: Puerto noche | `assets/bg_puerto_noche.jpg` | 1920×1080 | `assets/bg_puerto_noche.prompt.md` | Wet neon-drenched pier, boilerplate location scene |
| 2 | Location BG: Callejon Centro | `assets/bg_callejon_centro.jpg` | 1920×1080 | `assets/bg_callejon_centro.prompt.md` | Shadowed alley, amber light pools |
| 3 | Location BG: Laboratorio | `assets/bg_laboratorio.jpg` | 1920×1080 | `assets/bg_laboratorio.prompt.md` | Dim workshop, screens, cables |
| 4 | Location BG: Governor's Offices | `assets/bg_governor_offices.jpg` | 1920×1080 | `assets/bg_governor_offices.prompt.md` | Modern glass-walled government office |
| 5 | Location BG: Mercado Central | `assets/bg_mercado_central.jpg` | 1920×1080 | `assets/bg_mercado_central.prompt.md` | Colorful open-air market with striped awnings |
| 6 | Location BG: Puerto de Las Flores | `assets/bg_puerto_de_las_flores.jpg` | 1920×1080 | `assets/bg_puerto_de_las_flores.prompt.md` | Cargo port with cranes and containers |
| 7 | Location BG: Luz del Río | `assets/bg_luz_del_rio.jpg` | 1920×1080 | `assets/bg_luz_del_rio.prompt.md` | Hydroelectric dam and turbines |
| 8 | Location BG: Van der Meer Mine | `assets/bg_van_der_meer_mine.jpg` | 1920×1080 | `assets/bg_van_der_meer_mine.prompt.md` | Open-pit lithium mine terraces |
| 9 | Portrait: Alex Garcia | `assets/portrait_alex.png` | 512×768 | `assets/portrait_alex.prompt.md` | Transparent PNG, night student look |
| 10 | Portrait: Mateo | `assets/portrait_mateo.png` | 512×768 | `assets/portrait_mateo.prompt.md` | Transparent PNG, older dockworker look |

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

| # | Asset | File | Size | Prompt File | Notes |
|---|-------|------|------|-------------|-------|
| 1 | Phone wallpaper | `assets/wallpaper_las_flores.jpg` | 1080×1920 | `assets/wallpaper_las_flores.prompt.md` | Night skyline, phone lock-screen crop |
| 2 | App icon: Mapa | `assets/app_mapa.png` | 128×128 | `assets/app_mapa.prompt.md` | Transparent icon |
| 3 | App icon: Chat | `assets/app_chat.png` | 128×128 | `assets/app_chat.prompt.md` | Transparent icon |
| 4 | App icon: Misiones | `assets/app_misiones.png` | 128×128 | `assets/app_misiones.prompt.md` | Transparent icon |
| 5 | App icon: Agenda | `assets/app_agenda.png` | 128×128 | `assets/app_agenda.prompt.md` | Transparent icon |
| 6 | App icon: Noticias | `assets/app_noticias.png` | 128×128 | `assets/app_noticias.prompt.md` | Transparent icon |
| 7 | App icon: Radio | `assets/app_radio.png` | 128×128 | `assets/app_radio.prompt.md` | Transparent icon |
| 8 | App icon: Mercado | `assets/app_mercado.png` | 128×128 | `assets/app_mercado.prompt.md` | Transparent icon |
| 9 | App icon: Ajustes | `assets/app_ajustes.png` | 128×128 | `assets/app_ajustes.prompt.md` | Transparent icon |
| 10 | Phone frame notch | `assets/phone_notch.png` | 200×40 | — (CSS-derivable) | Transparent pill shape, top bezel |

### Current state in HTML
- App icons are emoji inside `.app-icon` divs.
- No wallpaper; phone-frame has flat `background: var(--bg)`.

### Upgrade path
1. Replace emoji in `.app-icon` with `<img src="assets/app_mapa.png" width="32">`.
2. Set `.phone-frame` background to `url('assets/wallpaper_las_flores.jpg')` with blur + overlay.

---

## Generation Plan

Total assets: 51 prompt files producing 150 prompt variants.
Generation order:
1. **Phase A — Tiles (17)** → isometric map base layer
2. **Phase B — Landmark overlays (15)** → isometric map landmarks
3. **Phase C — VN backgrounds (8) + portraits (2)** → VN interface
4. **Phase D — Phone app icons (8) + wallpaper** → Phone terminal

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
