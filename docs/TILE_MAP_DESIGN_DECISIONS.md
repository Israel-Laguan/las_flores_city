# Las Flores 2077: Tile Map Design Decisions

> **Purpose:** Consolidated design decisions for the tile-based city map system with full brainstorming rationale.
> **Audience:** UI/UX designer, visual designer, AI art prompt engineer, frontend developer.
> **Status:** Decisions finalized — ready for implementation.

---

## 1. Executive Summary

| # | Question | Decision | Key Rationale |
|---|----------|----------|---------------|
| 1 | Tile style | **2-tier hybrid**: SVG vectors + top-down raster textures | SVG provides scalability; raster adds photorealistic detail. Matches soft cyberpunk aesthetic. |
| 2 | Tile resolution | **SVG for structure, 256×256 PNG/WebP for detail tiles** | Infinite scalability for map geometry; fixed 256×256 keeps generation fast and rendering crisp. |
| 3 | Place representation | **One tile = one location**, reusable terrain base + optional unique landmark overlay | Most intuitive for navigation; overhead = minimal extra assets. Non-landmarks get small dot icons desktop, cards mobile. |
| 4 | Day/night | **CSS filters** + weather overlays | Zero extra assets; extends existing `mood-effects.ts` pattern to DOM. |
| 5 | World overview | **HTML/CSS hybrid**: SVG district outlines + raster panorama backdrop + CSS-animated overlays | Atmospheric, scalable, mobile-friendly. Parallax/mist via CSS animations. |
| 6 | Mobile district view | **Flat location cards** (reuse `CityNav` pattern, filtered by district) | Reuses existing UI, zero new assets, fastest implementation. |
| 7 | Grid shape | **Variable density** (district area → tile count) with organic overlays | Maps directly to `geography.md` km² values. Parks, rivers, streets create organic feel within rectangular district bounds. |
| 8 | Tile edges | **Blended transitions** via SVG masks + decorative borders (streets, hedges) | More atmospheric than hard edges; streets act as natural separators. |

### Sprites & Animations: Phaser-Only Zone

**Sprites, spritesheets, animated tiles, and particle effects are reserved for Phaser location scenes only.** The web map navigation layer (HTML/CSS/SVG) stays lightweight and static. This preserves mobile battery/CPU while letting locations feel alive via `LocationScene.ts` enhancements.

---

## 2. Architecture: Two Distinct Layers

### Layer 1 — Web/DOM Map Navigation

**Technologies:** HTML + CSS + SVG (no Phaser, no sprites, no canvas)

| Component | Tech | Purpose |
|-----------|------|---------|
| World overview | SVG + CSS | District outlines, clickable zones, labels, panorama backdrop |
| District tile grid | CSS Grid + `<div>` backgrounds | Tile rendering with raster textures |
| Landmark overlays | `<img>` or CSS `background-image` (transparent PNG) | Unique per-location visuals on top of terrain tiles |
| Weather/mood | CSS animations + `filter` | Rain streaks, fog drift, day/night tint, tense vignette |
| Interactions | DOM event listeners | Click/tap, hover tooltips, touch gestures |

**Key constraint:** No `<canvas>`, no WebGL, no Phaser game instance active. This is the domain of `MapView.ts` (replaces `CityNav.ts` on desktop; falls back to cards on mobile).

### Layer 2 — Phaser Location Scenes

**Technologies:** Phaser 3 (existing `LocationScene.ts` + enhancements)

| Feature | Phaser Feature | Where Used |
|---------|---------------|-----------|
| Rain particles | `Phaser.GameObjects.Particles.ParticleEmitter` | Already implemented in `mood-effects.ts` |
| Tense vignette | `Phaser.GameObjects.Graphics` | Already implemented in `mood-effects.ts` |
| NPC animations | Spritesheets, `Phaser.GameObjects.Sprite` | `npc-renderer.ts` — walking, idle, talk cycles |
| Background parallax | `Phaser.GameObjects.TileSprite` | Animated backgrounds (waves, machinery) |
| Animated tiles | `this.add.tileSprite()` | Factory conveyor belts, river currents |
| Ambient effects | Particle textures, tweens | Fireflies at the park, neon buzz, steam vents |
| Audio integration | `AudioManager` + `scene.sound` | Already implemented; crossfade on travel |

**Enhancement opportunity:** Add spritesheet libraries for common animated elements. When entering a location from the map, `LocationScene` loads the relevant animation set alongside the background image, following the same `bootstrapScene()` pattern already established.

### Bridge: Navigation Flow

```
User clicks tile on MapView.ts
  → MapView emits: navigateTo('/city/loc/' + locationId)
    → router.ts resolves to existing LocationScene flow
      → LocationScene.bootstrapScene() loads background + NPCs + new: animations
        → Player sees immersive scene with sprites, particles, mood effects
```

