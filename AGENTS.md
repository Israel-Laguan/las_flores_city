# Agent Guidelines

This file captures durable agent-facing guidance for Las Flores 2077. Human-facing project docs remain in `README.md` and `docs/`.

## Hard constraints

- Use the existing database/cache/event patterns: `oltpPool` / `withOLTPTransaction`, `getCache` / `setCache` / `deleteCache`, and `queryOLAP(...)`. Do not introduce new pools or alternate cache layers. The only sanctioned exception is a single additional **read-only** content pool (`contentPool` / `queryContent`, defined in `@las-flores/infra`) used exclusively for content reads (dialogue trees/overlays/chunks, scenes, characters, districts, mysteries); all player reads AND writes still go through `oltpPool` / `withOLTPTransaction`. Do not add further pools or cache layers beyond these two.
- If a task spec conflicts with established codebase patterns, follow the established pattern and surface the drift before changing behavior.
- Verify alleged missing variables by reading the relevant file end-to-end or grepping before scheduling a fix.
- Sudo operations require user confirmation. Present the exact command, explain the expected result, wait for the user to confirm it ran, then verify the fix.
- Test fixtures that create rows must use a dedicated UUID or `gen_random_uuid()`, clean up in `afterAll`, and include a collision-avoidance comment.
- Integration tests that touch `player_mysteries` must create their own test user in `beforeAll` and clean it up in `afterAll`.
- After server code changes, rebuild and restart the server container: `docker compose build server && docker compose up -d server`. Verify with `docker exec las-flores-server wget -qO- http://localhost:3000/health` (not curl — see health check gotcha below).

## Current codebase facts

- **Content uses per-folder layout**: Every entity (character, scene, location, overlay, mission) has its own folder under `content/<type>/<slug>/`. Each folder contains: `<prefix><slug>.yaml`, `<slug>.md` (lore), `<slug>.prompt.md` (image prompt), and `assets/` (flat directory with `<slug>__default.png` and other drafts). The `assets/` folder is flat — no sub-folders.
- **YAML paths are relative to the YAML's directory**: `lore_path: <slug>.md`, `narrative_path: <slug>.md`, `asset_paths.portrait: <slug>__default.png`. The old `docs/lore/figures/<slug>/<slug>.md` paths are no longer used.
- **Content layering contract**: `content/` = dev-mode file database (data only) · `docs/lore/` = world-level research · `scripts/` = file-to-file tools (never touch DB) · `shared/` = schema contract · `server/` = sole mediator. Scripts produce files, not DB rows.
- Content migration now recognizes `/mysteries/` as a content type: `server/src/content/migrate.ts:87` and `server/src/content/validate.ts:193`.
- Dialogue overlays are stored with both `modifications` and `nodes`; `upsertDialogueOverlay()` writes both columns: `server/src/content/migrate.ts:148-178`.
- The resolver reads `dialogue_overlays.nodes` for mystery overlays: `server/src/services/DialogueResolver.ts:146-160`.
- Mystery overlay YAML should follow `OverlaySchema` with `nodes`: `shared/src/schemas/overlay.ts:14-38`.
- `player_dialogue_states` tracks position with `current_node_id`; `users.active_dialogue_id` tracks the active tree.
- The shared UI workspace `@las-flores/ui` is the single source of truth for design tokens, theme variables, base CSS, and reusable component classes. Admin imports `tokens.css` + `global.css` + `components.css` from there; the game `client` imports only `themes.css`. The two theme namespaces (`--accent`/`--background` in `tokens.css` vs `--color-*` in `themes.css`) are deliberately separate — do NOT "unify" them in a single PR. Thin React wrappers (`Button`, `Input`, `Card`, `Badge`) are also exported from `@las-flores/ui` as opt-in conveniences that apply the same global classes — the CSS contract is the source of truth. Full contract: [docs/UI_STYLE_SYSTEM.md](docs/UI_STYLE_SYSTEM.md).
- OLAP `player_events` uses `event_data`, `created_at`, and `time_blocks_cost`. Do not use `data`, `occurred_at`, or `event_data->>'tb_cost'`.
- `mysteries.status` has a CHECK constraint for `ACTIVE`, `RESOLVING`, and `ARCHIVED`; adding a new status requires rewriting the CHECK constraint: `server/src/database/migrations/021_leaderboards.sql:49-53`.

