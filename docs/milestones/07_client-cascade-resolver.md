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

- Milestone 06 (the `portrait_urls` JSONB array carries the three `label`-tagged stage entries).

## Files to change

### New client service

- `client/src/services/assetResolver.ts` — new file. Exports the
  `resolveAssetUrl()` function and the `STAGE_PRIORITY` table.

### Modified client call sites

The function replaces every direct `entity.portrait_urls[...].url` access in
the client. A grep finds all of them:

- `client/src/components/CharacterPortrait.ts`
- `client/src/components/SceneBackground.ts`
- `client/src/components/LocationImage.ts`
- `client/src/components/DialogueOverlay.ts`
- Any other component that reads an asset URL.

Each call site changes from:
```ts
const url = character.portrait_urls?.[0]?.url;
```
to:
```ts
const url = resolveAssetUrl(character.portrait_urls);
```

### Server side

No server-side change. The cascade is purely a client-side concern. The
server returns the entity with the `portrait_urls` (and `image_url` /
`background_url`) JSONB array populated; the client picks the right entry for
its environment by `label`.

## Implementation outline

### The resolver

```ts
// client/src/services/assetResolver.ts

type Env = 'development' | 'staging' | 'production';
type Stage = 'dev' | 'staging' | 'production';

const STAGE_PRIORITY: Record<Env, ReadonlyArray<Stage>> = {
  development: ['dev', 'staging', 'production'],
  staging:     ['dev', 'staging', 'production'],
  production:  ['production', 'staging', 'dev'],
};

// One entry in the entity's portrait_urls (or image_url / background_url) JSONB array.
interface AssetEntry {
  url: string;
  label?: Stage;
  expression?: string;
}

function getEnv(): Env {
  // Vite injects MODE; for production builds it's 'production'.
  // We treat 'test' and unknown as 'production' (safe default).
  const mode = import.meta.env.MODE;
  if (mode === 'development' || mode === 'staging') return mode;
  return 'production';
}

// Resolve the best URL for an asset from its portrait_urls (or image_url /
// background_url) JSONB array, by stage label and environment priority.
export function resolveAssetUrl(entries: AssetEntry[] | null | undefined): string | null {
  if (!entries || entries.length === 0) return null;
  const env = getEnv();

  for (const stage of STAGE_PRIORITY[env]) {
    const match = entries.find((e) => e.label === stage && typeof e.url === 'string' && e.url.length > 0);
    if (match) return match.url;
  }
  // Fallback: first entry with a usable URL (canonical).
  return entries.find((e) => typeof e.url === 'string' && e.url.length > 0)?.url ?? null;
}
```

### Helper for the badge (optional but recommended)

The user can see in dev/staging which stage is being served. Add a
companion function:

```ts
export function resolveAssetStage(entries: AssetEntry[] | null | undefined): { url: string; stage: Stage } | null {
  const env = getEnv();

  for (const stage of STAGE_PRIORITY[env]) {
    const match = entries?.find((e) => e.label === stage && typeof e.url === 'string' && e.url.length > 0);
    if (match) return { url: match.url, stage };
  }
  const first = entries?.find((e) => typeof e.url === 'string' && e.url.length > 0);
  return first ? { url: first.url, stage: (first.label as Stage) ?? 'dev' } : null;
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
`portrait_urls` JSONB array and its `label` entries are untouched by the
client resolver, so no server/DB change is needed to revert. The new function
can stay in place; only the call sites are reverted.