**Back navigation:** `LocationScene` back button → returns to `/map/:districtSlug` (MapView CSS grid).

---

## 3. Question-by-Question Brainstorming & Decisions

### Q1: Visual Style for Tiles

**Options considered:**
- **A) Top-down 2D** — bird's eye, flat textures with clear edges
- **B) Isometric 2D** — 45° angle, slight perspective
- **C) Flat icon/graphic** — simplified stylized shapes

**Decision:** Hybrid A + SVG structure. The coordinate system is top-down 2D tiles. District shapes and tile placement are defined as SVG `<rect>` or `<path>` elements. Each tile cell is a CSS Grid slot with a raster PNG/WebP texture applied as `background-image`. SVG provides the scalable, clickable district geometry; raster provides the photorealistic atmospheric detail.

**Rationale:**
- SVG handles the "map as UI" perfectly: clickable zones, labels, responsive scaling, no pixelation.
- Raster tiles provide the texture, grime, and environmental storytelling that pure SVG cannot easily capture.
- External opinion (your embedded text) confirms this split: *"HTML/CSS/SVG for the big map navigation (lightweight, mobile-friendly, scalable vectors, easy DOM interactions)."*

**Implementation:** District view uses CSS Grid (`repeat(auto-fit, minmax(120px, 1fr))`). Each grid cell is a `<div>` with inline `style="background-image: url(tileTexture)"`. SVG handles only the world-map overview overlay.

---

### Q2: Tile Resolution

**Options considered:**
- 256×256 for source, display at 120×120
- 512×512 for source, display at 120×120 (retina crisp but heavier)
- Single SVG texture for entire district (one large piece)

**Decision:** Two-tier:
- **SVG metadata layer** (infinite resolution): defines district outlines, tile positions, landmark placements, labels.
- **Raster detail layer** (256×256 px): PNG or WebP, displayed at 120×120 CSS px. Source at 256×256 for generation speed; use WebP compression to keep under 150 KB per tile.

**Rationale:**
- Tile textures are small, repeatable patches (sand, street, water). They tile seamlessly via CSS `background-repeat`.
- 256×256 is the sweet spot for AI art generation (Midjourney, Stable Diffusion). Higher resolutions cost 2× generation time and file size for diminishing visual benefit at 120×120 display.
- SVG handles the "structure" at any resolution, so the raster format is purely additive detail.

---

### Q3: How Are Places Represented?

**Options considered:**
- A) One tile = one location
- B) District center marker
- C) Overlay icons on terrain

**Decision:** **A + selective C.** Every location in a district gets one clickable tile. The tile's base texture is a reusable terrain type (sand, street, park). If the location is a landmark (notable building, entrance, city hall), it also gets a **unique transparent PNG overlay** placed as an `<img>` absolutely positioned on top of the tile. Non-landmark locations (street corners, generic housing) get a small CSS dot icon instead of a full overlay, saving assets.

**Example — Playa de los Vientos beach district:**
- Tiles 1–20: `beach_sand` or `water_ocean` base textures (seamless repeat).
- Tile 4: Overlay = PNG of the beach pavilion building (transparent background, top-down footprint).
- Tile 7: Overlay = PNG of the surf statue.
- Tile 12: No unique overlay; small CSS dot icon → "El Palmar" coastal town (plain tile, labeled on hover).

**Rationale:**
- *"Base repeated but we use other elements to make it more organic"* — this matches your assessment.
- Landmark overlays add visual interest without requiring unique terrain for every location.
- Semantic zoom: at larger CSS grid sizes, both overlays and dot-icons appear; at smaller mobile sizes, overlays remain and dot-icons collapse to cards.

---

### Q4: Day/Night Variation

**Options considered:**
- A) CSS filter toggle on tile container
- B) Tint via Phaser/DOM overlay
- C) Separate asset sets (2× generation)

**Decision:** **A (CSS filters) + weather overlays + Phaser mood effects.**

**Specs:**

```css
/* Day (default) */
.map-tile {
  filter: brightness(1) saturate(1);
}

/* Night (automatic: ≤10 TB remaining, or manual toggle) */
.map-tile.night {
  filter: brightness(0.7) hue-rotate(215deg) saturate(0.6);
}

/* Optional: dusk transition */
.map-tile.dusk {
  filter: brightness(0.85) hue-rotate(215deg) saturate(0.8);
}
```

**Weather overlays (CSS animations):**
```css
.map-weather-rain {
  background: linear-gradient(transparent 0%, rgba(100,100,140,0.15) 100%);
  animation: rain-drift 0.6s linear infinite;
}

.map-weather-fog {
  background: radial-gradient(ellipse at center, rgba(200,200,220,0.3) 0%, transparent 70%);
  animation: fog-drift 8s ease-in-out infinite alternate;
}
```

