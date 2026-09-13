# M53 — Client Integration & Content Consumption Verification

> **Status:** Proposed
> **Owner:** client / narrative systems
> **Predecessor:** M52

## Goal

Verify and, where needed, fix the game client's integration with the intake-
worker-backed API and the newly materialized content. The client should be
able to start, authenticate, and consume game data from a freshly migrated
database without relying on stale assumptions.

## Scope

Targets client API wrapper, Vite proxy, and game-server route compatibility.

### In scope

- Audit `client/src/utils/api.ts` against current `server/src/routes/gameRoutes.ts`
  and intake-worker routes to ensure endpoints match.
- Audit Vite proxy config (`client/vite.config.ts`) against actual server ports
  (`3000` game, `3001` intake-worker).
- Add client-side smoke tests for:
  - health/version fetch
  - player state load
  - location/map fetch
  - dialogue start/choice/advance
  - settings read/write
- Add server-side contract tests for game routes that exercise real DB reads
  against a migrated database.
- Fix any mismatches found (endpoint paths, auth headers, response shapes).
- Update `docs/ARCHITECTURE_RUNTIME.md` and `docs/DEVELOPMENT_SETUP.md` with
  the verified startup sequence.

### Out of scope

- New gameplay features
- Content authoring or migration changes
- Admin UI changes

## Acceptance criteria

1. Client can start and log in against a migrated database.
2. Client can load map, location, dialogue, and player state from the API.
3. Client tests pass: `npm run test:client:e2e`.
4. Server game-route contract tests pass.
5. `npm run build --workspace=client` succeeds.

## Verification checklist

- [ ] Client e2e smoke tests pass
- [ ] Server contract tests pass
- [ ] `npm run lint --workspace=client`
- [ ] `npm run typecheck --workspace=client`
- [ ] `npm run build --workspace=client`
- [ ] Manual smoke test: start client, verify login and dialogue flow

## Estimated file changes

20–30 files. Mostly client test files, API wrapper adjustments, and docs.
Mechanical endpoint/port mismatches may require more changes, but should stay
under 300 if discovered early.
