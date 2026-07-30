# Content / Lore / DB Correlation Audit
> **Status:** Audit complete
> **Date:** 2026-07-29
> **Scope:** Full entity-level mapping from content/ YAML → docs/lore/ → DB tables, with drifts and a phased remediation plan.
> **Supersedes:** Stale claims in docs/plans/admin-content-edit-views/00-shared-infrastructure.md, 01-characters-view-and-edit.md, 02-locations-view-and-edit.md (now marked Implemented).

---

## 1. Purpose

This audit answers two questions raised in 02-locations-view-and-edit.md:

1. How do lore, content YAML, server mediation, and DB tables correlate *across all entities*, not just locations?
2. What is the actual current state of the client map → characters in a location feature?

---

## 2. Content-Layering Contract (Restated)

Per AGENTS.md and content/README.md:

- content/ — dev-mode **file database** (data only: YAML + Markdown + image assets).
- server/ — **sole mediator** between content/ and the DB. The only sanctioned write path is server/src/content/upsert.ts, invoked by server/src/content/migrate.ts.
- docs/lore/ — world-level research/writing docs never migrated to the database.
- scripts/ — file-to-file tools; never touch the DB.
- client/ — renders live game state; reads from public server endpoints under /api/....
- admin/src/ — reads DB rows via /admin/... endpoints and YAML via /admin/content/file; edits flow back through PUT /admin/content/file → POST /admin/content/migrate.

Direct DB edits outside the migration path are considered drift and are out of scope for the admin views.

---

## 3. Correlation Matrix

| Content type | YAML source path | YAML schema | DB table | PK | Admin list/detail | Public game endpoint |
|---|---|---|---|---|---|---|
| character | content/characters/<slug>/char_<slug>.yaml | YAMLCharacterSchema | characters | uuid | GET /admin/characters(:id) | embedded in location/scene payloads |
| dialogue | content/dialogues/*.yaml (flat) | YAMLDialogueSchema | dialogue_trees | uuid | GET /admin/dialogues(:id) | /api/dialogue/* |
| overlay | content/overlays/<slug>/*.yaml | YAMLOverlaySchema | dialogue_overlays | uuid | GET /admin/overlays(:id) | resolver via overlay router |
| scene | content/scenes/<slug>/scene_<slug>.yaml | YAMLSceneSchema | scenes | uuid | GET /admin/scenes(:id) | /api/location/:id (scene rows returned) |
| location | content/districts/<district>/locations/<slug>/location_<slug>.yaml | YAMLLocationSchema | scenes | uuid | GET /admin/locations(:id) (filtered metadata->>type=location) | /api/location/:id and /api/location (same row, unfiltered) |
| gig | content/gigs/*.yaml | YAMLGigSchema | gigs | uuid | GET /admin/gigs(:id) | internal player gigs |
| mission | content/missions/ or content/mysteries/ | YAMLMissionSchema | mysteries | uuid | GET /admin/mysteries(:id) | /api/mystery/* |
| vault | content/vault/*.yaml | file schema | vault_items | uuid | GET /admin/vault(:id) | /api/vault |
| shop_item | content/shop/*.yaml | file schema | shop_items | uuid | GET /admin/shop(:id) | /api/shop/catalog |
| story | content/stories/*.yaml | YAMLStorySchema | stories | uuid | GET /admin/stories(:id) | story-builder canvas |
| story_beat | content/story_beats.yaml (single file) | registry schema | story_beats | slug (not uuid) | handled by /admin/story-beats (not in admin-list-views.ts) | dialogue/scene beat cross-ref registry |
| map_tile | content/maps/ (does not exist) | MapTileFileSchema | map_tiles | uuid | GET /admin/maps(:id) | /api/map, /api/map/:slug (districts + tiles) |
| district | none (SQL-seeded only) | — | districts | uuid | no admin list/detail yet | /api/map (overview) |
| lore | content/lore/**/*.md, docs/lore/**/*.md | Markdown | none | — | admin-lore router | not migrated |

### Key structural facts