**Mimicking `mood-effects.ts` in DOM:**
- `applyRainEffect` (Phaser particles) → CSS `:after` pseudo-element with repeated linear-gradient diagonal stripes, animated with `background-position` keyframes.
- `applyTenseEffect` (Phaser Graphics rect + vignette) → CSS `box-shadow: inset` multi-layer vignette with `rgba(255,0,0,0.08)` tint on `.map-container.tense`.
- `applyNeonEffect` (Phaser Graphics overlay) → CSS `background: rgba(0,0,60,0.35)` on `.map-container.neon`.

**Rationale:**
- Zero extra assets. CSS filters and animations are hardware-accelerated on modern browsers.
- The Phaser mood effects remain inside `LocationScene`. The web layer has its own CSS equivalents, keeping the two worlds visually consistent without sharing assets.

---

### Q5: World Map Image (Desktop Overview)

**Options considered:**
- A) Stylized SVG map
- B) Single painted panorama (raster) with DOM overlay buttons
- C) Grid of thumbnails

**Decision:** **B, with SVG overlay labels.**

Structure:
```html
<div class="world-overview">
  <!-- Atmospheric raster backdrop -->
  <img src="panorama-las-flores-2077.png"
       alt="Las Flores city panorama"
       class="world-panorama">
  
  <!-- SVG overlay for clickable districts -->
  <svg class="world-districts" viewBox="0 0 2400 800">
    <!-- Clickable hot-zones positioned over the panorama -->
    <rect data-district="city" x="400" y="200" width="300" height="250" class="district-zone"/>
    <rect data-district="pacific" x="50" y="100" width="200" height="150" class="district-zone"/>
    <!-- Labels are SVG <text> elements or DOM <div> absolutely positioned -->
  </svg>
  
  <!-- Hover tooltips / labels -->
  <div class="district-label" style="left: 550px; top: 320px;">
    <span class="district-name">City District</span>
    <span class="district-count">30 tiles</span>
  </div>
</div>
```

**Rationale:**
- Panorama gives the atmospheric, editorial feel of a soft-cyberpunk painted illustration.
- SVG overlay provides crisp, scalable click targets with perfect hover/active states.
- DOM labels are accessible and easy to style with the existing CSS variable system.

---

### Q6: Mobile District View

**Decision:** **Flat location cards.** Same component as `CityNav` but filtered to the district. This reuses the existing DOM pattern, requires zero new assets, and is the fastest path to implementation.

**Fallback for very small screens (< 360px):** Collapse district header and show compact cards with only icon + name; description hidden until expanded.

---

### Q7: Tilemap Grid Shape

**Background from `geography.md`:**

| District | Area (km²) | Proposed Tile Count |
|----------|-----------|---------------------|
| City District | 30 | 30 tiles |
| Industrial Zone | 20 | 20 tiles |
| North District | 20 | 20 tiles |
| Northeast District | 15 | 15 tiles |
| South District | 15 | 15 tiles |
| Central (Suburbs) | 15 | 15 tiles |
| Port District | 15 | 15 tiles |
| Old Las Flores | 10 | 10 tiles |
| Pacific Coast | 10 | 10 tiles |
| Los Andes | 5 | 5 tiles |
| Far South | 5 | 5 tiles |

**District grid layout rules:**
- Rectangular base grid sized to tile count (e.g., City = 6×5, Industrial = 5×4).
- Edges are cropped to suggest geography without hard borders (using CSS Grid with transparent/void tiles at edges).
- Terrain assignment heuristic (hand-authored YAML or simple procedural fallback):
  - Coastal districts: weight toward `water_ocean`, `beach_sand`.
  - Industrial: weight toward `industrial_concrete`, `street`.
  - Far South: weight toward `desert_sand`.
  - Central: mix of `street`, `sidewalk`, `grass_park`.
- Landmark overlays are hand-placed at specific grid coordinates.

**Why variable density beats rectangular uniformity:**
- Geographic authenticity — players familiar with Las Flores lore recognize that the City is larger than Far South.
- Natural visual hierarchy — larger districts draw more attention on the world overview.
- Direct mapping to travel distances; TB costs can be normalized to tile distance.

---

### Q8: Tile Edge/Transition Handling

**Decision:** **Blended via SVG + decorative overlays.**

- **Base tiles** (`street`, `sidewalk`) have built-in visual noise (cracks, faded paint) that masks hard edges.
- **Transition tiles** are not separate assets. Instead:
  - Use CSS `box-shadow: inset` on tile cells to create shadow/depth at borders.
  - Add SVG `<path>` overlays for rivers, coastlines, major roads that sit on top of the grid, visually uniting terrain cells.
  - Parks (`grass_park`) and water tiles naturally break up building/street tiles.