## Content workflow

- **Audit**: `npm run content:audit` — scans all entity folders and reports per-type completeness (YAML, `.md`, `.prompt.md`, `assets/`). Exits non-zero if required files are missing.
- **Verify**: `node scripts/asset-pipeline/scripts/verify-assets.mjs` — checks that referenced asset URLs exist in MinIO.
- **Backup**: `bash scripts/backup-content-assets.sh` — tarball backup of `content/**/assets/` before destructive operations.
- **Docker**: `docker compose down --volumes` destroys named volumes. MinIO uses a host-bind mount (`.minio-data/`) so it survives, but always run the backup script first.
- **Asset publish workflow**: Local `content/**/assets/` is the staging area, not canonical. `asset_paths.portrait` = relative filename (`<slug>__default.png`); `portrait_urls` = published MinIO URL. The authoring loop: (1) generate images into `assets/`, (2) pick the best as `<slug>__default.png`, (3) run `AssetPublishService` which uploads to MinIO and writes `portrait_urls`/`background_urls` back to YAML + DB. `LocalDraftService.ts` sorts `__default.png` first when listing assets.
- **Asset expressions & variants**: See [docs/ASSET_EXPRESSION_VOCABULARY.md](docs/ASSET_EXPRESSION_VOCABULARY.md) for the expression vocabulary, file naming (`<slug>__<expression>.png`), and the `portrait_urls[]` / `background_urls[]` `expression` tag convention. Assets/folders are flat — no sub-folders. Expression variants are referenced by an `expression` tag on an `AssetEntry`; the `default` entry is the fallback and may omit the tag. Scene `background_urls[]` entries use environment tags (`night`, `rain`, `sunset`); the VN layer resolves them via `resolveBackgroundUrl(visualBackground, sceneBackground, hints, backgroundUrls)` where `hints` is an **ordered** environment chain from `buildBackgroundHints(timeOfDay, weather?, mood?)` (`client/src/utils/resolvePortraitUrl.ts`). The game-state source is the real in-game clock: `phoneStore.timeBlocks → getTimeOfDay()` (`client/src/utils/time.ts`, `day`/`sunset`-for-dusk/`night` tags). Precedence: explicit `visual.background` (node authoring) > weather > time-of-day > `visual.mood` (soft) > default variant > scene backdrop. `weather` is a forward-compatible hook with no live source yet (callers pass `undefined`).

## OLAP and leaderboard rules

- For "sum metric per user" leaderboard queries, use one bulk OLAP query grouped by `user_id` and merge results in Node.
- OLAP seed events for mystery windows must fall inside the solver window. Use the mystery start time plus a stable offset, not `NOW() - INTERVAL`.
- If a no-filter probe returns the expected `tb_spent` but the worker returns `0`, suspect seed timing before changing worker logic.
- Use a 2-minute grace period for workers that read OLAP telemetry after an OLTP deadline expires.

## Known operational gotchas