- CONTENT_TYPE_TABLE in server/src/content/migrate.ts:17-30 is the authoritative mapping of content-type → DB table. Note location: scenes, mission: mysteries, vault: vault_items, story: stories.
- migration_log.content_type CHECK constraints (migrations 001, 044, 046, 047, 051, 057) enumerate the valid types. Story/beat/mission renames are handled incrementally.
- story_beat is the sole exception to the uuid-PK assumption. The Plan 00 by-id resolver searches by id; story_beat uses slug. This is handled today through a separate path (server/src/content/upsert.ts:173-206, processStoryBeatData) and a separate admin route. Any future edit-views-for-all-entities plan must special-case it.
- Admin endpoints are uniform: admin-list-views.ts provides GET /<type> + GET /<type>/:id for every entity that is listed there. story_beat, district, and lore are excluded or handled elsewhere.
---

## 4. Per-Entity Verdicts

### Solid — YAML ↔ DB table ↔ admin view fully wired

- character: Mapped via `processCharacterData → upsertCharacter`. DB table is one row per YAML. Admin detail renders `EntityDetailView` with `CHARACTER_VIEW_FIELDS`. ✅
- dialogue: Mapped via `processDialogueData → upsertDialogueTree`. `nodes` JSONB is large but functional. `modifications`/`nodes` cascade on overlays. Admin list registered at `admin-list-views.ts`. ✅
- overlay: Mapped via `processOverlayData → upsertDialogueOverlay`. Admin detail returns full `modifications` + `nodes`. Admin list registered. ✅
- scene: Mapped via `processSceneData → upsertScene`. Extra step links `metadata.npcs` to `scene_characters`. Admin list/detail exist. ✅
- gig: Mapped via `processGigData → upsertGig`. Single YAML or `gigs: []` array; first id returned as migration key. Admin list registered. ✅
- mission (DB table `mysteries`): Mapped via `processMissionData → upsertMystery`. `migration_log` CHECK updated to accept `mission`. ✅
- vault: Dir `content/vault/` is a single file containing `vault_items: []`. Parsed as `VaultFileSchema` and iterated in `processVaultData`. Admin list registered. ✅
- shop_item: Single-file array, parsed with `ShopItemFileSchema`. Upserted individually. Admin list registered. ✅
- story: Two-shape file — either `{ stories: [] }` or `{ beats: [] }`. `processStoryData` dispatches. `stories` table has wide JSONB arrays pointing at other entity IDs. ✅

### Partial / Drift

- location (DB table `scenes`):
  - **Upsert path is wired.** `processLocationData` (`upsert.ts:118-137`) spreads the entire YAML including location-only keys into `metadata`, then calls `upsertScene`. Admin list/detail exist, flattening `metadata` for display via `LOCATION_VIEW_FIELDS`.
  - **Drifts still open:**
    - D1: Public `GET /api/location` (`server/src/routes/location.ts:257-264`) returns **all scenes** — no `metadata->>type = 'location'` filter. Admin `/admin/locations` filters correctly; public API does not.
    - D2: `available_dialogues` is hardcoded to `[]`; no NPCs are linked to `scene_characters`. Public endpoint returns `npcs: []` for every location.
    - D3: District naming mismatch between seeded DB (`Downtown`, `Old Town`, `Commercial`, `Industrial`, `South`, `City`, `Unknown`) and authored `content/districts/` folders (`southeast`, `rio_de_las_flores`, `pacific`, `industrial`, `port`, `far_south`, `central`, `northeast`, `south`, `city`, `north`, `los_andes`, `forest_and_swamps`). Only 3 of 14 overlap.
    - D6: `YAMLLocationSchema` does not include fields used by real YAMLs (`overview`, `life_and_work`, `airport_employment`, `adjacent_industries`, `community_dynamics`). Some YAMLs deviate from the schema. `description` is overloaded (YAML long text vs. DB `scenes.description` short text).
- story_beat: Usable, but stored as **slug PK** — breaks any code that assumes the Plan 00 resolver `id` is a UUID. `GET /admin/content/by-id?type=story_beat&id=<slug>` returns 404 because `admin-content-resolver.ts` does not special-case slug lookups.
- map_tile: Table + upsert + admin list/detail exist, but `content/maps/` is ** absent**. `map_tiles` table is empty by default. Client `MapView` renders an empty tile grid.
- district: Not a content type. Districts are created by `upsertScene` (auto-insert if missing) or by the migration seed files. No admin CRUD exists.