- **Street tiles as separators:** The grid itself is interleaved with 1-wide "street" corridors between blocks of buildings. This is a layout decision, not an asset decision — the street tiles form a natural visual break.

**Example — Industrial Zone layout:**
```
[industrial_concrete] [industrial_concrete] [industrial_concrete]
[street]             [street]             [street]
[industrial_concrete] [industrial_concrete] [industrial_concrete]
```

---

## 4. Asset Specification (Revised)

### Tier A: SVG Vector Assets

**File format:** Inline SVG or `.svg` files served from MinIO.
**Count:** 12 files (1 world overview + 11 district outlines).
**Spec:** Each district SVG contains `<rect>` or `<path>` elements for clickable tile zones, with `data-*` attributes for hover labels. Districts are designed to compose into a single world SVG via `<use>` or grouped `<g>`.

**World map SVG:** 2400×800 viewBox, matching the panorama raster backdrop exactly.

**District SVG:** Coordinate system matches its cell grid (e.g., City 6×5 = 720×600 viewBox at 120px/cell).

**Generation prompt snippet:**
```
A simplified vector SVG map of [DISTRICT NAME] in Las Flores 2077. Top-down, flat colors, no gradients, no 3D effects. District outline is a single polygon path. Inside: grid of empty rectangles representing tiles, streets as 12px gaps between blocks. Soft cyberpunk soft color palette: faded teal, warm terracotta, muted gold, industrial steel. No details, no textures, no people, no objects. --no androids, no robots, no neon, no modern vehicles
```

### Tier B: Raster Terrain Textures

**Format:** PNG-8 or WebP, lossless compression.
**Base resolution:** 256×256 pixels.
**Display size:** 120×120 CSS pixels (desktop district grid).
**File size target:** < 150 KB each, < 50 KB with WebP.

**Seamless requirement:** All textures tile in all directions. Generated at 512×512 then cropped/scaled to 256×256 with edge-matching.

| Terrain Type | Purpose | Prompt Base | Count |
|---|---|---|---|
| `street` | City streets, faded asphalt | Top-down street, faded pastel asphalt, cracked surface, subtle mural fragments | 3 |
| `sidewalk` | Pedestrian paths | Top-down sidewalk, concrete slabs, pastel paint marks | 2 |
| `beach_sand` | Coastal zones | Top-down beach sand, fine golden grain, wind ripples, warm sunlight | 2 |
| `water_ocean` | Pacific coast | Top-down ocean, turquoise-green, gentle waves, white foam, no horizon | 2 |
| `water_river` | Río contamination | Top-down contaminated river, murky green-brown, chemical sheen | 2 |
| `grass_park` | Parks, green spaces | Top-down lush green grass, dewdrops, dappled sunlight, Parque de las Montañas | 2 |
| `cobblestone` | Old Town streets | Top-down weathered cobblestone, moss between stones, faded paint | 1 |
| `industrial_concrete` | Factories, Luz del Río | Top-down cracked concrete, oil stains, rust streaks, cold gray | 2 |
| `desert_sand` | Far South | Top-down desert sand, dry fine grain, wind patterns, warm tones | 1 |
| `port_asphalt` | Port District | Top-down weathered port asphalt, salt stains, rust | 1 |

**Prompt template:**
```
Seamless top-down tile texture of [DESCRIPTION], Las Flores 2077, soft cyberpunk. 
Photorealistic, 8K, tileable 256x256, no objects, no people, no external shadows, 
no horizon, no sky. 
--no androids, no robots, no neon, no modern objects, no buildings, no borders, 
no frame, no signature, no watermark
```

### Tier C: Landmark Overlays

**Format:** PNG-24 with alpha transparency.
**Base resolution:** 256×256 pixels.
**Display size:** 120×120 CSS pixels (scaled to fit tile cell or larger as accent).
**File size target:** < 200 KB each.

**Style:** Top-down architectural footprint or overhead illustration of the landmark. Centered composition. Transparent background. No external shadows.