- Docker proxy processes on a shared host can keep stale `-container-ip` cmdline values. `docker compose restart` is not enough; use `docker compose down && docker compose up -d` or kill the stale proxy and restart the container.
- If a host port mapping looks wrong, prefer service names in `.env` database URLs, such as `postgres-oltp:5432`, to bypass host proxy state.
- **Stuck port cleanup**: When containers fail to start due to "address already in use", stale docker-proxy processes may hold ports without responding. Kill them with `pkill -9 docker-proxy` or specific PIDs, then run `docker compose down && docker compose up -d server`.
- When destroying stale containers, also check for orphaned host Postgres/Redis processes with `ps aux | grep -E 'postgres|redis-server'` and kill them if needed (`sudo pkill -9 -u postgres` / `sudo pkill -9 redis-server`).
- `server/scripts/probe_leaderboard.ts` is the canonical diagnostic for distinguishing bad connection paths from bad leaderboard data.
- When a spec says "add column", first verify the table with `\d <table>` or migrations; several columns in this project pre-existed.
- **Health check from host may silently fail (curl exit 56)**: The server image (node:18-alpine) does not include `curl`, and stale docker-proxy state on a shared host can cause `curl http://localhost:3000/health` from the host to return exit code 56 (failure to receive data) even when the container is healthy. Always verify health from *inside* the container using `wget`: `docker exec las-flores-server wget -qO- http://localhost:3000/health`. A `{"success":true}` response from that command is the authoritative health check. Do not treat host-side curl exit 56 as a server failure without first confirming with the in-container wget.
- **Admin panel fails to fetch data**: If the admin dashboard shows loading but never loads data, check that `NEXT_PUBLIC_SERVER_URL=http://localhost:3000` and `INTERNAL_SERVER_URL=http://las-flores-server:3000` are set in the admin container. The browser needs `localhost:3000` to reach the server (host port mapping), while server-side route handlers need `las-flores-server:3000` to reach the server (container network). Verify with: `podman exec las-flores-admin env | grep SERVER_URL`.
- **Stale Jest cache can mask real test results**: A stale `ts-jest` cache can make previously-passing suites report spurious "Test suite failed to run" TypeScript parse errors (e.g. `Unexpected token, expected "from"` at an `import type` line, or `Missing semicolon` at a `let x: T;` annotation) for suites that are actually fine, while hiding genuine assertion failures in other suites. The cache lives outside the repo at `/tmp/jest_rs` (set by `cacheDirectory`); it is NOT cleared by normal edits and survives across `git` operations. Before trusting a server test run, clear it with `npx --no-install jest --workspace=server --clearCache`, then re-run. If you must pass `--no-cache` to a focused `ts-jest` ESM run, be aware it can *re-trigger* the same spurious parse errors for some suites — prefer `--clearCache` + a normal (cached) run for a trustworthy result. After a clean cache, expect the real failure count (e.g. only the suites actually exercising changed code plus any genuine test-isolation bugs), not the inflated "failed to run" count from the stale cache.

- **Boot-aborting seed calls silently kill the server**: `initializeServer()` calls startup routines sequentially *before* `app.listen()`. A routine that throws/rejects (e.g. `seedPlayers()` when `NODE_ENV` is unset or `production`) is swallowed by the top-level `initializeServer().catch(console.error)`, so the process stays alive but **never binds the port** — `/health` returns "connection refused" with no crash in the logs. The rule: any dev-only startup routine invoked in `initializeServer()` must be non-fatal (try/catch with a warning log) so it can only ever *skip*, never abort boot; the explicit CLI (`npm run seed:players`) may still reject and `process.exit(1)` to protect the "no-seed-in-production" intent. When `/health` refuses while logs show migrations + Redis succeeding, look for any startup await before `app.listen`. See `.kilo/BLOCKER.md` for the resolved case.

- **Client e2e About Us failures are a missing `VITE_` env var, not a bug**: The MainMenu "ABOUT US" button (`client/src/components/MainMenu.ts`) only renders when `import.meta.env.VITE_ABOUT_US_URL` is set, and `import.meta.env` is frozen at Vite **startup** — the `env:` block in `client/playwright.config.ts` does NOT retrofit it onto an already-running dev server. If you start the client dev server *without* exporting `VITE_ABOUT_US_URL`, the button is absent and `tests/e2e/main-menu.e2e.test.ts` fails with "button not visible" / `page.waitForEvent('popup')` timeouts. The fix: launch the dev server with the var exported, e.g. `VITE_ABOUT_US_URL="https://example.com/about-us" npm run dev` (from `client/`), then run `npx playwright test`. Do not chase a code change — set the env var before the server boots. Same rule applies to any `VITE_*`-gated UI feature under e2e.

## Verification checklist