### Not Migrated (by design)

- lore: Markdown research under content/lore/ and docs/lore/ is never loaded into Postgres. It is served by server/src/routes/admin-lore.ts. YAMLCharacterSchema / YAMLLocationSchema fields like lore_ref and lore_path reference these files by relative path.
---

## 5. Drift Register

### D1 — public /api/location returns all scenes (scene/location conflation)

**What:** Location rows live in the `scenes` table with `metadata->>'type' = 'location'`, but the public `GET /location` endpoint (`server/src/routes/location.ts:248-296`) returns **all scenes** (no filter). Admin `GET /admin/locations` correctly filters to `metadata->>type = 'location'`.

**Evidence:** `server/src/routes/location.ts:257-264` JOINs `districts` but has no `metadata->>type='location'` predicate.

**Impact:** Public `/api/location` returns a scene+location mix. Admin `/admin/locations` returns only locations. The same `scenes` table serves both roles, making it easy to accidentally overwrite location fields when a scene YAML migrates.

**Recommended fix:** Add `AND metadata->>type = 'location'` to the public `/api/location` list query. Do not introduce a separate `locations` table.

### D2 — locations do not link characters/dialogues

**What:** `processSceneData` reads `metadata.npcs` and inserts into `scene_characters`, but `processLocationData` (`upsert.ts:121-133`) hardcodes `available_dialogues: []` and never touches `scene_characters`.

**Evidence:** `server/src/content/upsert.ts:121-133`.

**Impact:** Public `GET /api/location/:id` returns `{ scene, npcs: [] }` for every location YAML. The characters-in-a-location renderer in `client/src/scenes/LocationScene.ts` is wired, but there is nothing to render.

**Recommended fix:** Extend `YAMLLocationSchema` with optional `npcs: uuid[]` and `available_dialogues: uuid[]`, then mirror the `processSceneData` linking in `processLocationData` after `upsertScene`.

### D3 — districts naming mismatch

**What:** DB seeds define districts named `Downtown`, `Old Town`, `Commercial`, `Industrial`, `South`, `City`, `Unknown`. Content lives under `content/districts/` folders: `southeast`, `rio_de_las_flores`, `pacific`, `industrial`, `port`, `far_south`, `central`, `northeast`, `south`, `city`, `north`, `los_andes`, `forest_and_swamps`. Only 3 of 14 overlap.

**Evidence:** `server/src/database/migrations/034_seed_districts.sql:13-59`. `find content/districts -mindepth 2 -maxdepth 2 -type d` shows 13 non-matching slugs.

**Impact:** Most location YAMLs omit `district` or use `Unknown` because the real district names do not map cleanly. `upsertScene` auto-creates districts rows for any string it sees (`upsert.ts:72-75`), so the DB accumulates mismatched district names. The tile map (`client MapView`) shows the DB's 6 seeded districts, not the 14 authored ones.

**Recommended fix:** Normalize to whichever side needs fewer moves — option (a) rename `content/districts/*` folders to match seeded slugs, or (b) replace seeded rows to match authored slugs and add a `content/districts` mapping doc. Either way, run `./scripts/apply-migrations.sh both` after because `scenes.district_id` FK will need backfill.

### D4 — map_tile content type has no content

**What:** `getContentTypeFromPath` matches `/maps/` → `map_tile` (migration 037, `path-utils.ts:63`), but `content/maps/` does not exist.

**Evidence:** `ls content/maps` → no maps folder. `find content/districts -name *.yaml` shows locations but no map YAMLs.

**Impact:** `map_tiles` table is empty in a fresh or migrated state → client `MapView` renders an empty tile grid.

**Recommended fix:** Either (a) author at least one tile-file per district in `content/maps/district_<slug>.yaml` conforming to `MapTileFileSchema` in `shared/src/schemas/map.ts:21-33`, or (b) deprecate the `map_tiles` layer and derive district tiles from `scenes`/`locations` spatial metadata (lighter, fewer moving parts). Do not keep the data path half-populated.

