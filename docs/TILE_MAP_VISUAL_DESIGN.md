# Las Flores 2077: Tile Map Visual Design Brief

> **Purpose:** Design decision document for the tile-based city map system. This briefing gives your visual design chat full context about the game, constraints, and specific design questions to resolve.
> **Audience:** UI/UX designer, visual designer, AI art prompt engineer.
> **Status:** Awaiting design decisions before implementation.

---

## 1. Game Context

### What is Las Flores 2077?
A **server-driven visual novel** set in a near-future South American city. The player navigates dialogue trees, manages time blocks (TB), builds relationships, and solves competitive mysteries. The server is the source of truth; the client renders what the server dictates.

### Current Navigation
- **`/city`** → `CityNav.ts` — a flat DOM list of locations grouped by district (11 districts, 64+ locations)
- **`/city/loc/:id`** → `LocationScene.ts` (Phaser) — shows a single background image + mood effects + NPC portraits
- Movement costs 1 TB, server-validated

### What We're Adding
A **tile-based visual map** that replaces the flat `CityNav` list with a geographically meaningful representation of the city. The map shows districts as grids of terrain tiles, with unique landmarks as special overlay images.

**Key principle:** The tile map is a **navigation interface**, not an exploration surface. You click a tile or landmark to travel there. The phone overlay (dialogue, menus) remains the primary gameplay surface.

---

## 2. Technical Constraints

### Stack
- **Frontend:** TypeScript + Phaser 3 (for locations) + DOM/CSS (for UI)
- **Backend:** Node.js/Express + PostgreSQL + Redis cache + MinIO/S3 storage
- **Responsive:** Must work on mobile (portrait cards) and desktop (map + buttons)

### Pixel Budget
- Phaser canvas: 800×600 (scaled to fit viewport)
- DOM overlay: full viewport width
- Tile images: stored in MinIO, served via signed URL or CDN proxy
- **No 3D assets.** No WebGL beyond Phaser's existing 2D renderer.

### Art Direction (from existing GDD + prompt library)
- **Soft cyberpunk** — tech exists but no androids, no extreme violence, no neon
- **Duality:** warm pastel day / cold blue night, beauty/corruption, nature/industry, wealth/poverty
- **Style:** Photorealistic, environmental storytelling, high detail, 8K source → downscale for web
- **Negative prompts (ALWAYS include):** `--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no neon signs, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural`

### Asset Pipeline
Assets are **externally generated** (AI or artist) and stored in MinIO. The server sends URLs; the client loads them. The content pipeline (`content/maps/` YAML → DB) stores metadata. Images themselves are **not** in the content pipeline.

---

## 3. Proposed Architecture (Simplified)

### URL Structure
```
/map                           → World overview (all districts)
/map/:districtSlug             → District tile grid
/city/loc/:locationId          → Location detail
```

### Responsive Behavior
| Viewport | World Overview (`/map`) | District View (`/map/:slug`) |
|----------|------------------------|------------------------------|
| **Desktop (≥768px)** | Stylized map image (Las Flores skyline/terrain) with clickable district buttons positioned geographically | CSS grid of tile divs (each tile = background-image from DB), overlays on top for landmarks |
| **Mobile (<768px)** | Vertical cards — district name, description, tile count, minimap thumbnail | Vertical list of locations in that district (same as current `CityNav` but filtered) |

### Data Model (for the designer to understand)
Each tile in a district has:
- `terrain_type` — what it represents (sand, street, water, building, park, etc.)
- `base_image_url` — reusable tile image (10-20 images reused across the whole city)
- `overlay_image_url` — optional special asset for landmarks (unique per tile)
- `rotation` — 0/90/180/270 for variety
- `metadata` — optional: `label`, `landmark`, `location_id` (if clicking this tile should travel somewhere)

**The goal:** 10-20 base tile images + ~15-20 unique overlay images cover the entire city (11 districts).

---

## 4. Design Questions to Resolve

### Q1: Visual Style for Tiles
**What should the tiles look like?**

