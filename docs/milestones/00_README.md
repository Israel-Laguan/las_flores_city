# Las Flores 2077 — Content Pipeline Refactor Milestones

> **Session handoff.** This folder captures the analysis and execution plan from the
> plan-mode session on 2026-07-15. Each milestone is a self-contained piece of work
> that can be picked up by a new chat (in act mode) without losing context.
>
> **End goal.** Make `content/` the single source of truth for every game entity
> (YAML + lore + image prompt + image drafts + image publications), tighten the
> Story Builder state machine to model the three authoring stages (idea intake,
> iteration, approve-and-solidify), and add a per-asset dev/staging/production
> cascade that the game client can read with environment-aware priority.

---

## Goals (in priority order)

1. **Colocate game-entity data** — every character, scene, location, overlay, mystery
   becomes a single folder under `content/`. `docs/lore/` shrinks to world-level
   research (timeline, geography, communities, organizations, governance) and
   architecture references.

2. **Add local image drafts** — image generation produces local PNGs first (no
   MinIO upload), the user picks one per asset need, only the chosen draft is
   uploaded. Local drafts are the source of truth for the author; MinIO is
   the delivery layer for the engine.

3. **Tighten the plan state machine** — extend `ContentPlan.status` and
   `AssetNeed.status` to model the full lifecycle: `pending → drafted → chosen →
   published → migrated → verified`. The existing 6-state enum
   (`draft | proposed | approved | staged | migrated | failed`) is a starting
   point, not the destination.

4. **Add a single-click "Approve & Solidify"** — collapse the current 5-step
   wizard (Describe → Review → Stage → Migrate → Results) into a 2-step flow
   (Describe → Approve) for the happy path. The intermediate stages become
   audit trail, not user-facing buttons.

5. **Add a verification step** — after migration, run a cross-reference check
   (lore paths resolve, asset URLs reachable, FKs intact, story beats exist)
   and persist the report on the `content_plans` row. Sets `status='verified'`
   on success. This is the "checked/verified" stage the user requested.

6. **Per-asset environment cascade in MinIO** — every published asset gets
   a single MinIO object (the chosen local filename, preserved as-is). The
   `portrait_urls` JSONB array in the DB carries multiple entries tagged
   with stage labels (`dev`, `staging`, `production`). The **server** picks
   the right entry at request time based on `NODE_ENV` (development/staging
   prefers dev → staging → production; production prefers
   production → staging → dev) and flattens it to a single `portraitUrl` /
   `backgroundUrl` string for the client. The client stays stage-unaware.

---

## Why this matters

The current pipeline has **silent drift** in three places:

1. **YAML references that don't resolve** — `lore_path: docs/lore/figures/x.md`
   is validated as a warning, not an error. The DB row ships with a broken FK.
2. **Image generation detached from the plan** — the author approves the plan,
   migrates the DB row, and only then visits `/assets` to generate a portrait.
   The plan and the asset can drift out of sync (portrait shows a different
   character than the YAML describes).
3. **No way to roll back a bad image** — once a portrait is published to
   MinIO and wired into the YAML, replacing it requires a full manual
   re-publish. There's no staging environment for assets.
4. **Dev-time scripts that bypass the server** — `scripts/import-drafts.mjs`
   creates its own `pg.Pool` and MinIO client, duplicating
   `server/src/routes/assets-import.ts`. `LoreGenerator.ts` and
   `PromptFileGenerator.ts` still write to stale `docs/lore/` paths instead of
   `content/`. The server's role as the sole mediator between `content/` and the
   database is not enforced, so the content boundary is blurry.

The milestones below fix all four, in order.

---

## Conventions (binding for every milestone)

### Folder structure per entity

The `assets/` folder is the **canonical per-entity folder** that already
exists in the repo today (e.g. `docs/lore/figures/aisha_al_sayed/assets/aisha_al_sayed__default.png`).
Milestone 01 **moves it as-is** to the new location; it does **not** create a
new `assets/` folder.