### D5 — two unconnected map models

**What:** There are two parallel map concepts that do not reference each other.

- **Model A:** `map_tiles` table + `/api/map` + `content/maps/*.yaml`. Each row = one tile at `(district_id, x, y)` with `terrain_type`, image URLs, rotation, `is_flipped`, and `metadata` (which can hold `location_id`). Used by `client/src/components/MapView.tsx` (React).
- **Model B:** `YAMLLocationSchema.map` in `shared/src/schemas/yaml-content.ts:175-185` (per-location grid, `base_tile`, `walkable_mask`, `spawn`, `waypoints`). Used by admin field definitions (`LOCATION_VIEW_FIELDS` / `LOCATION_EDIT_FIELDS`).

**Evidence:** 1 of 77 location YAMLs has a `map:` field. `MapView.tsx:262-266` reads `tile.metadata.location_id`, not `YAMLLocationSchema.map`.

**Impact:** Authors editing a location `map.grid` are editing a field that the client never reads. No code consumes `YAMLLocationSchema.map` in the game client.

**Recommended fix:** Choose one ground truth. Option (a): keep both but define `map_tiles.metadata.location_id` as the bridge, and drop the per-location `map` from `YAMLLocationSchema`. Option (b): drop `map_tiles` and consume `YAMLLocationSchema.map` directly in a new client map renderer. Whichever side is chosen, mark the other schema field `readOnly` in admin until it is removed.


### D6 — YAMLLocationSchema drifts from real location YAML

**What:** The schema specifies `description`, `history`, `daytime`, `nightlife`, `conclusion`, `important_places`, `map`. Most location files define `daytime`, `nightlife`, `history`, `conclusion`, and `important_places`, but several files use keys not present in the schema.

**Evidence (77 location files):**
- `daytime:` — 58 of 77 files (75%)
- `nightlife:` — 58 of 77 files (75%)
- `history:` — 59 of 77 files (77%)
- `conclusion:` — 64 of 77 files (83%)
- `important_places:` — 58 of 77 files (75%)
- `map:` — 1 of 77 files (1%)
- `description:` — 13 of 77 files (17%)

Real content files that deviate from the schema:
- `overview:` — 5 of 77 files
- `life_and_work:` — 1 file
- `airport_employment:` — 1 file
- `adjacent_industries:` — 1 file
- `community_dynamics:` — 1 file

**Impact:** The `YAMLLocationSchema` does not include fields used by authored YAMLs (`overview`, `life_and_work`, `airport_employment`, `adjacent_industries`, `community_dynamics`). The admin location editor (`LOCATION_EDIT_FIELDS`) exposes `map` (used by 1 file) and hides fields that exist in authored YAML but are missing from the schema. Migrated DB rows end up with empty/undefined column values because the YAML never supplied them.

**Recommended fix:** Either (a) migrate the authored YAMLs to `description`/`history`/`daytime`/`nightlife` and unify `overview` → `history` semantics, or (b) extend `YAMLLocationSchema` to include `overview`/`life_and_work`/`airport_employment`/`adjacent_industries`/`community_dynamics`. Renaming authored content has higher blast radius; extending the schema is lower risk.

### D7 — story_beat slug PK breaks Plan 00 by-id resolver

**What:** `GET /admin/content/by-id?type=<type>&id=<uuid>` assumes the entity has a UUID `id` column. `story_beats` has `slug` as primary key and an optional `id` field.

**Evidence:** `server/src/content/path-utils.ts:15-24` special-cases slug-as-ID. The Plan 00 resolver (`admin-content-resolver.ts`) does not.

**Impact:** Following Phase 4 (extend edit views to all entities) without a special case, `GET /admin/content/by-id?type=story_beat&id=<slug>` returns 404 or wrong entity.

**Recommended fix:** Add a slug-first lookup branch in the resolver for `story_beat`, or keep `story_beat` on its own dedicated admin route. Do not rename the table PK to uuid.

### D8 — Stale documentation

**What:** Several docs describe code states that no longer match reality.

