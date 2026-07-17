# Milestone 07 — Server-side env-aware asset cascade resolver

> **Rewritten 2026-07-17.** The original draft assumed the game client received
> the raw `portrait_urls` JSONB array and picked an entry. That premise was
> false: the server is the sole mediator and already flattens every asset into
> a single resolved string (`portraitUrl`, `backgroundUrl`) before it reaches
> the client (see `shared/src/schemas/api-response.ts:22,29` and
> `server/src/routes/location.npcs.ts:133` `selectPortraitUrl`). This milestone
> therefore makes the cascade a **server-side** concern and leaves the client
> stage-unaware, consistent with the established content-layering contract.

## Goal

Add a single server-side resolver that, given an asset's stage-tagged entries
(`dev` / `staging` / `production`), returns the best URL for the current
environment using this priority order (per the user's spec):

- **In development and staging environments:** `dev → staging → production`.
  The author and QA see the latest draft without affecting production.
- **In production:** `production → staging → dev`. Live players always see the
  production asset, with staging as a fallback (for emergency rollbacks) and
  dev as a last resort.

The user specified: *"in production we ask for prod first, then staging, then
 dev, but for the other envs is dev then staging then production."* The client
only ever sees the single resolved URL the server picks — it never sees the
stage array.

This milestone also **extends the cascade model to scenes and locations**.
Today only `characters` carry a `portrait_urls` JSONB array; `scenes` and
`locations` use single TEXT columns (`background_url`, `image_url`) with no
array to cascade over. Per the resolved design decision, we add parallel JSONB
arrays (`scenes.background_urls`, `locations.image_urls`) alongside the existing
TEXT columns and let the same resolver cascade over them.

## Pre-requisites

- Milestone 06 (the `portrait_urls` JSONB array carries `dev`/`staging`/
  `production` `label`-tagged entries for **characters**, and the promotion
  service + admin page are in place).
- Milestone 06's deferred scenes/locations scope is closed here, not in M06.

## What is NOT changing

- **The API contract stays single-string.** `ScenePayloadResponseSchema.scene
  .backgroundUrl` and `.npcs[].portraitUrl` remain `z.string()`. No client
  schema change, no `api-contract` test breakage. The client (Phaser) keeps
  reading `payload.scene.backgroundUrl` / `npc.portraitUrl` directly.
- **No new client file.** The original draft's `client/src/services/assetResolver.ts`
  and the "call-site migration" over `CharacterPortrait.ts` / `SceneBackground.ts`
  / `LocationImage.ts` / `DialogueOverlay.ts` are dropped — those files do not
  exist and the client never reads the stage array.
- **Mood/expression selection is preserved as a secondary concern.** The
  existing `selectPortraitUrl` mood-match logic still runs; stage priority is
  applied first to pick *which entries are eligible*, then mood/expression
  picks among them.

## Files to change

### New migration

- `server/src/database/migrations/051_scene_location_asset_cascade.sql` — new.
  Adds the JSONB arrays that mirror the characters `portrait_urls` model:

```sql
-- Scenes: cascade array for the background image.
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS background_urls JSONB;

-- Locations are modeled as rows in the scenes table (migration 001,
-- "Scenes/Locations table"). The parallel JSONB array for location
-- images also lives on scenes:
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS image_urls JSONB;
```

The existing single TEXT columns (`scenes.background_url`,
`locations.image_url`, `locations.background_url`) are kept as the legacy /
fallback field. The resolver prefers the JSONB array when present and falls
back to the TEXT column when the array is empty or missing — so existing rows
keep working with zero backfill.

### Shared schemas

- `shared/src/schemas/yaml-content.ts`
  - `YAMLSceneSchema`: add
    `background_urls: z.array(AssetEntrySchema).optional()` (same shape as
    `portrait_urls`: `{ url, label?, expression? }`).
  - `YAMLLocationSchema`: add `image_urls: z.array(AssetEntrySchema).optional()`.
  - Factor the entry shape into a shared `AssetEntrySchema` so `portrait_urls`,
    `background_urls`, and `image_urls` all use one definition.

### Content migration

- `server/src/content/upsert.ts` — carry the new `background_urls` /
  `image_urls` arrays from YAML to the DB row on scene/location upsert (same
  pattern already used for `characters.portrait_urls`).
- `server/src/content/validate.ts` — validate the new arrays (same checks as
  `portrait_urls`: each entry has a non-empty `url`, optional `label`).

### New server resolver service

- `server/src/services/AssetStageResolver.ts` — new file. Exports:
  - `STAGE_PRIORITY: Record<Env, ReadonlyArray<Stage>>`
  - `getEnv(): Env` — reads `process.env.NODE_ENV` (`'development'` /
    `'staging'` → those envs; anything else, including `'production'` and
    unset, → `'production'`).
  - `resolveAssetUrl(entries, opts?)` — the cascade. Returns the best `url`
    string (or `null`).
  - `resolveAssetStage(entries, opts?)` — companion that returns
    `{ url, stage }` (used by admin/coverage views and tests; not shipped to
    the game client).

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

// Resolve the best URL for an asset from its stage-tagged entries.
// `expression` narrows eligible entries by mood before stage priority is
// applied (preserves the existing mood-match behavior).
export function resolveAssetUrl(
  entries: AssetEntry[] | null | undefined,
  opts?: { expression?: string },
): string | null {
  if (!entries || entries.length === 0) return null;
  const env = getEnv();
  const eligible = opts?.expression
    ? entries.filter(e => (e.expression || '').toLowerCase() === opts.expression!.toLowerCase())
    : entries;
  // If the expression filter emptied the set, fall back to all entries.
  const pool = eligible.length > 0 ? eligible : entries;

  for (const stage of STAGE_PRIORITY[env]) {
    const match = pool.find(e => e.label === stage && typeof e.url === 'string' && e.url.length > 0);
    if (match) return match.url;
  }
  // Fallback: first entry with a usable URL (canonical).
  return pool.find(e => typeof e.url === 'string' && e.url.length > 0)?.url ?? null;
}
```

### Modified server call sites

- `server/src/routes/location.npcs.ts` — `selectPortraitUrl` (lines 133-166).
  Replace the ad-hoc mood/label/first logic with a call to the resolver. The
  resolver applies stage priority first, with `expression` narrowing the pool.
  The convention-path fallback (`${portraitBasePath(characterName)}/${mood}.png`)
  stays as the final fallback when the array yields nothing.

  ```ts
  // server/src/routes/location.npcs.ts
  import { resolveAssetUrl } from '../services/AssetStageResolver.js';

  export function selectPortraitUrl(
    portraitUrls: any[] | string | null | undefined,
    mood: string,
    characterName: string
  ): string {
    const urls = parsePortraitUrls(portraitUrls, characterName); // existing parse logic
    const resolved = resolveAssetUrl(urls, { expression: mood });
    if (resolved) return resolved;
    // Convention-based path (unchanged final fallback).
    return `${portraitBasePath(characterName)}/${mood}.png`;
  }
  ```

- `server/src/routes/location.ts` (line 44) — resolve the scene background via
  the cascade over `background_urls`, falling back to the legacy
  `background_url` TEXT column, then the static default:

  ```ts
  // server/src/routes/location.ts
  import { resolveAssetUrl } from '../services/AssetStageResolver.js';

  // inside the scene fetch (add background_urls to the SELECT column list):
  const fromCascade = resolveAssetUrl(row.background_urls);
  sceneData = {
    id: row.id,
    title: row.name,
    backgroundUrl:
      fromCascade
      || row.background_url
      || '/assets/scenes/default/background.png',
    ambientSoundUrl: row.ambient_sound_url || null,
    mood: row.mood || 'neutral',
  };
  ```

### Generalize promotion to scenes/locations (M06 follow-up)

- `server/src/services/AssetPublishService.ts` — `promoteStage` /
  `rollbackFromStaging` / `listPromotionStatus` currently hardcode
  `portrait_urls` and scan only `content/characters/`. Generalize:
  - Accept a `field` parameter (`'portrait_urls' | 'background_urls' |
    'image_urls'`) chosen from the YAML's content type (character →
    `portrait_urls`, scene → `background_urls`, location → `image_urls`).
  - `listPromotionStatus` scans `content/characters/`, `content/scenes/`, and
    `content/locations/` and returns per-entity stage maps for the relevant
    field. The admin page (M06) already renders a generic stage table, so it
    gains scene/location rows for free once the service returns them.

## Tests to add or update

### Unit

- `server/tests/unit/AssetStageResolver.test.ts` — new file.
  1. In `NODE_ENV=development`, dev URL wins over staging/production.
  2. In `NODE_ENV=production`, production URL wins over staging/dev.
  3. In `NODE_ENV=staging`, dev URL wins (per user spec).
  4. When dev entry is missing, staging URL is used (dev env).
  5. When dev and staging are missing, production URL is used (dev env).
  6. When all stage entries are missing, returns `null`.
  7. `expression` filter narrows the pool before stage priority; if no entry
     matches the expression, falls back to all entries.
  8. `getEnv()` maps unset/`'production'` → `'production'`,
     `'development'`/`'staging'` → themselves.
- `server/tests/unit/AssetPublishService.test.ts` — extend the existing
  promotion tests with scene (`background_urls`) and location (`image_urls`)
  content paths, asserting the right field is read/written per content type.

### Integration

- `server/tests/integration/asset-cascade.test.ts` — new file.
  1. A character with `dev`/`staging`/`production` entries returns the dev URL
     in a development-env request to `/api/scene/:id`.
  2. With `NODE_ENV=production`, the same character returns the production URL.
  3. A scene with `background_urls` entries returns the env-appropriate
     `backgroundUrl`; a scene with only the legacy `background_url` TEXT still
     resolves (back-compat).
  4. The `api-contract` test (`server/tests/integration/api-contract.test.ts`)
     still passes unchanged — `portraitUrl` and `backgroundUrl` remain single
     strings.

## Validation gate

1. `NODE_ENV=development`: a character with all three stage entries serves
   the `dev` URL; with dev removed, serves staging; with dev+staging removed,
   serves production.
2. `NODE_ENV=production`: the same character serves the `production` URL; with
   production removed, serves staging; with production+staging removed, serves
   dev.
3. A scene with `background_urls` cascades the same way; a scene with only the
   legacy `background_url` TEXT still renders (back-compat, no backfill
   required). A location (scene) with `image_urls` entries returns the
   env-appropriate `image_url` in the `GET /api/location/` list endpoint; a
   location with only the legacy `image_url` TEXT still works (back-compat).
4. The client build is **untouched** — `npm run build --workspace=client` is
   a no-op for this milestone (no client file is added or changed).
5. `npm run lint --workspace=server` → 0 errors.
6. `npm run test --workspace=server` → all green (existing tests + new
   resolver/cascade tests).
7. `npm run build --workspace=server` → passes.
8. `npm run validate:content` → passes (new YAML arrays validate).
9. After server changes: `docker compose build server && docker compose up -d
   server`, then verify with
   `docker exec las-flores-server wget -qO- http://localhost:3000/health`
   → `{"success":true}`.

## Rollback plan

- The migration is additive (`ADD COLUMN IF NOT EXISTS`); dropping the two
  JSONB columns reverts the schema. Existing TEXT columns and rows are
  untouched.
- `AssetStageResolver.ts` is a new file; deleting it and restoring the old
  `selectPortraitUrl` body + the `location.ts` line 44 one-liner reverts the
  resolution behavior. The `portrait_urls` labels written by M06 stay intact.
- The generalized promotion paths revert by re-narrowing
  `AssetPublishService` to `portrait_urls` / `content/characters/` only.
- No client revert is needed (the client was not modified).