Options:
- **A) Top-down 2D** — bird's eye view, like classic strategy games. Tiles are flat textures with clear edges.
- **B) Isometric 2D** — 45° angle, slight perspective. More visual interest but harder to generate consistently.
- **C) Flat icon/graphic** — simplified, stylized shapes. Think "modern transit map" rather than realistic.

**Recommendation:** A) Top-down 2D. It's the easiest to generate consistently, works as DOM background-images, and matches your "atmospheric not exploratory" philosophy.

### Q2: Tile Resolution
**What pixel dimensions should the base tiles be?**

Considerations:
- Desktop district view: CSS grid, each tile displayed at ~100-150px
- Mobile: no tile rendering (cards instead)
- Source assets: 2x display size for retina → generate at 256×256 or 512×512
- File size: keep under 200KB per tile (use compression)

**Recommendation:** 256×256 base tiles, displayed at 120×120 on desktop. This keeps generation fast, storage low, and rendering crisp.

### Q3: How Are Places Represented?
**How does a tile connect to a game location?**

Options:
- **A) One tile = one location** — a landmark overlay on a terrain tile represents a specific place (e.g., "City Hall" overlay on a "civic" terrain tile). Clicking the overlay travels there.
- **B) District center marker** — a single tile in each district has a special "district center" overlay. Clicking it opens a list of locations in that district.
- **C) Overlay icons** — small icon overlays (like `CityNav`'s emoji) placed on terrain tiles to indicate locations.

**Recommendation:** A) One tile = one location. It's the most intuitive and matches your "reusable terrain + unique asset" idea exactly. A tile's `metadata.location_id` tells the client where to travel on click.

### Q4: Day/Night Variation
**How do tiles reflect the game's day/night duality?**

Options:
- **A) CSS filter toggle** — one asset, switching between `filter: brightness(1)` (day) and `filter: brightness(0.6) hue-rotate(20deg)` (night). Fast, zero extra assets.
- **B) Tint via Phaser/DOM** — multiply a semi-transparent color overlay (blue for night, yellow for day) on top of the tile image.
- **C) Separate asset sets** — generate both day and night versions. Highest quality but 2× asset count.

**Recommendation:** A) CSS filter toggle. You already have mood effects in `mood-effects.ts` (neon, rain, tense). Tiles can use the same approach. The day/night cycle is abstracted by the time-block system, so a toggle on the map view is sufficient.

### Q5: World Map Image (Desktop Overview)
**What does the `/map` world overview look like?**

Options:
- **A) Stylized SVG map** — vector districts with simplified shapes, colored by type. No raster assets needed.
- **B) Single painted panorama** — a wide AI-generated image of Las Flores from above, with district buttons positioned on top.
- **C) Grid of thumbnails** — each district is a small tile grid preview (like a minimap in a strategy game).

**Recommendation:** B) Single painted panorama. It's atmospheric, matches your art direction, and gives the design chat a clear prompt. The panorama would be a new asset (see prompts below).

### Q6: Mobile District View
**On mobile, when a user taps a district, what do they see?**

Options:
- **A) Flat location cards** — same as current `CityNav` but filtered to that district. No tiles.
- **B) Accordion list** — expandable sections for "landmarks" (tiles with overlays) vs "neighborhoods" (plain tiles).
- **C) Simplified tile strip** — horizontal scroll of small tile thumbnails with labels underneath.

**Recommendation:** A) Flat location cards. It reuses existing UI patterns, requires no new asset generation, and is the fastest to implement.

### Q7: Tilemap Grid Shape
**Are all districts rectangular grids?**

Options:
- **A) All rectangular** — simple, predictable, easy to generate.
- **B) Organic shapes** — districts have irregular boundaries, tiles near edges are "void" or "water". More realistic but harder.
- **C) Variable density** — some districts have more tiles (larger geographic area), others fewer. Matches your geography doc.

