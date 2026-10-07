# SC-S12 — Are existing `content/scenes` + the `scenes` table the new Scene model, a location it references, or something to rename around?

**Box:** 0.5-1 day · **Actual:** ~0.5 day · **Date:** 2026-10-06
**Feeds:** SC-301, SC-311, SC-314, SC-315, SC-401, SC-601; gates sprint-03 Groups D1, D4, F2

## Question

`content/scenes/*` (21 folders) and the `scenes` table are location backdrops (`district`,
`background_url`, `mood`, `available_dialogues`, `idle_thoughts`), not situations with role
slots, items and activities. Do they (a) become base scenes of the new model, (b) become
`location`s that new scenes *reference*, or (c) stay as-is while the new entity gets a different
name? SC-301/SC-311/SC-315 cannot be shaped until this is settled.

## What was run

Committed throwaway harness (file-only, no DB; uses `js-yaml` from root `node_modules`):

```
node server/scripts/spikes/scene-projection.mjs
```

It reads every `content/scenes/<slug>/*.yaml`, projects it into a draft SC-301 `Scene`
(`slug, location, time, weather, participants, role_slots, items, dialogue_refs, availability,
priority`), and prints the per-field disposition table plus three sample drafts.

Reader inventory (grep for `FROM|JOIN|INTO|UPDATE|REFERENCES scenes` across `server/src`,
`infra`, `shared`, `client/src`, `admin/src`, plus a word-level `scenes` pass to catch
table-name maps):

```
grep -rnE "(FROM|JOIN|INTO|UPDATE|TABLE|REFERENCES|ON)\s+(public\.)?scenes\b" server/src infra/src shared/src client/src admin/src --include=*.ts --include=*.tsx --include=*.sql
grep -rnE "scenes\b" server/src/database/migrations/*.sql | grep -iE "create table|alter table|references|index|insert"
```

Extra checks read by hand: `server/src/content/migrate.ts:23-24`, `server/src/content/upsert.ts:124`
(`processLocationData` writes `metadata.type='location'` rows into the same `scenes` table),
`content-upserts.ts:87-125`, `shared/src/schemas/yaml-content.ts` (`YAMLSceneSchema`,
`YAMLLocationSchema`).

## Raw results

Projection output (unedited):

