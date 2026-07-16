# Milestone 06 — Asset cascade via `portrait_urls` JSONB labels (dev/staging/production)

## Goal

Add the three-stage cascade that supports the user's flow, implemented
entirely inside the existing `portrait_urls` JSONB array — **no new DB
columns**.

The YAML already carries two fields (documented in 00_README "Conventions"):
- `asset_paths.<field>` — the **local selected** asset (relative filename
  inside `assets/`). Authoring state.
- `portrait_urls[]` — the **canonical selected** asset(s): the MinIO URLs the
  game client fetches. Delivery state.

Each `portrait_urls` entry is `{ url, label?, expression? }`. The `label`
field carries the stage: `dev`, `staging`, or `production`. The cascade is
resolved by the client (Milestone 07) by filtering entries on `label` in an
environment-dependent priority order. **There are no `_staging` /
`_production` TEXT columns** — the JSONB array already models the cascade.

- **dev** (local-authoring source of truth): the MinIO object M04 uploaded
  from the chosen local file. Written as a `portrait_urls` entry with
  `label: 'dev'`.
- **staging**: manual QA-promoted. A reviewer in admin appends a
  `portrait_urls` entry with `label: 'staging'` (reusing the same MinIO
  object by default, since the bytes are identical; a new object is uploaded
  only when the staging image actually differs).
- **production**: manual/CI-promoted. Appends a `portrait_urls` entry with
  `label: 'production'`.

**No suffixed object keys in MinIO.** Per 00_README "Conventions" (binding),
the local filename is preserved as the MinIO object key and the stage lives
in the `label`, not in the key. Promotion reuses the existing MinIO object
unless different bytes are supplied. The cascade is resolved by the client
(Milestone 07).

## Pre-requisites

- Milestone 04 (the publish step already uploads to MinIO; this milestone
  changes the upload target and adds the staging/promotion workflow).

## Files to change

### New service

- `server/src/services/AssetPublishService.ts` (from Milestone 04) — extend
  with three methods:
  - `publishDev(item, need)`: uploads the chosen local PNG to MinIO at
    `las-flores/<assetType>/<filename>` (the local filename is preserved as
    the object key) and upserts a `portrait_urls` entry `label: 'dev'`.
  - `promoteToStaging(item, need, opts?)`: upserts a `portrait_urls` entry
    `label: 'staging'`, reusing the dev MinIO object URL by default (or a
    freshly uploaded object when `opts.newBuffer` differs).
  - `promoteToProduction(item, need, opts?)`: upserts a `portrait_urls`
    entry `label: 'production'` (same reuse semantics as staging).
  - `rollbackFromStaging(item, need)`: removes the `label: 'staging'` entry
    from the `portrait_urls` JSONB array.

### New routes

- `server/src/routes/admin-content-asset.ts` (existing) — add three routes:
  - `POST /admin/content/asset/:entityType/:entityId/promote-staging` —
    calls `promoteToStaging` for the entity's primary asset.
  - `POST /admin/content/asset/:entityType/:entityId/promote-production` —
    calls `promoteToProduction`.
  - `POST /admin/content/asset/:entityType/:entityId/rollback` — calls
    `rollbackFromStaging` (sets the staging column to NULL).

### Database schema

**No schema change.** `characters.portrait_urls` (and the analogous JSONB
columns on `scenes` / `locations`) already exist (migration 038 + the
per-table columns). The cascade is stored as `label`-tagged entries inside
those arrays. Do **not** add `portrait_url_staging` / `portrait_url_production`
TEXT columns — that duplicates state the JSONB already models and was rejected
in favor of the label approach. The previously planned migration
`051_asset_stage_columns.sql` is therefore **removed**.

### Deploy pipeline

- The deploy script (`start-stack.sh` for dev, `docker-compose.prod.yml` for
  prod) does NOT need to change — MinIO has the objects and the cascade lives
  in the `portrait_urls` JSONB array, read by the client (Milestone 07).

### Admin UI

- `admin/src/app/asset-coverage/` — extend to show per-asset the current
  state of all three stages (dev/staging/production) by reading the `label`
  of each `portrait_urls` entry. Show timestamps for each stage if available.
- `admin/src/app/asset-promotion/` (new) — add a "Promote to Staging" and
  "Promote to Production" button per asset that call the new routes.

## Implementation outline

### The promotion service