**Recommendation:** C) Variable density. Your `docs/lore/geography.md` already gives district areas (City: 30 km², Pacific Coast: 10 km², Far South: 5 km²). Map area to tile count: 30 km² → 30 tiles, 10 km² → 10 tiles, etc. Tiles don't have to be rectangular districts — the grid can be cropped.

### Q8: Tile Edge/Transition Handling
**How do different terrain types meet?**

Options:
- **A) Hard edges** — each tile is fully opaque, different terrains meet at clean borders. Like a mosaic.
- **B) Blended transitions** — tiles have feathered edges or gradient masks where they meet different terrain.
- **C) Decorative borders** — roads, fences, or hedgerows drawn on top of terrain tiles to mask transitions.

**Recommendation:** A) Hard edges. Simplest to generate and render. Your "street" tiles can act as natural separators between buildings, parks, and water. The reusability comes from the *base* tiles; the arrangement creates variety.

---

## 5. Asset Requirements

### A. World Map Panorama (1 image)
**For `/map` world overview on desktop.**

```
An aerial panoramic illustration of Las Flores 2077 from a high angle, 
soft cyberpunk aesthetic. The city sprawls between the misty Andean foothills 
and the Pacific coast. The Río de las Flores winds through like a dark vein. 
Poor districts in warm faded pastels cluster in the foreground; luxury 
skyscrapers in stark black and silver pierce the skyline in the background. 
The Luz del Río energy plant glows on the mountain slope. Cableways stretch 
across like spider silk. Golden hour lighting, long shadows, atmospheric 
depth. Stylized but photorealistic, high detail, 8K.
--no androids, no robots, no neon, no clean environments, no utopian, 
    no modern day, no cartoonish
```

**Spec:** 2400×800 px (3:1 ratio), PNG with transparency for district button placement zones.

### B. Base Terrain Tiles (10-20 images, each 256×256)
Tileable, seamless, top-down.

| Terrain Type | Prompt Snippet | Count |
|---|---|---|
| `street` | Top-down city street, faded pastel asphalt, cracked surface, subtle mural fragments, warm daylight, Las Flores 2077 | 3 |
| `sidewalk` | Top-down sidewalk, concrete slabs, pastel paint marks, street edge, warm light | 2 |
| `beach_sand` | Top-down beach sand, fine golden grain, wind ripples, warm sunlight, Playa de los Vientos | 2 |
| `water_ocean` | Top-down Pacific ocean, turquoise-green, gentle waves, white foam, no horizon | 2 |
| `water_river` | Top-down contaminated river, murky green-brown, chemical sheen, slow ripples | 2 |
| `grass_park` | Top-down lush green grass, Parque de las Montañas, dewdrops, dappled sunlight | 2 |
| `cobblestone` | Top-down weathered cobblestone, Old Town, moss between stones, faded paint | 1 |
| `industrial_concrete` | Top-down cracked concrete, oil stains, rust streaks, cold gray, Industrial Zone | 2 |
| `desert_sand` | Top-down desert sand, Far South, dry fine grain, wind patterns, warm tones | 1 |
| `port_asphalt` | Top-down weathered port asphalt, salt stains, rust, Port District | 1 |
| `building_civic` | Top-down civic building roof, grand, official crests, pastel stone, Downtown | 1 |
| `building_residential` | Top-down residential roof, faded paint, laundry lines, warm tones, poor district | 2 |

**Prompt template for each:**
```
Seamless top-down tile texture of [DESCRIPTION], Las Flores 2077, 
soft cyberpunk aesthetic. Photorealistic, 8K, tileable, no objects, 
no people, no external shadows, no horizon, no sky.
--no androids, no robots, no neon, no modern objects, no buildings
```

### C. Landmark Overlays (~15-20 images, each 256×256, transparent PNG)
Unique assets placed on top of base terrain tiles. Each corresponds to a notable location in your lore.

**Prompt template for each:**
```
Top-down view of [LANDMARK NAME], Las Flores 2077, [VISUAL DESCRIPTION]. 
Photorealistic, 8K, transparent background, centered composition, 
no external shadows.
--no androids, no robots, no neon, no modern vehicles, no people
```

