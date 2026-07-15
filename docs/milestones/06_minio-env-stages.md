# Milestone 06 — MinIO environment stages (`.dev`, `.staging`, bare)

## Goal

Add the three-stage cascade that supports the user's flow:
- **dev** (canonical / local-authoring source of truth): the MinIO object
  that M04 uploaded from the chosen local file. The DB column
  `<field>_url` (e.g. `portrait_url`) holds this URL.
- **staging**: manual QA-promoted. A reviewer in admin moves the dev URL
  into `<field>_url_staging` when the content is ready for broader review.
  The MinIO object is the **same** as the dev object (no copy); only the
  DB column is updated.
- **production**: the deploy pipeline promotes staging to production by
  copying the dev-object bytes to a new `<field>_url_production` URL.
  In a typical setup, production points to the same MinIO object as
  dev (since they are byte-identical); the difference is the **label** on
  the DB column that the client picks.

**No suffixed object keys in MinIO.** Per the user's revision, the local
on-disk filename is preserved through to MinIO. The cascade is recorded
in the **DB columns**, not in the object key:

- `<field>_url` (e.g. `portrait_url`) — the dev URL (set by M04).
- `<field>_url_staging` (e.g. `portrait_url_staging`) — the staging URL
  (set by manual promotion in M06).
- `<field>_url_production` (e.g. `portrait_url_production`) — the
  production URL (set by manual promotion in M06).

The cascade is resolved at runtime by the client, in Milestone 07.
The user's earlier "object-key suffix" convention is superseded by this
simpler model.

## Pre-requisites

- Milestone 04 (the publish step already uploads to MinIO; this milestone
  changes the upload target and adds the staging/promotion workflow).

## Files to change

### New service

- `server/src/services/AssetPublishService.ts` (from Milestone 04) — extend
  with three methods:
  - `publishDev(item, need)`: uploads the chosen local PNG to MinIO at
    `las-flores/<assetType>/<filename>` (the local filename is preserved
    as the object key). Writes the URL into the DB column
    `<field>_url`.
  - `promoteToStaging(item, need)`: copies the dev URL into the
    `<field>_url_staging` DB column. No new MinIO object is created.
  - `promoteToProduction(item, need)`: copies the dev URL into the
    `<field>_url_production` DB column. No new MinIO object is created.
  - `rollbackFromStaging(item, need)`: sets `<field>_url_staging` to NULL.

### New routes

- `server/src/routes/admin-content-asset.ts` (existing) — add three routes:
  - `POST /admin/content/asset/:entityType/:entityId/promote-staging` —
    calls `promoteToStaging` for the entity's primary asset.
  - `POST /admin/content/asset/:entityType/:entityId/promote-production` —
    calls `promoteToProduction`.
  - `POST /admin/content/asset/:entityType/:entityId/rollback` — calls
    `rollbackFromStaging` (sets the staging column to NULL).

### Database schema

- `characters` table — add `portrait_url_staging TEXT` and
  `portrait_url_production TEXT` columns.
- `scenes` table — same for `background_url_staging` and
  `background_url_production`.
- `locations` table — same for `image_url_staging` and
  `image_url_production`.
- The existing `portrait_url` column is repurposed to hold the **dev URL**
  (so the existing migration logic does not change). The new columns hold
  the staging and production URLs.

```sql
-- server/src/database/migrations/051_asset_stage_columns.sql
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS portrait_url_staging TEXT,
  ADD COLUMN IF NOT EXISTS portrait_url_production TEXT;
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS background_url_staging TEXT,
  ADD COLUMN IF NOT EXISTS background_url_production TEXT;
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS image_url_staging TEXT,
  ADD COLUMN IF NOT EXISTS image_url_production TEXT;
```

### Deploy pipeline

- The deploy script (`start-stack.sh` for dev, `docker-compose.prod.yml` for
  prod) does NOT need to change — MinIO has all three stages already after
  the publish/promote flow. The cascade is read by the client (Milestone 07).

### Admin UI

- `admin/src/app/asset-coverage/` — extend to show per-asset the current
  state of all three stages (dev/staging/production). Show timestamps for
  each stage.
- `admin/src/app/editor/` (or a new `admin/src/app/asset-promotion/`) — add
  a "Promote to Staging" and "Promote to Production" button per asset.

## Implementation outline

### The promotion service

```ts
// server/src/services/AssetPublishService.ts (additions)
export async function promoteToStaging(
  entity: { type: 'character' | 'scene' | 'location'; id: string; primaryAsset: { type: string; devUrl: string } },
): Promise<{ stagingUrl: string }> {
  // The dev URL is already pointing at the MinIO object. For staging, we
  // can either reuse the same URL (since the bytes are identical) or copy
  // to a new key. Per the user's revision, the cascade lives in the DB
  // columns, so we simply copy the dev URL into the staging column.
  // (If a future use-case requires a different staging image, this is
  // the place to upload different bytes.)
  const stagingUrl = entity.primaryAsset.devUrl;

  await queryOLTP(
    `UPDATE ${entity.type}s SET ${entity.primaryAsset.type}_url_staging = $1 WHERE id = $2`,
    [stagingUrl, entity.id]
  );

  return { stagingUrl };
}
```

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

**DB `<field>_url` family** — the **canonical selected asset**: the
MinIO URL(s) for the entity, written by the publish step (M04) and the
promotion flow (M06). Three columns per field:

- `<field>_url` — dev (set by M04 from the chosen local file).
- `<field>_url_staging` — staging (set by `promoteToStaging` in M06).
- `<field>_url_production` — production (set by `promoteToProduction`).

The client's `resolveAssetUrl()` (M07) reads from these DB columns, not
from the YAML. The YAML is local-authoring state; the DB is delivery state.

## Tests to add or update

- `server/tests/integration/asset-promotion.test.ts` — new file. End-to-end:
  1. Approve a plan with one character (publishes `.dev.png` to MinIO).
  2. Promote to staging (copies `.dev.png` to `.staging.png`).
  3. Promote to production (copies `.staging.png` to bare `.png`).
  4. Rollback from dev (deletes `.dev.png`, sets
     `AssetNeed.status='drafted'`).
  5. Verify the DB columns have the right values.
- `server/tests/unit/AssetPublishService.test.ts` — new file. Unit tests
  for the three promotion methods, mocking `uploadToMinio` and
  `downloadFromMinio`.

## Validation gate

1. After approving a plan, the MinIO bucket has one object per published
   asset (the chosen local PNG, with the original filename like
   `<slug>__default.png` (the historical default) or any other file the user picked).
2. The DB column `<field>_url` (e.g. `portrait_url`) holds the MinIO URL.
3. After clicking "Promote to Staging", the DB column
   `<field>_url_staging` is set to the same MinIO URL (cascade is
   recorded in the column, not the object key).
4. After clicking "Promote to Production", the DB column
   `<field>_url_production` is set to the same MinIO URL.
5. After clicking "Rollback from Staging", the
   `<field>_url_staging` column is set to NULL.
6. The promotion flow does not create new MinIO objects (no key copies).
7. `npm run lint --workspace=server` → 0 errors.
8. `npm run test --workspace=server` → all green.
9. `npm run build --workspace=server` → passes.

## Rollback plan

The new columns are additive (nullable, no default). The new service
methods are additive. The new admin page is additive. The promotion
flow is opt-in — users who don't click the promotion buttons continue
to see the dev URL in the client (Milestone 07's cascade picks dev
first anyway). Removing the promotion routes and pages reverts to
single-stage MinIO.