```ts
// server/src/services/AssetPublishService.ts (additions)
import { uploadToMinio } from '../services/StorageService.js';

type Stage = 'dev' | 'staging' | 'production';

// Upsert (replace any existing entry with the same label) a stage entry
// in the entity's portrait_urls JSONB array. By default promotion reuses the
// dev MinIO object URL; when `newBuffer` is supplied a new object is uploaded
// first.
export async function upsertStageEntry(
  table: 'characters' | 'scenes' | 'locations',
  column: 'portrait_urls' | 'image_url' | 'background_url',
  id: string,
  stage: Stage,
  url: string,
  expression?: string,
): Promise<void> {
  await queryOLTP(
    `UPDATE ${table}
       SET ${column} = COALESCE(
         (SELECT jsonb_agg(e) FROM jsonb_array_elements(${column}) e
            WHERE e->>'label' IS DISTINCT FROM $2),
         '[]'::jsonb
       ) || jsonb_build_object('url', $3, 'label', $2, 'expression', $4)
     WHERE id = $1`,
    [id, stage, url, expression ?? null],
  );
}

export async function promoteToStaging(
  item: { type: 'character' | 'scene' | 'location'; id: string },
  devUrl: string,
  newBuffer?: Buffer,
): Promise<{ stagingUrl: string }> {
  const stagingUrl = newBuffer
    ? await uploadToMinio(newBuffer, /* computed key */ '', 'image/png')
    : devUrl;
  await upsertStageEntry(`${item.type}s`, 'portrait_urls', item.id, 'staging', stagingUrl);
  return { stagingUrl };
}
```

`promoteToProduction` follows the same shape with `stage: 'production'`.
`rollbackFromStaging` removes the `label: 'staging'` entry using the same
`COALESCE(jsonb_agg(...))` filter minus the append.

`promoteToProduction` and `rollbackFromStaging` follow the same pattern.

### The admin UI for promotion

A new page at `admin/src/app/asset-promotion/page.tsx` lists every entity
with asset needs, grouped by content type. For each entity:

```
Aisha Al-Sayed (character)
  Portrait
    dev:       2026-07-15 01:30  (author: aisha)        [View] [Rollback]
    staging:   —                                            [Promote to Staging]
    production: 2026-07-10 14:22  (qa: reviewer42)        [View]
```

Clicking "Promote to Staging" calls the new route and refreshes the page.

### The two-field model in the YAML and DB

The user explicitly asked for two fields: one for local selected, one
for canonical selected (MinIO). The model is:

**YAML `asset_paths.<field>`** — the **local selected asset**: the
filename of the chosen PNG inside the per-entity `assets/` folder.
This is what the user picked. Examples: `<slug>__default.png`,
`<slug>__<timestamp>.png`. The YAML is the source of truth for the local
selection.

**`portrait_urls[]` JSONB** — the **canonical selected asset(s)**: the MinIO
URL(s) for the entity, written by the publish step (M04) and the promotion
flow (M06). Three logical stages, modelled as `label`-tagged entries in one
array:

- `{ url, label: 'dev' }` — written by M04 from the chosen local file.
- `{ url, label: 'staging' }` — appended by `promoteToStaging` in M06.
- `{ url, label: 'production' }` — appended by `promoteToProduction` in M06.

The client's `resolveAssetUrl()` (M07) reads from this JSONB array by `label`,
not from the YAML and not from separate columns. The YAML is local-authoring
state; the JSONB array is delivery state.

## Tests to add or update

- `server/tests/integration/asset-promotion.test.ts` — new file. End-to-end:
  1. Approve a plan with one character (publishes to MinIO; `portrait_urls`
     gains a `label: 'dev'` entry).
  2. Promote to staging (`portrait_urls` gains a `label: 'staging'` entry; by
     default the same MinIO URL as dev).
  3. Promote to production (`portrait_urls` gains a `label: 'production'` entry).
  4. Rollback from staging (the `label: 'staging'` entry is removed; `dev` and
     `production` entries remain).
  5. Verify the `portrait_urls` JSONB array has the expected `label` entries.
- `server/tests/unit/AssetPublishService.test.ts` — new file. Unit tests for
  the promotion methods, mocking `uploadToMinio` and `queryOLTP`, asserting the
  correct `label`-tagged entries are upserted/removed.

## Validation gate

1. After approving a plan, the MinIO bucket has one object per published
   asset (the chosen local PNG, with the original filename like
   `<slug>__default.png` (the historical default) or any other file the user picked)
   — no `.dev`/`.staging` suffix in the key.
2. The DB `characters.portrait_urls` JSONB has a `label: 'dev'` entry with
   the MinIO URL.
3. After clicking "Promote to Staging", `portrait_urls` has a `label:
   'staging'` entry (cascade is in the `label`, not the object key).
4. After clicking "Promote to Production", `portrait_urls` has a `label:
   'production'` entry.
5. After clicking "Rollback from Staging", the `label: 'staging'` entry is
   removed from the array; `dev` and `production` entries remain.
6. The promotion flow does NOT create new MinIO objects unless different bytes
   are supplied (no key copies by default).
7. `npm run lint --workspace=server` → 0 errors.
8. `npm run test --workspace=server` → all green.
9. `npm run build --workspace=server` → passes.

## Rollback plan

No DB columns are added (the cascade is inside the existing `portrait_urls`
JSONB). The new service methods and admin page are additive. The promotion
flow is opt-in — entities without `staging`/`production` entries simply fall
back to `dev` in the client (Milestone 07's cascade picks `dev` first anyway).
Removing the promotion routes and pages reverts to single-stage MinIO; the
`portrait_urls` array and its `dev` entries are left intact.
