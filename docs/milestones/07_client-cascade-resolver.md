# Milestone 07 — Client cascade resolver

## Goal

Add a single function in the game client that resolves any asset URL by
checking the three stages (dev, staging, production) in an
environment-dependent priority order:

- **In development and staging environments**, the priority is
  `dev → staging → production`. This lets the author and the QA team
  see the latest draft without affecting production.
- **In production**, the priority is `production → staging → dev`. This
  ensures live players always see the production asset, with staging as a
  fallback (e.g. for emergency rollbacks) and dev as a last resort.

The user specified: *"the selection change per environment: in local and
staging we try first dev, then staging then production, but in production
client the client always try to use production first, then staging, last
option dev. the would allow us to rollback or reject a dev asset"*.

## Pre-requisites

- Milestone 06 (the three MinIO stages and the DB columns exist).

## Files to change

### New client service

- `client/src/services/assetResolver.ts` — new file. Exports the
  `resolveAssetUrl()` function and the `STAGE_PRIORITY` table.

### Modified client call sites

The function replaces every direct `entity.portrait_url` access in the
client. A grep finds all of them:

- `client/src/components/CharacterPortrait.ts`
- `client/src/components/SceneBackground.ts`
- `client/src/components/LocationImage.ts`
- `client/src/components/DialogueOverlay.ts`
- Any other component that reads an asset URL.

Each call site changes from:
```ts
const url = character.portrait_url;
```
to:
```ts
const url = resolveAssetUrl(character, 'portrait_url');
```

### Server side

No server-side change. The cascade is purely a client-side concern. The
server returns the entity with all three URLs populated; the client picks
the right one for its environment.

## Implementation outline

### The resolver

```ts
// client/src/services/assetResolver.ts

type Env = 'development' | 'staging' | 'production';

const STAGE_PRIORITY: Record<Env, ReadonlyArray<'dev' | 'staging' | 'production'>> = {
  development: ['dev', 'staging', 'production'],
  staging:     ['dev', 'staging', 'production'],
  production:  ['production', 'staging', 'dev'],
};

// Map stage suffix to the DB column name suffix.
const COLUMN_SUFFIX: Record<'dev' | 'staging' | 'production', string> = {
  dev: '',             // <field> (existing column, e.g. portrait_url)
  staging: '_staging', // <field>_staging
  production: '_production',
};

interface AssetFields {
  portrait_url?: string | null;
  portrait_url_staging?: string | null;
  portrait_url_production?: string | null;
  background_url?: string | null;
  background_url_staging?: string | null;
  background_url_production?: string | null;
  image_url?: string | null;
  image_url_staging?: string | null;
  image_url_production?: string | null;
}

function getEnv(): Env {
  // Vite injects MODE; for production builds it's 'production'.
  // We treat 'test' and unknown as 'production' (safe default).
  const mode = import.meta.env.MODE;
  if (mode === 'development' || mode === 'staging') return mode;
  return 'production';
}

export function resolveAssetUrl<T extends AssetFields>(
  entity: T,
  field: 'portrait_url' | 'background_url' | 'image_url',
): string | null {
  const env = getEnv();
  const priority = STAGE_PRIORITY[env];

  for (const stage of priority) {
    const columnName = (field + COLUMN_SUFFIX[stage]) as keyof T;
    const url = entity[columnName];
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return null;
}
```

### Helper for the badge (optional but recommended)

The user can see in dev/staging which stage is being served. Add a
companion function:

```ts
export function resolveAssetStage<T extends AssetFields>(
  entity: T,
  field: 'portrait_url' | 'background_url' | 'image_url',
): { url: string; stage: 'dev' | 'staging' | 'production' } | null {
  const env = getEnv();
  const priority = STAGE_PRIORITY[env];

  for (const stage of priority) {
    const columnName = (field + COLUMN_SUFFIX[stage]) as keyof T;
    const url = entity[columnName];
    if (typeof url === 'string' && url.length > 0) {
      return { url, stage };
    }
  }
  return null;
}
```

The client can then render a small badge like `[dev]` in the corner of
the portrait during dev/staging so QA knows which stage is active.

### The call-site migration

A codemod-style script makes this mechanical:

```ts
// scripts/migrate-client-asset-calls.ts (run once, then deleted)
import fs from 'node:fs/promises';
import { glob } from 'glob';

const files = await glob('client/src/**/*.{ts,tsx}');

for (const file of files) {
  const src = await fs.readFile(file, 'utf-8');
  // Replace direct <entity>.<field> reads with resolveAssetUrl(<entity>, '<field>')
  // Be conservative: only replace when the read is used as a string assignment or JSX src.
  // Hand-verify the diff before committing.
  // ...
}
```

In practice, with ~10 call sites, it's faster to do this by hand with
ripgrep.

## Tests to add or update

- `client/src/services/__tests__/assetResolver.test.ts` — new file.
  - Test that in `development` env, dev URL wins.
  - Test that in `production` env, production URL wins.
  - Test that in `staging` env, dev URL wins (per user spec).
  - Test that when dev URL is empty, staging URL is used.
  - Test that when both dev and staging are empty, production URL is used.
  - Test that when all are empty, returns `null`.
- `client/src/components/__tests__/CharacterPortrait.test.ts` — update
  to use the new resolver (the test mocks the entity, not the resolver).

## Validation gate

1. In a development build, the character portrait serves the dev URL when
   it exists; the staging URL when dev is empty; the production URL when
   both are empty.
2. In a production build, the character portrait serves the production URL
   when it exists; the staging URL when production is empty; the dev URL
   when both are empty.
3. The badge (if enabled) shows the correct stage.
4. `npm run lint --workspace=client` → 0 errors.
5. `npm run test --workspace=client` → all green.
6. `npm run build --workspace=client` → passes.

## Rollback plan

The new file is additive. The call-site changes are mechanical. Reverting
the call-site commits restores the previous direct-access behavior. The
DB columns are additive and unused, so the production deployment does not
need to be reverted. The new function and the new columns can stay in
place; only the call sites are reverted.