- Content changes: `npm run validate:content`.
- Server changes: `npm run lint --workspace=server`, `npm run build --workspace=server`, and relevant `npm run test --workspace=server` tests.
- Client changes: `npm run lint --workspace=client` and `npm run build --workspace=client`.
- Docker/server changes: rebuild the server container and verify health with `docker exec las-flores-server wget -qO- http://localhost:3000/health` (use in-container wget — the alpine image has no curl, and host-side curl can return exit 56 due to stale docker-proxy state even when the server is healthy). If ports are stuck, kill stale proxies (`pkill -9 docker-proxy`) and host processes (`sudo pkill -9 -u postgres; sudo pkill -9 redis-server`), then run `./scripts/apply-migrations.sh both` before starting.

## Clean shutdown pattern

To avoid stuck ports on shared hosts, always perform full teardown:
```bash
docker compose down            # stops containers but preserves volumes
docker compose down --volumes  # also removes volumes (fresh DB)
```

> **MinIO data safety**: `docker compose down --volumes` destroys all named volumes. The MinIO volume uses a host-bind mount (`.minio-data/`) so MinIO data survives normal `down` commands. For extra safety, run `scripts/backup-content-assets.sh` before any operation that might affect volumes — this script backs up local `content/**/assets/` staging only, not objects stored exclusively in MinIO.

After code changes, rebuild and verify:
```bash
docker compose build server && docker compose up -d server
./scripts/apply-migrations.sh both  # if DB was recreated
docker exec las-flores-server wget -qO- http://localhost:3000/health
# Do NOT use: curl http://localhost:3000/health
# The alpine image has no curl, and host-side curl can return exit 56
# due to stale docker-proxy state even when the server is healthy.
```

## Podman workflow

When running on Podman instead of Docker, do not use `docker compose` commands. Use the workflow below.

### First-time environment setup (Podman)

```bash
# Create network and volumes (one-time)
podman network create las-flores-net
podman volume create postgres-oltp-data
podman volume create postgres-olap-data
podman volume create redis-data
podman volume create minio-data
```

### Start services

```bash
# Build server image
podman build -f server/Dockerfile -t las-flores-server .

# Start databases, cache, and object storage
podman run -d --name las-flores-postgres-oltp \
  --network las-flores-net -p 5434:5432 \
  -v postgres-oltp-data:/var/lib/postgresql/data \
  -e POSTGRES_DB=las_flores \
  -e POSTGRES_USER=las_flores \
  -e POSTGRES_PASSWORD=las_flores_dev_password \
  docker.io/library/postgres:16-alpine

podman run -d --name las-flores-postgres-olap \
  --network las-flores-net -p 5433:5432 \
  -v postgres-olap-data:/var/lib/postgresql/data \
  -e POSTGRES_DB=las_flores_analytics \
  -e POSTGRES_USER=las_flores_analytics \
  -e POSTGRES_PASSWORD=las_flores_analytics_dev_password \
  docker.io/library/postgres:16-alpine

podman run -d --name las-flores-redis \
  --network las-flores-net -p 6379:6379 \
  -v redis-data:/data \
  docker.io/library/redis:7-alpine

podman run -d --name las-flores-minio \
  --network las-flores-net -p 9000:9000 -p 9001:9001 \
  -v minio-data:/data \
  docker.io/minio/minio:latest server /data --console-address ":9001"

# Start server using container IPs for intra-network connectivity
podman run -d --name las-flores-server \
  --network las-flores-net -p 3000:3000 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./content:/app/content \
  -v ./docs:/app/docs:ro \
  -e DATABASE_URL=postgresql://las_flores:las_flores_dev_password@10.89.0.3:5432/las_flores \
  -e ANALYTICS_DATABASE_URL=postgresql://las_flores_analytics:las_flores_analytics_dev_password@10.89.0.4:5432/las_flores_analytics \
  -e REDIS_URL=redis://10.89.0.5:6379 \
  -e MINIO_ENDPOINT=10.89.0.6 \
  -e MINIO_PORT=9000 \
  -e MINIO_ACCESS_KEY=minioadmin \
  -e MINIO_SECRET_KEY=minioadmin \
  -e JWT_SECRET=your-jwt-secret-change-in-production \
  las-flores-server
```

Verify with:
```bash
curl http://localhost:3000/health
```