- 02-locations-view-and-edit.md:10 says GET /admin/locations/:id does not exist — it is already registered at admin-list-views.ts:271-274.
- 02-locations-view-and-edit.md:55 says the detail view will flatten metadata for display. admin/src/app/(admin)/locations/[id]/page.tsx:81-90 already does this.
- 02-locations-view-and-edit.md:83-106 says admin-list-views.ts, locations/[id]/page.tsx, field-definitions.ts, [id]/edit/page.tsx are all new. All four are already in the codebase.
- 01-characters-view-and-edit.md:83-87 says files are all new. characters/[id]/page.tsx, [id]/edit/page.tsx, field-definitions.ts already exist and use EntityDetailView/EntityEditForm.
- 00-shared-infrastructure.md:112-124 says shared components + hooks + field-definition files are new. All already shipped: EntityDetailView.tsx, EntityEditForm.tsx, useEntityYaml.ts, useEntityYamlSave.ts, admin-content-resolver.ts.
- content/README.md:13-23 lists content/locations/<slug>/ and content/maps/ as top-level folders — they do not. Locations are under content/districts/<district>/locations/<slug>/; content/maps/ is absent. The README directory tree is corrected in accordance with this audit.
---

## 6. Client Map → Characters in a Location: Current State vs. Gaps

### What is already wired

| Piece | File | What it does |
|---|---|---|
| World map overview | client/src/components/MapView.tsx:45-77 | Renders district cards; click navigates to /map/<slug> |
| District tile grid | client/src/components/MapView.tsx:104-214 | Renders tiles with CSS Grid + terrain colors |
| Tile click → location | client/src/components/MapView.tsx:262-266 | If tile.metadata.location_id, navigates to /city/loc/<id> |
| Public map data | server/src/routes/map.ts:17-66 | /api/map — districts + tile counts, cached 5 min |
| District tile data | server/src/routes/map.ts:68-150 | /api/map/:slug — tile grid incl. metadata, cached 5 min |
| Location payload | server/src/routes/location.ts:26-106 | assembleScenePayload returns { scene, npcs } from scene_characters ⋈ characters + overlay NPCs + relationships |
| Client scene renderer | client/src/scenes/LocationScene.ts | Background image, mood effects, ambient audio, NPC sprites via renderNPCs |
| Client routing | client/src/router/routes.ts:146-196 | /map, /map/<slug>, /city/loc/<id> |

### Gaps that make it empty in practice

1. **map_tiles is empty.** `content/maps/` does not exist (D4). Until tiles exist with coordinates, `MapView.tsx` has nothing to render in DistrictView.
2. **No `map_tiles.metadata.location_id` bridge exists.** Because (1), there is no link between a tile at `(x, y)` and a location UUID.
3. **Locations do not link characters.** Even if you `GET /api/location/<id>` directly, `npcs: []` is guaranteed because `processLocationData` never inserts to `scene_characters` (D2). The join itself works (`scene_characters ⋈ characters` is healthy SQL); it is the content that is missing.
4. **District slugs in the `districts` table do not match `content/districts/<slug>/` paths** (D3). A player traveling from `/map/<slug>` receives the DB slug, but the authored content lives alongside mismatched folder names. The two would need an explicit mapping layer before tile-location linking is meaningful.
5. **Public `/api/location` returns all scenes** (D1). The endpoint does not filter to `metadata->>type = 'location'`, so the data mix can confuse client-side location rendering.

### Minimum viable closure

To make the map actually show clickable locations with NPCs, the smallest closure is:

- (a) Populate `map_tiles` for at least one district, with `metadata.location_id` pointing at the corresponding location row (D4/D5).
- (b) Extend `YAMLLocationSchema` + `processLocationData` to link characters via `scene_characters` (D2 fix).
- (c) Either reconcile district slugs (D3) or keep an explicit `content/districts/<db-slug>/ ↔ content/districts/<authored-slug>/` mapping in the resolver.
- (d) Filter public `GET /api/location` to `metadata->>type = 'location'` (D1).

---

## 7. Recommended Phased Plan

### Phase 0 — Reconcile docs (no code)