```
# SC-S12 projection: 21 folders, 20 with a YAML
folders with NO yaml (cannot be imported): rooftop_vigil
yaml not named scene_<slug>.yaml: the_apartment/the_apartment.yaml, welcome_center/welcome_center.yaml 

folder | district | metadata.type | mood | #dlg | #npcs | #idle | required_story_beat | bg variants
acuario | Port | entertainment | commercial | 0 | 0 | 7 | - | default+night+sunset+rain
aeropuerto | City | transport_hub | transient | 0 | 0 | 7 | - | default+night+sunset
apartment | South | starting_location | cozy | 2 | 0 | 10 | - | default+night+sunset+day
cafe | South | (none) | cozy | 4 | 0 | 3 | act1_awakening | default+night+sunset
central_plaza | Central | (none) | vibrant | 1 | 1 | 3 | - | default+night+sunset
estacion_central | City | transport_hub | transient | 0 | 0 | 7 | - | default+night+sunset
far_south | Far South | (none) | serene | 0 | 0 | 3 | - | default+night+sunset
industrial | Industrial | (none) | gritty | 5 | 1 | 3 | - | default+night+sunset
la_casa_de_la_musica | City | entertainment | energetic | 0 | 0 | 7 | - | default+night+sunset
los_andes | Los Andes | (none) | exclusive | 0 | 0 | 3 | - | default+night+sunset
north | North | (none) | ordinary | 0 | 0 | 3 | - | default+night+sunset
northeast | Northeast | (none) | transitional | 0 | 0 | 3 | - | default+night+sunset
pacific | Pacific | (none) | maritime | 0 | 0 | 3 | - | default+night+sunset
parque_atracciones | Port | entertainment | stimulating | 0 | 0 | 7 | - | default+night+sunset
rainy_street_motorcycle | South Las Flores | (none) | rain-soaked, neon-lit, tense | 0 | 0 | 0 | - | default+night+sunset+day
school_classroom | Universidad del Valle | (none) | neon-lit, tense, surveilled | 1 | 0 | 0 | - | default+night+sunset+day
secondary_city_sunset | South Las Flores | (none) | melancholic, neon-drenched, transitional | 0 | 0 | 0 | - | default+night+day
southeast | Southeast | (none) | resilient | 0 | 0 | 3 | - | default+night+sunset
the_apartment | City | starting_location | tense | 7 | 2 | 10 | - | default+night+sunset+day
welcome_center | City | starting_location | neutral | 1 | 2 | 10 | - | default+night+sunset+day

## Top-level key frequency (of 20)
id                   20  -> location.id (hard FK target; Scene.location)
name                 20  -> location.name
description          20  -> location.description
district             20  -> location.district (stays on location; Scene inherits)
district_lore        20  -> location.metadata
district_subzone     20  -> location.metadata
mood                 20  -> location default; Scene may override (candidate Scene.mood)
available_dialogues  20  -> MAPS -> Scene.dialogue_refs (seed only; ordered UUID[] of dialogue_trees)
lore_path            20  -> location
asset_paths          20  -> location
background_urls      20  -> location asset (env variants; Scene.weather/time select among them)
metadata             17  -> location.metadata (see sub-keys)
background_url        9  -> location asset

## metadata.* key frequency
idle_thoughts        17
type                  8
accessible            8
features              8
ambiance              8
npcs                  4
is_sleep_location     2
required_story_beat   1

## Summary
scenes with >=1 available_dialogues : 7 (total refs 21)
scenes with metadata.type            : {"entertainment":3,"transport_hub":2,"starting_location":3,"(none)":12}
scenes with npcs (participants seed) : 4
scenes with required_story_beat      : 1
fields with NO authored source (new-required on Scene): time, weather, participants, role_slots, items, priority, availability
Scene-shaped fields populated in any of 21 (time/weather/role_slots/items): 0

## Draft Scene (3 samples)
{
  "slug": "central_plaza",
  "location": "a1b2c3d4-e5f6-7890-abcd-ef1234567001",
  "time": null,
  "weather": null,
  "participants": [
    {
      "ref": "a0000001-0000-4000-8000-000000000003",
      "slot": null
    }
  ],
  "role_slots": [],
  "items": [],
  "dialogue_refs": [
    "a0000001-0002-4000-8000-000000000011"
  ],
  "availability": null,
  "priority": 0
}
{
  "slug": "cafe",
  "location": "123e4567-e89b-12d3-a456-426614174001",
  "time": null,
  "weather": null,
  "participants": [],
  "role_slots": [],
  "items": [],
  "dialogue_refs": [
    "123e4567-e89b-12d3-a456-426614174002",
    "f6a7b8c9-d0e1-4345-babc-456789012345",
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "5a8d9b1c-7f2e-4b3a-9c8d-1e2f3a4b5c6d"
  ],
  "availability": {
    "flag": "act1_awakening"
  },
  "priority": 0
}
{
  "slug": "acuario",
  "location": "bd65f55f-3ae3-4f8d-b90c-87e9b854e890",
  "time": null,
  "weather": null,
  "participants": [],
  "role_slots": [],
  "items": [],
  "dialogue_refs": [],
  "availability": null,
  "priority": 0
}
```

Additional facts that came out of reading the code, not the script:

- `find content/districts -path '*locations*' -name '*.yaml' | wc -l` = **75**. These are
  `type: location` YAMLs; `CONTENT_TYPE_TABLE` maps both `scene` and `location` to table `scenes`
  (`migrate.ts:23-24`). So the DB table holds **95 rows** (20 scene YAMLs + 75 location YAMLs), and
  the admin `/locations` view is literally `SELECT ... FROM scenes WHERE metadata->>'type'='location'`
  (`admin-list-views.ts:277-295`). **The word "location" already means a row of `public.scenes`.**
- DB columns today: `id UUID, name, description, district_id, image_url, background_url,
  background_urls, image_urls, ambient_sound_url, mood, available_dialogues UUID[], metadata JSONB`.
  **No slug column** - slug exists only as the folder name.
- Foreign keys INTO `scenes(id)`: `users.current_location_id`, `player_states.current_location_id`,
  `scene_characters.scene_id`, `gigs.location_restriction_id`, `dialogue_trees.scene_id`
  (`migrate.ts:241`), `dialogue_ownership.scene_id` (057).
- Data-quality: `rooftop_vigil/` has **no YAML at all** (empty folder, nothing imports it);
  `the_apartment/` and `welcome_center/` YAMLs are not named `scene_<slug>.yaml`
  (`AssetPublishService.ts:283` expects prefix `scene_`, so asset publish skips them).

### Reader inventory (who touches `scenes`)