**Priority landmarks (from your lore + content):**
1. City Council Palace (`location_city_council_palace.yaml`)
2. Governor's Offices (`location_the_governor_offices.yaml`)
3. World Trade Center (`location_world_trade_center_las_flores.yaml`)
4. Mercado Central (`location_mercado_central.yaml`)
5. Universidad Nacional (`location_universidad_nacional_de_las_flores.yaml`)
6. Luz del Río Energy Plant (`location_luz_del_rio_energy_plant.yaml`)
7. Playa de los Vientos entrance (`location_playa_de_los_vientos.yaml`)
8. Pacific Coast pier (`location_puerto_de_las_flores.yaml`)
9. Industrial Zone factory (`location_electra_battery_factory.yaml`)
10. Parque de las Montañas pavilion (`location_parque_de_las_montanas.yaml`)
11. Teatrio Nacional (`location_teatro_nacional.yaml`)
12. Mall de las Estrellas (`location_mall_de_las_estrellas.yaml`)
13. City Cemetery / Old Las Flores church (`location_old_las_flores.yaml`)
14. Van der Meer Northern Mine (`location_van_der_meer_group_northern_mine.yaml`)
15. Far South desert outpost (`location_far_south.yaml`)

### D. Day/Night Tint Variants (0 extra assets)
Use CSS filters on the tile container:
- **Day:** `filter: brightness(1) saturate(1)`
- **Night:** `filter: brightness(0.7) hue-rotate(215deg) saturate(0.6)`

The game's time-block system abstracts time; a manual toggle or automatic based on TB thresholds (≥30 TB remaining = day, ≤10 TB = night) suffices.

---

## 6. Responsive Behavior Spec

### Desktop (≥768px)
- **World overview (`/map`):** Full-width background image (panorama). District buttons are absolutely positioned `<div>` elements with `cursor: pointer`. Each button shows district name + tile count on hover.
- **District view (`/map/:slug`):** CSS Grid (`grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))`). Each tile is a `<div>` with `background-image`, `background-size: cover`, and an absolutely positioned `<img>` for the overlay (if present). Clicking a tile with `data-location-id` navigates to `/city/loc/:id`. Hover shows tooltip with `metadata.label`.

### Mobile (<768px)
- **World overview (`/map`):** Vertical flex of district cards. Each card has district name, description, small thumbnail (first base tile or overlay), and "Enter" button.
- **District view (`/map/:slug`):** Vertical list of location cards. Each card shows location name, description, and icon (reuse `CityNav.getLocationIcon()` emoji logic). Tapping a card → `/city/loc/:id`.

### Tablet (768-1024px)
- Hybrid: world overview shows mini-map with district buttons below it. District view collapses to 4-5 tile columns, then falls back to cards below.

---

## 7. Navigation & Travel Integration

### Click/Tap Flow
1. User sees tile or location card
2. Click/tap → if tile has `metadata.location_id` → `navigateTo('/city/loc/' + locationId)`
3. `LocationScene` loads via Phaser (existing flow, unchanged)
4. Player reads dialogue, interacts, spends TB
5. Back button → returns to `/map/:districtSlug` (district they came from)

### TB Cost Display
Tiles/location cards show TB cost to travel. Cost is same as existing travel system (distance-based, computed server-side in `player-helpers.ts:90-104`). Fetch cost from `/player/state` or cache it in the location card metadata.

### Current Location Indicator
The tile/card for the player's current location is visually distinct — e.g., a glowing border or pulse animation in CSS.

### URL Sync
- Entering a district navigates to `/map/:districtSlug`
- Traveling to a location navigates to `/city/loc/:locationId`
- Back button returns to `/map/:districtSlug`
- Direct URL access to `/map/:districtSlug` works (district view loads immediately)

---

## 8. What the Design Chat Needs to Decide

**Please share this section verbatim with your design chat.**

### 8.1 Visual Style
1. Top-down vs isometric vs flat icon for tiles? (Recommendation: top-down)
2. Color palette for terrain types — should it follow the game's warm pastel / cold blue duality?
3. Tile edge style: clean geometric borders or organic feathered edges?