| Landmark | District | Visual Description | Prompt Base |
|---|---|---|---|
| City Council Palace | City | Grand civic building, official crests, pastel stone | Top-down City Hall, grand, official crests, pastel stone roof |
| Governor's Offices | City | Stark modern, glass facade, cold silver | Top-down Governor's Offices, stark modern, glass facade |
| World Trade Center | City | Luxury skyscraper footprint, black glass | Top-down World Trade Center, black glass, luxury |
| Mercado Central | City | Colorful market stalls, awnings | Top-down Mercado Central, colorful stalls, awnings |
| Universidad Nacional | North | Campus courtyard, green spaces | Top-down Universidad Nacional, campus courtyard |
| Luz del Río Energy Plant | Los Andes | Industrial complex, turbines, pipelines | Top-down Luz del Río, turbines, industrial |
| Playa de los Vientos | Pacific | Beach entrance sign, surf statue | Top-down Playa de los Vientos, surf statue, beach sign |
| Puerto de las Flores | Port | Port pier, cranes, containers | Top-down Port of Las Flores, pier, cranes |
| Electra Battery Factory | Industrial | Factory floor, assembly lines | Top-down Electra Battery Factory, assembly |
| Parque de las Montañas | Los Andes | Pavilion, paths, pond | Top-down Parque pavilion, paths, pond |
| Teatro Nacional | Old Las Flores | Theater facade, marquee | Top-down Teatro Nacional, theater facade, marquee |
| Mall de las Estrellas | Northeast | Mall footprint, parking | Top-down Mall de las Estrellas, modern retail |
| Old Las Flores Church | Old Las Flores | Church courtyard, cemetery | Top-down Old Las Flores church, cemetery, courtyard |
| Van der Meer Northern Mine | North | Mining complex, open pit | Top-down Van der Meer Mine, open pit, industrial |
| Far South Outpost | Far South | Desert outpost, wind structures | Top-down Far South outpost, wind structures, desert |

**Prompt template:**
```
Top-down view of [LANDMARK NAME], [SHORT DESCRIPTION], Las Flores 2077, soft cyberpunk. 
Photorealistic, 8K, transparent background PNG, centered composition, no external shadows, 
no people, no objects outside the main subject.
--no androids, no robots, no neon, no modern vehicles, no people, no border, no frame
```

### Tier D: Panorama Backdrop

**Format:** JPEG or WebP.
**Resolution:** 2400×800 px (3:1 ratio).
**File size target:** < 500 KB.

**Prompt:**
```
An aerial panoramic illustration of Las Flores 2077 from a high angle, soft cyberpunk aesthetic. 
The city sprawls between the misty Andean foothills and the Pacific coast. The Río de las Flores 
winds through like a dark vein. Poor districts in warm faded pastels cluster in the foreground; 
luxury skyscrapers in stark black and silver pierce the skyline in the background. The Luz del Río 
energy plant glows on the mountain slope. Cableways stretch across like spider silk. Golden hour 
lighting, long shadows, atmospheric depth. Stylized but photorealistic, high detail, 8K.
--no androids, no robots, no neon, no clean environments, no utopian, no modern day, 
no cartoonish, no anime, no oversaturated colors
```

---

## 5. Color Palette (Terrain Types)

**Palette source:** `docs/lore/guides/ui_ux_design_system.md` — Primary (poor/middle) and Secondary (elite/industry) colors.

| Terrain Type | Primary Hex | Secondary Hex | Complementary | Day Filter | Night Filter |
|---|---|---|---|---|---|
| `street` | `#5C6A7A` (Industrial Steel) | `#3A3A3A` | `#B8956A` (Muted Gold for markings) | none | `brightness(0.75) hue-rotate(200deg) saturate(0.8)` |
| `sidewalk` | `#8A9B68` (Soft Sage) | `#6B7A52` | `#C17854` | none | `brightness(0.75) hue-rotate(200deg) saturate(0.8)` |
| `beach_sand` | `#D4834F` (Dawn Orange) | `#B8956A` | `#E6A857` | `saturate(1.1)` | `brightness(0.8) hue-rotate(215deg) saturate(0.7)` |
| `water_ocean` | `#4A7C8A` (Faded Teal) | `#2E5A65` | `#A8B2C4` | `brightness(1.1)` | `brightness(0.6) hue-rotate(215deg) saturate(0.5)` |
| `water_river` | `#6B8C42` (Toxic Green) | `#4A6B32` | `#9E3030` | none | `brightness(0.7) hue-rotate(215deg) saturate(0.6)` |
| `grass_park` | `#8A9B68` (Soft Sage) | `#6B8C42` | `#D4834F` | `saturate(1.2)` | `brightness(0.65) hue-rotate(215deg) saturate(0.6)` |
| `cobblestone` | `#B8956A` (Muted Gold) | `#8A7A60` | `#4A7C8A` | none | `brightness(0.7) hue-rotate(215deg) saturate(0.8)` |
| `industrial_concrete` | `#5C6A7A` (Industrial Steel) | `#3E4A56` | `#9E3030` (rust) | none | `brightness(0.75) hue-rotate(200deg) saturate(0.7)` |
| `desert_sand` | `#C17854` (Warm Terracotta) | `#9E6544` | `#E6A857` | `brightness(1.05)` | `brightness(0.8) hue-rotate(215deg) saturate(0.7)` |
| `port_asphalt` | `#5C6A7A` | `#3E4A56` | `#A8B2C4` | none | `brightness(0.75) hue-rotate(200deg) saturate(0.8)` |
| `building_civic` | `#1A1A1A` (Stark Black) | `#333333` | `#B8956A` | none | `brightness(0.8) hue-rotate(215deg) saturate(0.5)` |
| `building_residential` | `#B8956A` | `#8A7A60` | `#C17854` | none | `brightness(0.7) hue-rotate(215deg) saturate(0.8)` |