- Mark `00-shared-infrastructure.md`, `01-characters-view-and-edit.md`, `02-locations-view-and-edit.md` Implemented. (This audit supersedes their open questions; the described work already landed.)
- Update `content/README.md` directory tree (already corrected in this audit).
- Publish this audit at `docs/CONTENT_DB_CORRELATION_AUDIT.md`.

### Phase 1 — Fix characters in a location (content + migration)

**Tradeoff:** Extends `YAMLLocationSchema` / upsert path, but keeps locations as `scenes` rows (no new table).

1. Extend `YAMLLocationSchema` with optional `npcs: uuid[]` and `available_dialogues: uuid[]` (`shared/src/schemas/yaml-content.ts`).
2. Update `processLocationData` to insert/remove `scene_characters` links after `upsertScene`, mirroring `processSceneData` (`upsert.ts:36-48`).
3. Update `GET /api/location` to filter `metadata->>type = 'location'` (D1).
4. (Optional) Add district slug reconciliation in a pre-migrate step.

### Phase 2 — Make the client map show real data (content + tile population)

**Tradeoff:** Two sub-options from D4/D5 — either populate the designed `map_tiles` layer, or derive tiles from authored content.

- Option A (designed): Author `content/maps/<district_slug>.yaml` files conforming to `MapTileFileSchema`; wire map route to read them; populate `map_tiles.metadata.location_id`. Keeps per-tile art/terrain/rotation intact.
- Option B (derive): Derive tile grids from `scenes`/`locations` grouped by `district_id`. Faster, no new content format, but drops per-tile terrain/rotation.
- Either way: set `tile.metadata.location_id` and verify `MapView.tsx:262-266` navigation works.

### Phase 3 — Fix YAMLLocationSchema ↔ real YAML drift (D6)

- Choose the direction: extend schema, or rename authored YAML.
- Regenerate `LOCATION_VIEW_FIELDS` + `LOCATION_EDIT_FIELDS` from the corrected schema so the admin editor reflects real content.
- Run `npm run validate:content` to ensure parser passes across all 77 files.

### Phase 4 — Extend edit views to remaining entities

**Tradeoff:** The shared machinery (`EntityDetailView` / `EntityEditForm` / `useEntityYaml` / `admin-content-resolver.ts`) already works for character, location, and any entity with a uuid PK. Extending it to the others is a scoping + field-definition exercise.

- Covered: scene, gig, vault, shop_item, story, overlay, mission — just add `field-definitions.ts` files per entity.
- Special-case: `story_beat` — slug PK → resolver must search by slug in addition to id (D7).
- Low value to convert: district and lore — districts are SQL-seeded and short-lived; lore is markdown research, not entity data.

## 8. Stale-Doc Reconciliations (list)

| Location | Stale claim | Current truth |
|---|---|---|
| 02-locations-view-and-edit.md:10 | GET /admin/locations/:id does not exist | Registered at `server/src/routes/admin-list-views.ts:271-274` |
| 02-locations-view-and-edit.md:55 | Detail view will flatten metadata for display | Already flattened in `admin/src/app/(admin)/locations/[id]/page.tsx:81-90` |
| 02-locations-view-and-edit.md:83-106 | Files admin-list-views.ts, locations/[id]/page.tsx, field-definitions.ts, [id]/edit/page.tsx are all new | All four are already in the codebase |
| 01-characters-view-and-edit.md:83-87 | Files are all new | characters/[id]/page.tsx, [id]/edit/page.tsx, field-definitions.ts already exist and use `EntityDetailView`/`EntityEditForm` |
| 00-shared-infrastructure.md:112-124 | Shared components + hooks + field-definition files are new | All already shipped: `EntityDetailView.tsx`, `EntityEditForm.tsx`, `useEntityYaml.ts`, `useEntityYamlSave.ts`, `admin-content-resolver.ts` |
| content/README.md:13-23 | `content/locations/<slug>/` and `content/maps/` listed as top-level folders | Locations live under `content/districts/<district>/locations/<slug>/`; `content/maps/` does not exist. Fixed in this audit. |

> **Note on open drift:** D1–D7 remain unimplemented as of this audit. The phased plan (Section 7) lists them in priority order.

---

_End of audit. For questions or corrections, ping the plan author or open a follow-up task._