### 8.2 Asset Spec
4. Tile resolution: 256×256 or 512×512? (Recommendation: 256×256)
5. Should base tiles have subtle day/night variants, or rely on CSS filters? (Recommendation: CSS filters)
6. How many `street` variants are needed? (Recommendation: 3)
7. Do you need transition tiles (e.g., sand-to-water, grass-to-road)? (Recommendation: no, use decorative overlays)

### 8.3 World Map
8. Should the world overview panorama include district name labels, or are those added as DOM overlays? (Recommendation: DOM overlays)
9. Should the panorama be a painted illustration or a satellite-like photo? (Recommendation: painted illustration, soft cyberpunk)

### 8.4 Place Representation
10. Should landmarks use a consistent overlay style (e.g., all top-down building footprints) or varied per landmark? (Recommendation: varied per landmark for visual interest)
11. Should non-landmark locations (e.g., "El Palmar" near the beach) appear as small dots/icons on tiles, or only as cards in the list? (Recommendation: small dot icons on tiles desktop, cards on mobile)

### 8.5 Responsive Behavior
12. Should the mobile district view show a simplified tile strip (horizontal scroll of small thumbnails) or just cards? (Recommendation: cards)
13. Should the world overview on mobile be an interactive minimap or a carousel of district cards? (Recommendation: carousel of cards)

### 8.6 Day/Night
14. Should the map have a manual toggle or follow the player's TB count? (Recommendation: follow TB count with manual override)
15. Night tiles: subtle blue tint or dramatic desaturation? (Recommendation: subtle blue tint, `hue-rotate(215deg) brightness(0.7)`)

---

## 9. Ready-to-Paste Prompt for Your Design Chat

Copy and paste the text below into your design/visual chat.

---

**START OF PROMPT**

> You are the visual designer for **Las Flores 2077**, a narrative-driven visual novel set in a near-future South American city. The game uses a server-driven architecture (Node.js/Express + Phaser.js client). The primary UI is a phone overlay. I need you to design a **tile-based city map** that serves as a navigation interface.
>
> ## Context
>
> The city has 11 districts, 64+ locations. Current navigation is a flat list. The new tile map will replace that list with a geographically meaningful visual representation. Tiles are **top-down 2D textures** (no 3D, no perspective). Most tiles are reusable terrain (sand, street, water). ~15-20 locations get unique "overlay" images (landmarks like City Hall, beach entrance sign, energy plant).
>
> ## Art Direction
>
> - **Style:** Soft cyberpunk — photorealistic, atmospheric, environmental storytelling
> - **Duality:** warm pastel day / cold blue night, beauty/corruption, nature/industry, wealth/poverty
> - **NO:** androids, robots, neon, extreme violence, blood, gore, modern day (2020s), utopian, pristine environments, cartoonish, anime
> - **ALWAYS include:** `--no androids, no robots, no neon, no extreme violence, no blood, no gore, no modern day, no utopian, no pristine environments, no cartoonish, no anime`
>
> ## Responsive Behavior
>
> - **Desktop (≥768px):** World overview = stylized panoramic map image with clickable district buttons. District view = CSS grid of tile divs (120×120px each), with optional overlay images on top.
> - **Mobile (<768px):** World overview = vertical cards for each district. District view = vertical list of location cards with icons.
>
> ## Design Questions
>
> Please answer these:
> 1. Tiles: top-down, isometric, or flat icon? (Recommendation: top-down)
> 2. Tile resolution: 256×256 or 512×512? (Recommendation: 256×256)
> 3. How are places represented: one tile = one location, district center marker, or overlay icons?
> 4. Day/night: CSS filters or separate asset sets? (Recommendation: CSS filters)
> 5. World overview: SVG map, painted panorama, or grid of thumbnails? (Recommendation: painted panorama)
> 6. Mobile district view: flat cards, accordion, or tile strip? (Recommendation: flat cards)
> 7. Tile grid: all rectangular districts, organic shapes, or variable density based on real area? (Recommendation: variable density)
> 8. Tile edges: hard geometric borders or feathered transitions? (Recommendation: hard edges)
>
> ## Deliverables
>
> 1. **Visual style guide** for the tile map (colors, shapes, hover states, active states, transitions)
> 2. **Asset list** with exact prompts for:
>    - World map panorama (2400×800 px)
>    - 10-20 base terrain tiles (256×256, top-down, seamless, tileable)
>    - ~15-20 landmark overlays (256×256, transparent PNG, centered)
> 3. **Prompt templates** for each asset type, including negatives
> 4. **Color palette** for terrain types (street, sand, water, grass, concrete, etc.)
> 5. **Day/night filter specs** (CSS `filter:` values)
> 6. **Responsive mockups** (ASCII or description) for desktop world overview, desktop district view, mobile world overview, mobile district view
>
> ## Constraints
>
> - Assets stored as images in MinIO/S3, served via URL
> - No 3D, no canvas/WebGL for tiles (DOM/CSS only)
> - Tile grid is CSS Grid on desktop, vertical flex on mobile
> - Assets are generated externally (AI or artist), not in the content pipeline
> - The content pipeline stores metadata only (terrain type, URLs, location_id)
>
> ## Reference Material
>
> - Game design: `docs/game_design.md`
> - Asset prompt library: `docs/lore/guides/prompt_library.md`
> - Location list: `content/locations/` (64 locations, see `location_playa_de_los_vientos.yaml` as example)
> - City geography: `docs/lore/geography.md`