---

## 6. CSS Filter & Weather Specs

### Day/Night Cycle

```css
/* Default (day) */
.map-container .map-tile,
.map-container .landmark-overlay {
  filter: brightness(1) saturate(1);
}

/* Night mode (≤10 TB or manual toggle) */
.map-container.night .map-tile,
.map-container.night .landmark-overlay {
  filter: brightness(0.7) hue-rotate(215deg) saturate(0.6);
}

/* Dusk transition */
.map-container.dusk .map-tile {
  filter: brightness(0.85) hue-rotate(215deg) saturate(0.8);
}
```

### Day/Night World Overview

```css
.world-overview.night .world-panorama {
  filter: brightness(0.6) hue-rotate(215deg) saturate(0.5);
  transition: filter 1.5s ease;
}

.world-overview.day .world-panorama {
  filter: brightness(1) saturate(1);
  transition: filter 1.5s ease;
}
```

### Weather Effects (CSS Animations)

```css
/* Rain overlay — applied to map container */
.map-weather-rain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    170deg,
    transparent,
    transparent 8px,
    rgba(120,120,160,0.12) 8px,
    rgba(120,120,160,0.12) 10px
  );
  animation: rain-drift 0.4s linear infinite;
  z-index: 20;
}

@keyframes rain-drift {
  from { background-position: 0 0; }
  to { background-position: -20px 40px; }
}

/* Fog overlay */
.map-weather-fog {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: 
    radial-gradient(ellipse at 30% 50%, rgba(200,210,220,0.25) 0%, transparent 60%),
    radial-gradient(ellipse at 70% 30%, rgba(180,190,200,0.2) 0%, transparent 50%);
  animation: fog-drift 12s ease-in-out infinite alternate;
  z-index: 15;
}

@keyframes fog-drift {
  from { transform: translateX(-2%) scale(1); opacity: 0.7; }
  to { transform: translateX(2%) scale(1.1); opacity: 1; }
}

/* Tension/Grime vignette — mirrors applyTenseEffect in Phaser */
.map-container.tense::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: 
    inset 0 0 80px rgba(120,0,0,0.12),
    inset 0 0 40px rgba(80,0,0,0.08);
  z-index: 25;
}
```

### Current Location Indicator

```css
.map-tile.current-location::before {
  content: '';
  position: absolute;
  inset: -4px;
  border: 2px solid var(--color-streetlight-amber, #E6A857);
  border-radius: 4px;
  animation: pulse-amber 2s ease-in-out infinite;
  z-index: 10;
}

@keyframes pulse-amber {
  0%, 100% { box-shadow: 0 0 4px rgba(230,168,87,0.6); }
  50% { box-shadow: 0 0 12px rgba(230,168,87,0.9); }
}
```

---

## 7. Responsive Mockups

### Desktop World Overview (≥1024px)

```
┌──────────────────────────────────────────────────────────────────┐
│ LAS FLORES 2077                                    [DAY/NIGHT]   │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │                                                              │ │
│ │   [Panorama backdrop: 2400×800, full width]                 │ │
│ │                                                              │ │
│ │   ┌─────────────────┐  [City District 30 tiles]             │ │
│ │   │ (SVG zone)      │  hover: glow + tooltip                │ │
│ │   └─────────────────┘                                       │ │
│ │             ┌──────────┐                                    │ │
│ │             │ Pacific  │                                    │ │
│ │             └──────────┘                                    │ │
│ │  [North]  [Industrial]  [Port]  [Old Las Flores]            │ │
│ │                                                              │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ District count legend, filter toggles (corruption/safehouses)   │
└──────────────────────────────────────────────────────────────────┘
```

### Desktop District View (768–1023px)