```
content/characters/<slug>/
  ├── char_<slug>.yaml            # engine schema (moved from flat content/characters/)
  ├── <slug>.md                   # human narrative (moved from docs/lore/figures/<slug>/)
  ├── <slug>.prompt.md            # image prompt (moved from docs/lore/figures/<slug>/)
  └── assets/                     # MOVED as-is. ALL assets live here, flat, no sub-folders.
      # Any valid image/video file is fair game. The admin selector
      # reads the directory and shows every valid file as a thumbnail,
      # regardless of name. Files can be:
      #   - Pre-existing drafts from docs/lore/figures/<slug>/assets/
      #     (e.g. <slug>__default.png — the historical record)
      #   - Generated by the in-app generator (uses the convention
      #     <slug>__<ISO-timestamp>.png for sortable, unique names)
      #   - Dropped in by hand via the OS file manager (any name)
      # Only the file the user selects is published to MinIO.
```

Same shape for `content/locations/<slug>/`, `content/scenes/<slug>/`,
`content/overlays/<slug>/`, and `content/mysteries/<slug>/`.

**The selection lives in the YAML, not the filename.** The user's
requirement: *"the one that is selected is marked on the yaml, remember we
had two fields, one for local selected, and the canonical selected
(minio)"*. The two fields are:

```yaml
# inside char_<slug>.yaml
asset_paths:
  portrait: <slug>__default.png      # local_selected_asset: the file inside assets/ that is currently chosen
  # canonical_selected_asset is stored separately as a full URL (see MinIO naming below)
```

The `portrait` field is the **local selected** asset — the file inside
`assets/` that the user has marked as the one to publish. The
`canonical_selected_asset` (or the `portrait_urls` JSONB column on
`characters`) holds the **MinIO URL(s)** for the entity, which is what the
game client actually fetches.

**No suffixed versions, anywhere.** The local filename (e.g.
`<slug>__default.png`, `<slug>__2026-07-15T01-30-12.png`, or anything
else the user dropped in) is preserved as-is on disk AND as the MinIO
object key. There is no `.dev`/`.staging` suffix on disk or in MinIO.
The cascade lives in the `portrait_urls` JSONB array entries (tagged
with `label`), not in filenames or object keys.

### Content layering contract

The three layers have strict ownership rules. `content/` is the single
source of truth; the server is the sole mediator between `content/` and the
runtime stores.

```
content/          ← dev-mode file database (data only: YAML + .md + .prompt.md + assets/)
docs/lore/        ← world-level research (markdown only: timeline, geography, communities, ...)
scripts/          ← dev-time file-to-file tools (produce content/ files, NEVER touch the DB)
shared/           ← the contract (Zod schemas + types — define what content IS)
server/           ← the sole mediator (content/ ↔ Postgres, admin ↔ content/)
```

Binding rules (these are the architecture the milestones implement):

1. **The server is the sole mediator** between `content/` and Postgres / Redis /
   MinIO. No script may create its own DB pool, Redis client, or MinIO client.
2. **Scripts produce files, not DB rows.** Dev-time scripts in `scripts/` may
   read and write files under `content/` and `docs/lore/`, but they must not
   connect to the database or object storage directly. If a script needs DB
   access, it calls a server endpoint instead.
3. **Dashboard reads content through server endpoints only.** The dashboard UI never
   touches `content/` directly — every read (tree, file, validate, migrate,
   drafts) goes through an Express route under `server/src/routes/`.
4. **`content/` contains data only.** No TypeScript, no scripts, no compiled
   code. The schemas that define content shapes live in `shared/src/schemas/`.
5. **`docs/lore/` is world-level research.** After Milestone 01 it contains only
   timeline, geography, communities, governance, organizations, media, events,
   and world-level district docs — no per-entity files, no scripts, no
   registries.

**MinIO naming** — the local filename is preserved as the object key.
There is no `.dev`/`.staging` suffix on the MinIO key; the cascade lives
in the `portrait_urls` JSONB array. Example for Aisha Al-Sayed with
`<slug>__default.png` as the chosen local file:

- `las-flores/portrait/<slug>__default.png` — single MinIO object that
  holds the canonical image for this entity
- The `portrait_urls` JSONB column carries the cascade (see below).

