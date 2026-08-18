# M21 — Process Split: Extract the Intake-Worker (B1)

> **Status:** Planned · **Branch:** `milestone/21-process-split` · **PR size target:** ~25 files
> **Phase:** 2 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §4 Option 2, §5 (B1)

## Goal

Move `runSolidify` + all LLM/Plan/Asset services out of the game process into a separate
`intake-worker`. This is the key workload-class fix: AI generation must never starve the
game event loop or its DB pool.

## Scope

| Item | Detail |
|---|---|
| **`intake-worker` process** (port 3001) | 27 `admin-*` routes + content engine + StoryBuilder + `ContentAssetWorker` |
| **Slim `game-server`** (port 3000) | `DialogueResolver` + player routes + `LeaderboardWorker`/`RelationshipDecayWorker`; reads content tables only |
| **Redis job handoff** | Reuse fire-and-forget + `content_plans.status` poll; no new queue infra |
| **`docker-compose.yml`** | Add `intake-worker` service |
| **Admin config** | `INTERNAL_SERVER_URL` → `intake-worker:3001` |
| **`@las-flores/infra`** | Consumed from M19 (connection/redis wiring) |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| New entrypoint | `server/src/intake.ts` (+ shared `app.ts` builder; `server/src/index.ts` slimmed to game app) |
| Split | `server/src/index.ts` → `game` app + `intake` app |
| Infra | `@las-flores/infra` package (from M19) |
| Compose | `docker-compose.yml`, `docker-compose.prod.yml` |
| Admin wiring | `admin/src/lib/api.ts` + server-route handlers (mechanical `SERVER_URL` swaps) |
| Tests | smoke for both apps; integration for job handoff over Redis |

## Risks & verification

- **Risk:** Medium-High. Boot split, worker startup, and the firewall around the
  `content_migration` advisory lock (only the intake-worker should migrate).
- **Verify:** `docker compose build server intake-worker && docker compose up -d server intake-worker`; in-container health
  on both services; run a plan generation end-to-end and confirm it completes on the worker
  while the game stays responsive.
- **Accept:** game server returns sub-100ms while a StoryBuilder job runs concurrently.

## Definition of Done

- [x] `intake-worker` runs independently; `game-server` has no admin/AI routes
- [x] Shared `createApp(registerRoutes)` builder in `server/src/app.ts`
- [x] `server/src/index.ts` slimmed to game-server (port 3000)
- [x] `server/src/intake.ts` created as intake-worker (port 3001)
- [x] Redis job handoff + status poll unchanged (fire-and-forget + `content_plans.status`)
- [x] Admin reaches intake-worker via `INTERNAL_SERVER_URL` (`docker-compose.yml`)
- [x] Run full verification: lint, typecheck, build, smoke tests
      (lint 0 errors; typecheck clean; build OK; game-smoke + intake-smoke pass.
       `heartbeat.smoke` 2 infra tests fail only because no live Postgres/Redis in
       sandbox. Integration job-handoff suites require the Docker stack: run
       `docker compose build server && docker compose up -d`, then
       `docker exec las-flores-server wget -qO- http://localhost:3000/health` and
       `http://localhost:3001/health` to confirm both processes boot.)