```
┌──────────────────────────────────────────────────────────────────┐
│ ← BACK | CITY DISTRICT (30 tiles)                    [DAY/NIGHT] │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │  [street]  [building_residential]   ← District legend strip  │ │
│ │  [grass_park]  [street]  [water_river]                       │ │
│ │                                                              │ │
│ │  CSS Grid: 6 cols × 5 rows                                   │ │
│ │  Each tile: 120×120, background-image = terrain texture      │ │
│ │  Hover: tooltip (terrain type, location name, TB cost)      │ │
│ │  Current: amber pulse border                                 │ │
│ │  Landmarks: transparent PNG overlay on top of tile base     │ │
│ │                                                              │ │
│ │  ┌────────┐ ┌────────┐ ┌────────┐                          │ │
│ │  │ City   │ │ Old    │ │ Market │  ← overlays on tiles     │ │
│ │  │ Hall   │ │ Church │ │ Central│                            │ │
│ │  └────────┘ └────────┘ └────────┘                          │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Mobile World Overview (<768px)

```
┌──────────────────────┐
│ LAS FLORES 2077   ☰  │
│ A city of duality   │
│ ┌──────────────────┐ │
│ │ [Thumbnail]      │ │
│ │ City District    │ │
│ │ 30 locations     │ │
│ │ [ENTER →]        │ │
│ └──────────────────┘ │
│ ┌──────────────────┐ │
│ │ [Thumbnail]      │ │
│ │ Pacific Coast    │ │
│ │ 10 locations     │ │
│ │ [ENTER →]        │ │
│ └──────────────────┘ │
│ ... (vertical scroll, 11 cards) │
└──────────────────────┘
```

### Mobile District View (<768px)

```
┌──────────────────────┐
│ ← CITY DISTRICT      │
│ ┌──────────────────┐ │
│ │ 🏛️ City Hall     │ │
│ │ Council chambers  │ │
│ │ TB: 1  →         │ │
│ ├──────────────────┤ │
│ │ ⛪ Old Church     │ │
│ │ Historic site     │ │
│ │ TB: 2  →         │ │
│ ├──────────────────┤ │
│ │ 🛒 Mercado Central│ │
│ │ Vibrant market    │ │
│ │ TB: 1  →         │ │
│ └──────────────────┘ │
│ (flat cards, scroll) │
└──────────────────────┘
```

### Tablet Hybrid (768–1024px)

- World overview: minimap SVG + district name buttons below in a 3-column card grid.
- District view: 4–5 tile columns, falls back to cards below 640px.

---

## 8. Phaser Scene Enhancement Opportunities

**Important:** Sprites and animations are **only used inside `LocationScene.ts`**. The web map stays static.

### Existing Phaser Patterns (from `LocationScene.ts` + `mood-effects.ts`)

| Feature | File | How It Works |
|---------|------|-------------|
| Rain particles | `mood-effects.ts` | `scene.add.particles()` with canvas texture |
| Tense vignette | `mood-effects.ts` | `scene.add.graphics()` with rect + inset rects |
| Neon overlay | `mood-effects.ts` | `scene.add.graphics()` with blue fill |
| Background image | `LocationScene.ts` | `scene.add.image()`, scale to cover |
| NPC portraits | `npc-renderer.ts` | Rendered as Phaser containers with click interaction |
| Camera fade | `LocationScene.ts` | `scene.cameras.main.fadeOut/fadeIn()` |

### Enhancement Ideas (Spritesheets & Animations)

| Enhancement | Phaser API | Asset Needed | When Used |
|-------------|-----------|--------------|-----------|
| Walking NPCs | `this.add.sprite()`, `anims.play()` | `npc-walk.png` spritesheet | Any location with active NPCs |
| Flickering lights | `scene.tweens.add({alpha})` | No extra asset; tint existing image | Indoor scenes, industrial zones |
| Factory machinery | `this.add.tileSprite()`, animated offset | `machinery-conveyor.png` tile | Electra Battery Factory, Luz del Río |
| Ocean waves | `this.add.tileSprite()`, animated UV offset | `waves-tile.png` 128×64 tile | Pacific Coast beach locations |
| Park fireflies | `scene.add.particles()` | Particle texture canvas | Parque de las Montañas at night |
| Neon sign buzz | `scene.tweens.add({alpha})` + color tint | Existing background image + CSS-like tint | Mercado Central at night, elite district |
| Steam vents | `scene.add.particles()` | Particle texture canvas | Industrial Zone, Port District |

**Asset pipeline additions:**
- Shared spritesheet packs under `content/assets/phaser_spritesheets/` (not MinIO — bundled with client build or loaded from CDN).
- Each spritesheet has a `.json` metadata file (frame width/height, frame count).
- `LocationScene.bootstrapScene()` checks `payload.scene.animations` and preloads required spritesheets before `scene.add`.

**No changes to web map are needed.** The Phaser enhancements live entirely within `client/src/scenes/LocationScene.ts` (or its helpers), keeping the two layers cleanly separated.

---

## 9. Responsive Breakpoint Summary

| Breakpoint | Viewport | World Overview | District View | Implementation |
|------------|----------|----------------|---------------|----------------|
| **Mobile** | < 640px | Vertical card list (`.district-card`) | Flat location cards (`.location-card`) — same as `CityNav` | `flex-direction: column`, overflow-y scroll |
| **Phablet** | 640–767px | 2-column card grid | 2-column card grid, compact tiles fallback | CSS Grid `repeat(2, 1fr)` |
| **Tablet** | 768–1023px | Mini-map + 3-column button grid below | 4–5 tile columns, then cards | Hybrid: SVG minimap + CSS Grid |
| **Desktop** | ≥1024px | Panorama + SVG district zones | Full CSS Grid `repeat(auto-fit, minmax(120px, 1fr))` | SVG overlay + absolute positioning |

---

## 10. Day/Night Toggle Behavior

| Trigger | Behavior |
|---------|----------|
| **Automatic** | Updates when player TB drops below 10 (night) or above 30 (day). Smooth 1.5s CSS `filter` transition on map container. |
| **Manual override** | Button on map view toggles `day`/`night`/`auto` classes. Visible on both web map and Phaser overlay (synced via `eventBus`). |
| **Phaser sync** | `LocationScene` reads `eventBus` for `map:daynight_changed` and applies corresponding `moodEffects` if entering location from map. |

---

## 11. Implementation Notes for Subsequent Phases

This document is a **design decisions document only**. The following notes are for the implementation phase (not started yet).

### Content Pipeline Changes

| File | Change |
|------|--------|
| `shared/src/index.ts` | Add `'map_tile'` to `ContentTypeSchema` |
| `server/src/content/migrate.ts` | Add `/maps/` path detection in `getContentTypeFromPath()` |
| `server/src/content/validate.ts` | Add `MapTileSchema` / `MapTileFileSchema` validation |
| `server/src/content/upsert.ts` | Add `upsertMapTile()` function |
| DB migration `037_map_tiles.sql` | Create `map_tiles` table |

### Router

| Route | Component | Data Source |
|-------|-----------|-------------|
| `/map` | `MapView.ts` (world overview) | `GET /api/map` → district summaries + cache |
| `/map/:districtSlug` | `MapView.ts` (district grid) | `GET /api/map/:slug` → tile grid metadata + cache |
| `/city/loc/:id` | `LocationScene.ts` (existing) | unchanged |

### Cache Strategy

- `GET /api/map` and `GET /api/map/:slug`: `setCache(key, data, 300)` (5-min TTL), invalidated by `invalidatePattern('map:*')` on content migration.
- Tile texture URLs: served via MinIO signed URL or CDN cache (1-hour TTL)。

### Testing Strategy

- **Unit:** Render `MapView` with mock API data, verify tile grid HTML generation.
- **E2E:** `test/map-tiles.e2e.ts` — visits `/map`, clicks district, verifies tile grid renders, clicks tile, verifies navigation to location.
- **Visual:** Snapshot tests for day/night toggle, mobile responsive breakpoints.

---

## 12. Open Questions (Section 11) — Preliminary Recommendations

These remain undecided pending your review.

| # | Question | Preliminary Recommendation | Open For |
|---|----------|---------------------------|----------|
| 1 | Tile data authoring | **Hybrid**: procedural generation for terrain assignment (Perlin noise or simple weighted random), hand-authored YAML for landmark placements and district geography. | Procedural parameters + validation schema. |
| 2 | District granularity | **All locations get tiles**; landmarks get unique overlays, non-landmarks get dot-icons (desktop) / cards (mobile). | Dot-icon asset: CSS circle or small SVG marker? |
| 3 | Cache invalidation | Follow existing `invalidatePattern('map:*')` in migration post-tasks (`migrate.ts` line 319). | Webhook from content pipeline or explicit manual invalidation endpoint? |
| 4 | Testing strategy | Add `test/map-tiles.e2e.ts` using Playwright (same framework as existing E2E). | Exact test scenarios and mock data fixtures. |

---

## 13. Next Steps (After Approval)

1. **Write `docs/TILE_MAP_IMPLEMENTATION.md`** — detailed DB schema, API contracts, TypeScript types, client component tree.
2. **DB migration `037_map_tiles.sql`** — table + seed data structure.
3. **Content pipeline:**
   - Add `map_tile` to `ContentTypeSchema`.
   - Add `upsertMapTile()`, validation, migrate detection.
4. **Server API** (`server/src/routes/map.ts`):
   - `GET /map`, `GET /map/:slug` with cache.
5. **Client component** (`client/src/components/MapView.ts`):
   - Desktop: SVG + CSS grid + overlays.
   - Mobile: vertical cards.
6. **Router updates** (`client/src/main.ts`, `client/src/router.ts`).
7. **Asset generation:** Use Tier B/C/D prompts above in your external AI/artist tool.
8. **Content authoring:** Hand-author `content/maps/map_*.yaml`.

---

*This document is the source of truth for tile map design decisions. Code implementation begins only after Section 11 questions are closed and this document is approved.*