**END OF PROMPT**

---

## 10. Next Steps After Design Decisions

Once your design chat returns with decisions, we'll implement in this order:

1. **`docs/TILE_MAP_IMPLEMENTATION.md`** — detailed spec with exact DB schema, API contracts, TypeScript types, and client component structure
2. **DB migration (`037_map_tiles.sql`)** — create `map_tiles` table + update `migration_log` CHECK
3. **Content pipeline:**
   - Add `'map_tile'` to `ContentTypeSchema`
   - Add `content/maps/` path detection in `migrate.ts`
   - Add `upsertMapTile()` in `upsert.ts`
   - Add validation in `validate.ts`
4. **Server API (`server/src/routes/map.ts`):**
   - `GET /map` — district summaries for world overview
   - `GET /map/:districtSlug` — tile grid for district view
   - Both use `getCache`/`setCache` (5-min TTL) + `queryOLTP`
5. **Client component (`client/src/components/MapView.ts`):**
   - Desktop: background image + CSS grid tiles + overlays
   - Mobile: vertical cards
   - Hover/click states, current location indicator, TB cost display
6. **Router updates (`client/src/main.ts` + `client/src/router.ts`):**
   - Add `/map` and `/map/:slug` routes
   - Backward-compatible with `/city`
7. **Asset generation:** Use prompts from `docs/TILE_MAP_VISUAL_DESIGN.md` to generate tiles in your external tool
8. **Content authoring:** Create `content/maps/map_*.yaml` for each district using generated assets

---

## 11. Open Questions (For You, Not the Design Chat)

1. **Tile data authoring:** Do you want to hand-author the YAML grids, or generate them programmatically (e.g., Perlin noise for terrain assignment)? Hand-authoring gives narrative control; procedural is faster but less meaningful.

2. **District granularity:** Should every location in a district be its own clickable tile, or only the "important" ones? (Recommendation: all locations get tiles, but only landmarks get overlays.)

3. **Caching invalidation:** If someone edits `content/maps/map_downtown.yaml`, how do we invalidate the `/map/downtown` cache? Follow the existing `location/:id/invalidate` pattern, or add a webhook from the content pipeline?

4. **Testing strategy:** Should we create a `test/map-tiles.e2e.ts` that verifies tile grid rendering, or rely on the existing E2E framework?

---

*This document is the source of truth for the tile map visual design. Code implementation should not begin until Section 8 questions are resolved and Section 11 decisions are confirmed.*