**Key clarifications:**

- The `assets/` folder is **not new** — it already exists per entity in
  `docs/lore/figures/<slug>/assets/` (and `docs/lore/districts/<district>/landmarks/<slug>/assets/`).
  Milestone 01 moves it intact, including the pre-existing `<slug>__default.png` files.
- **No sub-folders** in `assets/`. New generated drafts are added
  flat using the convention `<slug>__<ISO-timestamp>.<ext>` (so they're
  sortable by time and unique). Files dropped in by hand can have any
  name. The admin selector reads the directory and shows every file
  with a valid asset extension.
- **No suffixed filenames** for the published markers — the local filename
  is preserved as the MinIO object key. The cascade lives in the
  `portrait_urls` JSONB array entries, not in filenames or object keys.
- The YAML is the single source of truth for "which local file is
  selected" (`asset_paths.<field>`) and "what MinIO URL is canonical"
  (the `portrait_urls` JSONB column, written by M04).

After Milestone 01, `docs/lore/` contains only **world-level research**
(timeline, geography, communities, governance, organizations, media,
events, world-level district `.md` files, guides, assets/) and
**architecture docs** (the `.md` files at the top of `docs/`).

### MinIO naming

- **One bucket**: `las-flores`.
- **One object per chosen asset** — the local filename is preserved as the
  MinIO object key. No `.dev`/`.staging` suffix on the key; the cascade
  lives in the `portrait_urls` JSONB array (see below).
  - `las-flores/portrait/<slug>__default.png` — single canonical object
- **Same key prefix** as the asset type (`portrait/`, `background/`,
  `biometric/`, `tile/`, `overlay/`).

### Database columns

Asset URLs are stored in a `JSONB` array, not as separate TEXT columns.

- `characters.portrait_urls` (`JSONB`, migration 038) — array of
  `{ url, label?, expression? }` objects. Each entry is a MinIO URL
  for a published portrait variant. The first entry (`[0]`) is the
  canonical/dev URL.
- `characters.avatar_url` (`VARCHAR(500)`) — legacy single URL.
- `characters.atlas_url` (`TEXT`) — atlas/biometric sheet URL.
- Same pattern for scenes (`image_url`, `background_url`) and other
  asset-bearing tables.

The `portrait_urls` JSONB array carries the cascade: the server picks
the appropriate entry based on `NODE_ENV` and flattens it to a single
`portraitUrl`/`backgroundUrl` string for the client. No separate staging
or production columns are needed — the array entries are tagged with
`label` when uploaded at different stages.

### Server cascade (in `server/src/services/AssetStageResolver.ts` — new file, Milestone 07)

> **Updated 2026-07-17:** the cascade lives **server-side**, not in the client.
> The original draft put it in `client/src/services/assetResolver.ts`, but the
> server is the sole mediator and already flattens assets to single strings
> (`portraitUrl`, `backgroundUrl`) before they reach the client. The client
> never sees the stage array.

```ts
// server/src/services/AssetStageResolver.ts
type Env = 'development' | 'staging' | 'production';
type Stage = 'dev' | 'staging' | 'production';

export const STAGE_PRIORITY: Record<Env, ReadonlyArray<Stage>> = {
  development: ['dev', 'staging', 'production'],
  staging:     ['dev', 'staging', 'production'],
  production:  ['production', 'staging', 'dev'],
};

export function getEnv(): Env {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'development' || nodeEnv === 'staging') return nodeEnv;
  return 'production';
}

interface AssetEntry { url: string; label?: string; expression?: string; }

export function resolveAssetUrl(entries: AssetEntry[] | null | undefined,
                                opts?: { expression?: string }): string | null {
  if (!entries || entries.length === 0) return null;
  const eligible = opts?.expression
    ? entries.filter(e => (e.expression || '').toLowerCase() === opts.expression!.toLowerCase())
    : entries;
  const pool = eligible.length > 0 ? eligible : entries;
  for (const stage of STAGE_PRIORITY[getEnv()]) {
    const match = pool.find(e => e.label === stage && typeof e.url === 'string' && e.url.length > 0);
    if (match) return match.url;
  }
  return pool.find(e => typeof e.url === 'string' && e.url.length > 0)?.url ?? null;
}
```