| Reader / writer | Where | Uses | Breaks if table **renamed** | Breaks if table **extended** |
|---|---|---|---|---|
| Content importer (W) | `content/content-upserts.ts:103`, `upsert.ts:37,124`, `migrate.ts:23-24,241` | full row upsert incl. `available_dialogues` | yes | no (additive columns) |
| Player state / travel | `routes/player.ts:157,233`, `player-helpers.ts:95-97` | `metadata` (district, travel, story beat gate) | yes | no |
| Location API | `routes/location.ts:33,81,195,224,271` (via `queryContent`) | `metadata`, `available_dialogues`, `dialogue_trees = ANY(s.available_dialogues)` | yes | no |
| Dialogue start | `routes/dialogue-helpers.ts:417` | `unnest(available_dialogues) WITH ORDINALITY` (ordering is load-bearing) | yes | no |
| Admin list/detail | `routes/admin-list-views.ts:168-184,277-294,344` | `/scenes`, `/locations` (`metadata->>'type'`), gigs join | yes | `SELECT *` detail would leak new columns |
| Admin misc | `admin-stats.ts:25`, `admin-coverage.ts:92`, `admin-story-beats.ts:113,337,408` | counts, backgrounds, `metadata->>'required_story_beat'` | yes | no |
| Plan intake / graph | `GraphSeedSource.ts:75,200`, `ContentContext.ts:30`, `ContentPlanService.ts:79`, `GraphIntakeService.ts:339,512`, `IdentityResolver.ts:255`, `RevisionService.ts:40-41`, `PlanVerificationService.ts:202`, `NeighborhoodProvider.ts`, `ValidationHarnessService.ts` | already treat entity kind **"Scene"/"scene" == a `scenes` row** (name lookup, FK check, neighborhood) | yes | no |
| Migrations / DB | 001, 004, 010, 012, 033, 034, 045, 046, 051, 057, 069 (`trg_scenes_canonical_alias`, `entity_identity` backfill) | schema, FKs, alias trigger | yes (6 FKs + trigger) | no |
| Assets | `AssetPublishService.ts:283`, `admin-content-asset.ts:12`, `assets.helpers.ts:35`, `admin-content-resolver.ts:52` | folder `content/scenes`, prefix `scene_`, `background_urls` | path-only | no |
| Admin UI | `admin/src/app/(admin)/{scenes,locations,asset-coverage,content-linker,story-builder,...}`, `nav-config.ts:66-67` | via the API above | via API only | via API only |
| Game client | `client/src/utils/api.ts:143-151` (`/location/:id`), `DialogueUI.ts:113` (`sceneId`) | **never the table**; `main.ts` "scenes" are Phaser classes (`BootScene`, `LocationScene`) | API param names only | no |
| `shared/` | `YAMLSceneSchema`, `YAMLLocationSchema`, `entity-identity.ts` | contract | yes | optional fields only |

Roughly 30 server files plus 6 inbound FKs and a trigger depend on the name `scenes` meaning
"place". Renaming or repurposing it is a cross-cutting migration, not a spike-sized change.

## Answer

**Mapping: (b), implemented with the naming discipline of (c).**

1. The 20 importable scene YAMLs - and in fact all 95 `scenes` rows - are **locations**. They
   author a *place* (district, backdrop variants, mood, ambient idle prose). 0 of 20 author any
   of `time`, `weather`, `role_slots`, `items`, `activities`; only `available_dialogues` (7 scenes,
   21 refs), `metadata.npcs` (4 scenes) and one `required_story_beat` (`cafe`) carry
   situational data. They cannot be base scenes without inventing all new-required fields.
2. **(a) is rejected**: it would mean authoring seven required fields on 20 rows for
   nothing, and `rooftop_vigil` has no YAML at all. **Pure (c) is rejected**: the plan-intake
   code already equates entity kind "Scene" with a `scenes` row (`GraphIntakeService`,
   `IdentityResolver`, `PlanVerificationService`, `RevisionService`), so a second thing called
   Scene would make every one of those call sites ambiguous.
3. **The old table is never renamed, extended with scene-model columns, or repurposed**
   (30 readers, 6 FKs, a trigger; cost with zero benefit). Legacy `public.scenes` stays the
   canonical *location* store until SC-905-908 archive it.

**Name of the new entity in code:** `SceneDef` (not `Scene`).
- TS contract `SceneDef` / `SceneDefSchema` / `SceneDefRepository` / `PgSceneDefRepository`;
  overlay `SceneOverlay`; table **`planning.scene_defs`** (+ `planning.scene_overlays`);
  artifact kind string `scene`.
- "Scene" stays the *prose/product* word (proposal, docs, UI labels). In code, a bare `scene`
  / `Scene` / `scenes` identifier means the **legacy location row** until retirement, and new
  code must call it `location`/`LocationRow` at its boundary. Rationale: `Scene` is already taken
  three ways (`YAMLScene`, `scenes` table/`scene_id` FKs, Phaser `LocationScene`), and the
  proposal's `planning.scenes` vs `public.scenes` differ only by schema qualifier, which does not
  survive an unqualified `FROM scenes` in review.
