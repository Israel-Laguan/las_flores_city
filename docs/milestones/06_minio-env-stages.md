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

## Status

> **Status: COMPLETE — promotion methods, routes, and admin UI implemented.**

- The `label: 'dev'` entry is produced by Milestone 04's `publishChosenDrafts`.
- `promoteToStaging`, `promoteToProduction`, and `rollbackFromStaging` are
  implemented in `AssetPublishService.ts`.
- Promotion routes are added to `admin-content-asset.ts`:
  - `GET /admin/content/assets/promotion-status`
  - `POST /admin/content/assets/promote-staging`
  - `POST /admin/content/assets/promote-production`
  - `POST /admin/content/assets/rollback-staging`
- Admin UI page `/asset-promotion` lists all characters with their three
  stages and provides Promote/Rollback buttons.
- Nav link added to `AdminNav.tsx`.

> **Design decision (resolved 2026-07-16):** The promotion entries are
> written to the **YAML** `portrait_urls` array (YAML-only). This makes
> `upsertCharacter`'s overwrite behavior correct (it carries the full YAML
> array, including promoted labels, to the DB on re-migration). No DB-only
> entries that would be lost on re-migration. The route shape uses
> `contentPath` in the request body instead of `:entityType/:entityId` path
> params, consistent with the existing `POST /assign-asset` route.

> **Scope note:** Only `characters` are supported today. Scenes/locations do
> not have a `portrait_urls` JSONB column (they use `image_url`/`background_url`
> TEXT). Promotion for those types is deferred pending schema confirmation.

## Pre-requisites

- Milestone 04 (the publish step already uploads to MinIO and writes the
  `dev` entry; this milestone adds the promotion workflow).

## Files changed

### Service

- `server/src/services/AssetPublishService.ts` — extended with:
  - `promoteToStaging(contentPath, opts?)`
  - `promoteToProduction(contentPath, opts?)`
  - `rollbackFromStaging(contentPath)`
  - `listPromotionStatus()`
  - Helper types: `PromotionResult`, `RollbackResult`, `EntityPromotionStatus`

### Routes

- `server/src/routes/admin-content-asset.ts` — added four promotion routes
  under the existing `/admin/content` mount point.

### Admin UI

- `admin/src/app/asset-promotion/page.tsx` — new page
- `admin/src/app/asset-promotion/hooks/useAssetPromotion.ts` — fetch + mutate hook
- `admin/src/app/asset-promotion/components/PromotionRow.tsx` — per-row render
- `admin/src/app/asset-promotion/asset-promotion.module.css` — styles
- `admin/src/components/AdminNav.tsx` — added "Promote" nav link

### Tests

- `server/tests/unit/AssetPublishService.test.ts` — 8 new promotion unit tests
- `server/tests/integration/asset-promotion.test.ts` — 5 new integration tests

## Implementation outline

### Promotion service

```ts
// server/src/services/AssetPublishService.ts
export async function promoteToStaging(
  contentPath: string,
  opts?: { newBuffer?: Buffer; filename?: string },
): Promise<PromotionResult> { ... }

export async function promoteToProduction(
  contentPath: string,
  opts?: { newBuffer?: Buffer; filename?: string },
): Promise<PromotionResult> { ... }

export async function rollbackFromStaging(contentPath: string): Promise<RollbackResult> { ... }

export async function listPromotionStatus(): Promise<EntityPromotionStatus[]> { ... }
```

Promotion reads the YAML, finds the `label:'dev'` entry, and by default
reuses its URL. It removes any existing entry with the same target label,
then appends the new one. `rollbackFromStaging` filters out the `staging`
entry. `listPromotionStatus` scans `content/characters/*/` for YAML files.

### Routes

- `GET /admin/content/assets/promotion-status` — returns array of
  `{ contentPath, name, slug, stages }`.
- `POST /admin/content/assets/promote-staging` — body `{ contentPath }`.
- `POST /admin/content/assets/promote-production` — body `{ contentPath }`.
- `POST /admin/content/assets/rollback-staging` — body `{ contentPath }`.

All reuse `validateContentPath` and `authAndAdminMiddleware`.

### Admin UI

`/asset-promotion` lists characters in a table with columns:
- Character name
- Dev badge (green)
- Staging badge (yellow) or "Promote to Staging" button
- Production badge (blue) or "Promote to Production" button
- Rollback button (red, only when staging exists)

## Tests

- `server/tests/unit/AssetPublishService.test.ts` — 8 promotion tests:
  1. promoteToStaging reuses dev URL and appends label:staging
  2. promoteToProduction appends label:production
  3. rollbackFromStaging removes staging entry
  4. idempotent re-promote replaces existing entry
  5. throws without dev entry
  6. listPromotionStatus scans and returns stage maps
  7. rollback returns removed:false when no staging
  8. (existing M04 tests unchanged)

- `server/tests/integration/asset-promotion.test.ts` — 5 end-to-end route tests:
  1. GET /promotion-status returns Diego with dev stage
  2. POST /promote-staging adds staging entry
  3. POST /promote-production adds production entry
  4. POST /rollback-staging removes staging entry
  5. POST /promote-staging returns 400 without dev entry

## Validation gate

1. After approving a plan, the MinIO bucket has one object per published asset. ✅
2. The DB `characters.portrait_urls` JSONB has a `label: 'dev'` entry. ✅ (via M04)
3. After clicking "Promote to Staging", `portrait_urls` has a `label: 'staging'` entry. ✅
4. After clicking "Promote to Production", `portrait_urls` has a `label: 'production'` entry. ✅
5. After clicking "Rollback from Staging", the `label: 'staging'` entry is removed. ✅
6. The promotion flow does NOT create new MinIO objects unless different bytes are supplied. ✅
7. `npm run lint --workspace=server` → 0 errors. ✅
8. `npm run test --workspace=server` → targeted tests all green (40/40). ✅
9. `npm run build --workspace=server` → passes. ✅
10. `npm run lint --workspace=admin` and `npm run build --workspace=admin` → pass. ✅

## Rollback plan

No DB columns are added. The new service methods, routes, and admin page are
additive. Removing them reverts to single-stage MinIO; the `portrait_urls`
array and its `dev` entries remain intact. To fully revert, also remove the
`label: 'staging'` / `label: 'production'` entries from any YAML files that
received them.