Apparent healthy response: `{"success":true,"data":{"status":"healthy",...}}. If the server refuses the connection, check `podman logs las-flores-server`.

#### Start admin panel

The admin panel requires two environment variables to work correctly with the server:

- `NEXT_PUBLIC_SERVER_URL`: Used by client-side code (browser fetches from this URL). Set to `http://localhost:3000` so the browser can reach the server via the host port mapping.
- `INTERNAL_SERVER_URL`: Used by server-side route handlers (admin container fetches from this URL). Set to `http://las-flores-server:3000` so the admin container can reach the server via the container network.

```bash
# Build the admin panel image
podman build -f admin/Dockerfile -t las-flores-admin .

# Start admin panel with correct environment variables
podman run -d --name las-flores-admin \
  --network las-flores-net -p 3002:3000 \
  -v /path/to/las_flores_city:/app \
  -w /app \
  -e NEXT_PUBLIC_SERVER_URL=http://localhost:3000 \
  -e INTERNAL_SERVER_URL=http://las-flores-server:3000 \
  las-flores-admin
```

Verify admin is running:
```bash
podman logs las-flores-admin | grep "Ready in"
```

Test login at http://localhost:3002/login with `admin@example.com` / `admin123`.

### Clean shutdown (Podman)

```bash
podman rm -f las-flores-server
podman rm -f las-flores-postgres-oltp
podman rm -f las-flores-postgres-olap
podman rm -f las-flores-redis
podman rm -f las-flores-minio
podman network rm las-flores-net
podman volume rm postgres-oltp-data postgres-olap-data redis-data minio-data
```

### Helper Scripts

Several helper scripts streamline development tasks:

#### `scripts/run-tests-podman.sh`
Run tests in a Podman container with proper environment:

```bash
# Run specific test file
./scripts/run-tests-podman.sh server/tests/integration/assets.test.ts

# Run test directory
./scripts/run-tests-podman.sh server/tests/integration/

# With custom env file
./scripts/run-tests-podman.sh server/tests/ --env .env.test

# Show help
./scripts/run-tests-podman.sh --help
```

#### `scripts/dev-cleanup.sh`
Find and clean development artifacts:

```bash
# Scan and report (dry-run)
./scripts/dev-cleanup.sh

# Show what would be deleted
./scripts/dev-cleanup.sh --dry-run

# Delete found artifacts (with confirmation)
./scripts/dev-cleanup.sh --delete

# Only scan specific categories
./scripts/dev-cleanup.sh --categories temp,debug
```

Categories: `temp`, `task`, `debug`, `build`, `ide`

#### `scripts/podman-workflow.sh`
Comprehensive workflow script for Podman-based development:

```bash
# Initial setup (build images, start services, apply migrations)
./scripts/podman-workflow.sh setup

# Run all tests (lint, build, server tests, e2e)
./scripts/podman-workflow.sh test

# Individual commands
./scripts/podman-workflow.sh lint
./scripts/podman-workflow.sh build
./scripts/podman-workflow.sh server-test
./scripts/podman-workflow.sh e2e

# Check status of all services
./scripts/podman-workflow.sh status

# Clean up all containers and volumes
./scripts/podman-workflow.sh clean
```

### Podman gotchas

- **Rootless networking**: If `podman run` errors with `exec: "pasta": executable file not found in $PATH`, install `slirp4netns` and set `~/.config/containers/containers.conf`:
  ```ini
  [engine]
  network_backend = "cni"

  [network]
  default_rootless_network_cmd = "slirp4netns"
  ```
- **DNS resolution**: Without `aardvark-dns`, container hostnames do not resolve. Use the container IPs from `podman network inspect las-flores-net` in the server's `DATABASE_URL`/`REDIS_URL`/`MINIO_ENDPOINT`.
- **Container IPs change after recreate**: If you recreate containers, refresh the IPs by re-running `podman network inspect las-flores-net`.

### Migration Idempotency

All SQL migrations now use `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER` to ensure idempotent execution. This fixes the migration drift test failures. When adding new triggers, follow this pattern:

```sql
DROP TRIGGER IF EXISTS trigger_name ON table_name;
CREATE TRIGGER trigger_name ...;
```

---

### Test isolation rules (anti-flakiness)

Integration tests run against a **shared** Postgres+Redis instance. Under parallel Jest workers (the default for `npm test`), concurrent tests can interfere with each other. The following rules prevent flakiness:

#### 1. Always use dedicated synthetic UUIDs

Every test fixture must use a **private UUID** that no other test touches, declared as a module-level constant and cleaned up in `afterAll`. Collisions cause hard-to-debug cross-test interference.

- ✅ **Good**: `const MYSTERY_ID = 'c1000000-e29b-41d4-a716-446655440099';`
- ❌ **Bad**: reusing the same `MYSTERY_ID` as another test
- ❌ **Never**: reuse the ID of a real content entity (e.g., `a0000000-e29b-41d4-a716-446655440001` for `great_lithium_leak`) for a synthetic simulation

**The `leaderboard.simulation.test.ts` → `migration.drift.test.ts` collision** was the primary cause of the `migration.drift` flake. `migration.drift` must use the real content ID (it migrates the actual YAML file), but `leaderboard.simulation` must use a **different** synthetic ID — it seeds its own row independently. The fix: changed `leaderboard.simulation`'s ID to `d0000000-...`.

#### 2. `processExpiredMysteries()` is global — it finalizes ALL expired RESOLVING mysteries

`LeaderboardWorker.processExpiredMysteries()` selects **every** expired mystery in the DB, not just the test's own. Under parallel execution, a test calling this worker may also finalize a foreign mystery from another test.

The fix (applied in `LeaderboardWorker.ts`): each mystery now gets a **fresh DB client** in the loop (`client = await oltpPool.connect()` inside the `for`), so a failure/rollback on one mystery can never abort another's transaction.

**Self-isolation for worker suites** (so they never race a sibling worker): `processExpiredMysteries()` accepts an optional `mysteryIds?: readonly string[]` scope. Both `aftermath.worker.test.ts` and `leaderboard.simulation.test.ts`:
- seed their mystery **non-expired** (`expires_at = NOW() + INTERVAL '1 hour'`) so a concurrent filterless sweep can never finalize it mid-seed;
- expire it right before the call (`UPDATE mysteries SET ... expires_at = NOW() - INTERVAL '10 minutes' WHERE id = OWN`) and invoke `processExpiredMysteries([OWN_ID])`.

This keeps assertions deterministic under parallel workers with no global worker lock. Production callers (cron tick in `index.ts`, `trigger_leaderboard_worker.ts`) keep using the no-arg form (finalize everything).

#### 3. Integration tests run in parallel — schema-mutating operations serialize on a shared advisory lock

`npm test` (full suite) runs unit+smoke in parallel, then integration in parallel:

```bash
npx --no-install jest tests/unit tests/smoke --forceExit \
  && npx --no-install jest tests/integration --detectOpenHandles --forceExit
```

Integration tests share one Postgres instance. Concurrent DDL (`create`/`alter table` in `beforeAll`) takes `ACCESS EXCLUSIVE` table locks and can deadlock across workers, so every suite's `applyMigration(...)` (schema DDL) and `migrateContent()` acquire a **shared blocking advisory lock** that waits rather than fails-fast.