- This **renames** the table named in SC-311 (`planning.scenes`) and SC-314 repository; needs
  owner sign-off before the scene_defs migration is written (now 101) (cheap now, expensive after).

**SC-301 `location` field:** a **hard reference by UUID `id`** to a legacy `scenes` row (not
by slug - slug is not in the DB; the UUID is also what `players.current_location_id` and
every dialogue FK already use). Hence compiled artifacts carry `location_id == public.scenes.id`
and the runtime travel/location model is untouched.

**Importer contract for F2 (SC-315)** - rewritten from "import scenes" to "import locations,
seed ambient scene defs":

- **Input:** every `content/scenes/*/*.yaml` (glob `*.yaml`, **not** `scene_*.yaml`, so
  `the_apartment` and `welcome_center` are included) **and** `content/districts/*/locations/*/*.yaml`
  (75 `type: location`). Parse with the existing `YAMLSceneSchema`/`YAMLLocationSchema`; a folder
  without a YAML (`rooftop_vigil`) is a reported warning, not a failure.
- **Output 1 - `planning.locations`** (thin mirror, one row per YAML, **key = YAML `id`**,
  plus `slug` = folder name, `name`, `district`, `kind` in `scene|location` for provenance).
  Backdrop/asset/idle-thought data is **not copied** - it stays on the legacy row and is read
  at compile through the location reference. This makes `SceneDef.location` an in-schema FK
  and keeps the planning role from reading `public`.
- **Output 2 - seed `planning.scene_defs`, only for scene YAMLs with situational data**
  (today 7: `apartment, cafe, central_plaza, industrial, school_classroom, the_apartment,
  welcome_center`): slug `<folder>__ambient`, `location` = YAML id, `time=null`, `weather=null`,
  `dialogue_refs` = `available_dialogues` **in order** (ordering is load-bearing, see
  `dialogue-helpers.ts:417`), `participants` seeded from `metadata.npcs` (slot unassigned),
  `availability` from `metadata.required_story_beat` as a flag condition (`cafe` only),
  `priority=0`, `role_slots=[]`, `items=[]`.
- **Dropped (stay on the location):** `idle_thoughts` (17/20), `features`, `ambiance`,
  `accessible`, `type`, `is_sleep_location`, `background_urls` variants (`default`, `night`,
  `sunset`, `rain`, `day`) - the variant tags become the **allowed vocabulary** for
  `SceneDef.time`/`weather`, not data to import.
- **Properties:** one-way (`content/` -> planning, never back), idempotent (upsert on id /
  `(slug)`), file-to-DB via `PgSceneDefRepository` (oltpPool, per AGENTS.md), re-run produces zero
  diff; no write to `public.scenes`; no runtime reads of the result (runtime reads artifacts only).
- **Not imported:** `available_dialogues` are references to `dialogue_trees` - the importer must
  verify each UUID exists (tier-2 reference check) and report dangling ones instead of failing.

## What it changes

- **SC-301**: entity is `SceneDef`; `location` = required UUID ref to a legacy location row; `time`
  and `weather` are optional enums drawn from the existing `background_urls[].variant` vocabulary
  (`day|night|sunset|rain`), not free text; `dialogue_refs` is an **ordered** list.
- **SC-311 / SC-314 / SC-401 / SC-601**: rename `planning.scenes` -> `planning.scene_defs`,
  `SceneRepository` -> `SceneDefRepository`; add `planning.locations` mirror to migration 101
  (or a sibling 102; 101 shipped without it). Needs sign-off; no code exists yet so the cost is a doc edit.
- **SC-315** (F2): re-scoped to the contract above - imports **95 locations + 7 seed scene defs**,
  not "21 scenes". Add acceptance: glob `*.yaml`; empty-folder warning; dangling `dialogue_ref` report.
- **D1/D4/F2 unblocked**; sprint-03 Group F's "imports scenes" wording and the backlog SC-S12 row
  should say "locations".
- **Reference docs now wrong/imprecise**: proposal and sprint text that treats `content/scenes`
  as "the base scenes" (and "21 folders" - 20 have a YAML); `planning.scenes` in
  `architecture.md` §3 and `backlog.md`.
- **Follow-up hygiene (not blocking, new tickets):** add the missing `rooftop_vigil` YAML or delete the
  folder; rename `the_apartment.yaml`/`welcome_center.yaml` to `scene_*.yaml` (or fix
  `AssetPublishService` prefix check) so asset publish covers them; consider a lint ban on bare
  `FROM scenes` in new `planning/`/`runtime/` code.