This is the single function the server uses to resolve any asset URL from its
stage-tagged JSONB array (`portrait_urls`, `background_urls`, `image_urls`)
before flattening it into the single string the client fetches. Replacing a
portrait in dev is: upload the new image to MinIO, append an entry with
`label: 'dev'` to the YAML `portrait_urls` array, re-migrate, and the server
picks it up in dev builds. No client code change.

---

## Milestone index

| # | Milestone | Status | Risk | Reversible |
|---|---|---|---|---|
| 01 | Colocate lore into `content/` | **Done** | Low (file moves) | Yes (git revert) |
| 02 | State machine refactor (enums, CHECK constraints) | **Done** | Low (additive) | Yes (down-migration) |
| 03 | Local image drafts (no MinIO) | **Done** | Medium (new route + UI) | Yes (delete folder) |
| 04 | Single-click approve-and-solidify | **Done** (orchestrator + route + `AssetPublishService` + `PlanVerificationService` wired in) | Medium (wizard UX) | Yes (revert wizard) |
| 05 | Verification step (cross-ref checks) | **Done** (`PlanVerificationService` implements 7 real checks: lore/narrative/asset path resolution, FK integrity, story-beat refs, cross-plan consistency, asset-need status) | Low (new service) | Yes (delete service) |
| 06 | Asset cascade via `portrait_urls` JSONB `label` (dev/staging/production) | **Done** (promotion methods + routes + admin `/asset-promotion` page for **characters**; scenes/locations deferred to M07) | Low (JSONB upserts) | Yes (remove label entries) |
| 07 | Server-side env-aware cascade resolver (extends cascade to scenes/locations) | **Done** (`AssetStageResolver` + migration 051 + wired into `location.ts` background resolution) | Low (new service + additive migration) | Yes (drop columns + delete service) |
| 08 | Admin UI updates (wizard, verification report, promotion page) | **Done** (2-step wizard, `VerificationReport` component, `/asset-promotion` page, `reviewStep` with draft panel) | Medium (UX changes) | Yes (revert components) |

**Recommended execution order:** 01 → 02 → 03 → 06 → 05 → 04 → 07 → 08.
(Note: M04's `dev` entry is already implemented and is the real pre-requisite
for M06's promotion; the README order above is aspirational — see M06 "Status".)

M01–M05 are complete. **M06 is complete** for characters (promotion methods,
routes, admin page). **M07 is complete** (server-side `AssetStageResolver`,
migration 051 adding JSONB arrays to scenes/locations, wired into route
resolvers). **M08 is complete** (2-step wizard, verification report UI,
asset drafts panel in ReviewStep, `/asset-promotion` page).

---

## What is NOT in scope

- **Multi-language support** (Spanish/English). Currently out of scope; the
  colocation makes it easier to add (`<slug>.es.md`, `<slug>.en.md`) but the
  LLM-side translation work is its own milestone.
- **Live preview during intake** (the user sees a low-fidelity render of the
  character while typing the description). This is a UX milestone that depends
  on the local-draft generation being fast.
- **AI-assisted image editing** (regenerate variant from a chosen base). The
  current `/assets/generate-variants` endpoint already does this; surfacing it
  in the intake UI is a UX milestone, not a pipeline change.
- **Image provenance / attribution tracking** (which model, which seed, which
  prompt version produced this image). The `asset_bases` table already stores
  `seed` and `prompt_text`; wiring those into the YAML and the cascade is a
  follow-up.

---

## How to use this folder

Each milestone document is structured as:

1. **Goal** — what the milestone delivers.
2. **Pre-requisites** — which other milestones must be done first.
3. **Files to change** — exact list, with line numbers when known.
4. **Implementation outline** — the shape of the change, not the full code.
5. **Tests to add or update** — unit + integration.
6. **Validation gate** — what must pass before the milestone is "done".
7. **Rollback plan** — how to revert if something goes wrong.

A new chat in act mode can pick up any milestone by reading the document and
the linked files, no other context required.