- Helper: `server/tests/helpers/schemaLock.ts` → `withSchemaLock(fn)`. It takes the **same advisory key as `migrateContent`** (`content_migration`) so one worker at a time performs schema/content mutation; data-only suites run unlocked and in parallel.
- Wrap **DDL + whole-table reconciles** in `withSchemaLock` (the 15 `applyMigration` helpers, `story-beat-pipeline`'s `DELETE FROM story_beats` + restore).
- Never wrap ordinary row-level data mutations — let those run in parallel.

To run a single integration test file:
```bash
npm run test:integration -- tests/integration/aftermath.worker.test.ts
# or from project root:
npm run test:integration --workspace=server -- tests/integration/aftermath.worker.test.ts
```

#### 4. `migrateContent` acquires a blocking advisory lock

`migrateContent()` acquires `pg_advisory_lock(hashtext('content_migration'))` and **waits** for the current holder instead of try-and-give-up (previously `pg_try_advisory_lock` + 5×200ms retries that could return `success: false` — the exact `migration.drift` flake). Because the same advisory key is used by `tests/helpers/schemaLock.ts`, a migration here also serializes against other suites' schema DDL.

If you add a new test that calls `migrateContent`, be aware the `content_migration` lock is global and **blocking**; call it from outside any `withSchemaLock` (or it nil-safe waits) and remember the whole `migration.drift` scenarios serialize via the shared lock.

#### 5. `closeConnections()`/`closeRedis()` in per-file `afterAll` is redundant but safe

The `connectionsClosed`/`redisClosed` guards in `connection.ts` and `redis.ts` prevent double-close. However, relying solely on `globalTeardown.cjs` for pool cleanup is preferred. If you add a new test:
- Do clean up your test's own data rows in `afterAll`.
- Calling `closeConnections()` / `closeRedis()` in the same `afterAll` is optional — globalTeardown handles it at the end of the Jest run.
- Never rely on another test to close the pool for you (cross-file ordering is undefined).

#### 6. `jest.config.js` has `clearMocks: true` + `restoreMocks: true` — use `jest.spyOn` freely

Jest **reuses worker processes** across test files. Without automatic cleanup, a `jest.spyOn()` spy (e.g. on `process.cwd`, `fs.promises.*`, `console.warn`) that isn't manually restored can leak into the next test file assigned to that worker, causing intermittent failures that only appear under parallel execution.

The config now sets:
- **`restoreMocks: true`** — runs `jest.restoreAllMocks()` *before every test*, restoring every `jest.spyOn()` spy to its original implementation. This runs *before* `beforeEach`, so `beforeEach` can re-create fresh spies.
- **`clearMocks: true`** — runs `jest.clearAllMocks()` *before every test*, resetting `mock.calls` / `mock.results` so call-count assertions stay scoped to the current test.

Neither option affects `jest.mock()` factory implementations (they persist across tests as before). Only `jest.spyOn()` spies and mock call histories are auto-cleaned.

When writing new tests:
- ✅ **Good**: `jest.spyOn(process, 'cwd').mockReturnValue(tmpDir)` in `beforeEach` — auto-restored before next test, re-created by `beforeEach`.
- ✅ **Good**: `jest.spyOn(console, 'warn').mockImplementation()` inside a `try { ... } finally { spy.mockRestore() }` block — doubly safe (config + finally).
- ❌ **Bad**: `jest.spyOn(fs, 'existsSync')` at **module scope** (outside any hook) — `restoreMocks` strips it before the first test. Move it into `beforeAll` + `beforeEach` instead (see `assets.test.ts` for the pattern).
- ❌ **Bad**: `jest.spyOn(...)` in `beforeAll` expecting it to persist across tests — `restoreMocks` strips it before the second test. Use `beforeEach` instead.

#### 7. Unit tests must mock `database/redis.js` when importing Redis-using modules

Any unit test that imports a module transitively reaching `database/redis.js` (e.g. route handlers that invalidate caches, services that read/write cache) must `jest.mock('../../src/database/redis.js', ...)` so no real TCP connection to Redis is opened. Real ioredis clients:
- create `globalThis` handles that `jest-environment-node` tries to clean at worker teardown, and
- emit connection errors asynchronously after the test has finished.

Both behaviors cause flaky failures under parallel workers. Keep unit tests DB/Redis-free; integration tests are the place for real Redis.

- ✅ **Good**: `adminStoryBeats.property.test.ts`, `resolver.unit.test.ts`, `IronGateValidator.property.test.ts`, `plan-generation-job.test.ts`, and now `adminContentFileWrite.property.test.ts` all mock the Redis module.
- ❌ **Bad**: Importing `admin-content.js` (which mounts `admin-content-resolver.js`) and exercising the `PUT /file` success path without mocking Redis — the `invalidateContentResolverCache()` call creates a real client and logs `ECONNREFUSED` errors after the test ends.
