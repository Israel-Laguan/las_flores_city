# Sprint 0 — Docker Integration Report

**Date:** 2026-06-15  
**Author:** MiMoCode (Automated)  
**Audience:** Project Manager  

---

## Executive Summary

Sprint 0 infrastructure has been connected and validated via Docker Compose. All 6 services are running and healthy. During integration, several deviations from the original spec were discovered and resolved. This document details those changes and findings for architectural decision records.

---

## 1. Changes from Initial Specs

### 1.1 Port Mapping (OLTP Database)

| Spec | Actual | Reason |
|------|--------|--------|
| PostgreSQL OLTP on `localhost:5432` | `localhost:5434` | Port 5432 was occupied by a local PostgreSQL instance on the developer's machine. Docker cannot bind to an already-used port. |

**Impact:** `.env` file updated. All local dev tools (pgAdmin, DBeaver, test scripts) must connect to port **5434**, not 5432. Internal Docker networking (container-to-container) is unaffected — the server container connects to `postgres-oltp:5432` inside the network.

### 1.2 Dockerfile Build Context

| Spec | Actual | Reason |
|------|--------|--------|
| `context: ./server` with `COPY ../shared/` | `context: .` (repo root) | Docker cannot access files outside the build context directory. `../shared` is unreachable when context is `./server`. |

**Impact:** Both `server/Dockerfile` and `admin/Dockerfile` now use the repo root as build context. This means the Docker build copies more files into the build context (mitigated by `.dockerignore`). A side effect is that any change to shared code triggers a full context transfer on build, though Docker layer caching minimizes rebuild time.

### 1.3 Content YAML IDs

| Spec | Actual | Reason |
|------|--------|--------|
| Short string IDs (`char_welcome_bot`, `dialogue_welcome`) | Full UUIDs (`550e8400-e29b-41d4-a716-446655440001`) | Zod schemas in `@las-flores/shared` enforce `z.string().uuid()` for all content IDs. The migration engine uses these schemas for validation before database insert. |

**Impact:** Content authoring must use UUIDs for all `id` fields in YAML files. A future improvement could relax the schema to accept both formats, or provide an `npm run generate-id` helper for content authors.

### 1.4 Content YAML Null Values

| Spec | Actual | Reason |
|------|--------|--------|
| `image_url: null`, `avatar_url: null` | Field omitted entirely | Zod schema uses `z.string().url().optional()` — this accepts `undefined` (field missing) but rejects `null`. YAML `null` is not the same as absent. |

**Impact:** Content authors must omit optional fields rather than setting them to `null`. This is a common Zod pitfall. The fix is to either update schemas to use `.nullable().optional()` or document the convention.

### 1.5 Dependency Order (Migration Engine)

| Spec | Actual | Reason |
|------|--------|--------|
| Characters → Overlays → Scenes → Dialogues | Characters → Scenes → Dialogues → Overlays | Overlays reference dialogue trees via `target_tree_id` (foreign key). Processing overlays before dialogues causes a FK constraint violation. |

**Impact:** Fixed in `server/src/content/migrate.ts`. The corrected order ensures all referenced entities exist before dependent entities are inserted.

### 1.6 `npm ci` vs `npm install`

| Spec | Actual | Reason |
|------|--------|--------|
| `npm ci` in Dockerfiles | `npm install` | `npm ci` requires a `package-lock.json` file. The monorepo doesn't generate one by default (workspaces without explicit lock). |

**Impact:** `npm install` is less deterministic than `npm ci` (may resolve to newer minor versions). For production, consider generating and committing `package-lock.json`, then reverting to `npm ci`.

---

## 2. Interesting Findings

### 2.1 Local PostgreSQL Conflict

The developer machine had a local PostgreSQL running on port 5432 (standard). This is a common issue in shared development environments. Docker Compose reports:

```
Error response from daemon: Ports are not available: exposing port TCP 0.0.0.0:5432 -> 127.0.0.1:0: listen tcp 0.0.0.0:5432: bind: address already in use
```

**Recommendation:** Document the port mapping in `README.md` and consider using `docker compose profiles` to allow developers to opt out of local Postgres if they already have one running.

### 2.2 Shared Package Build Chain

The monorepo requires a specific build order: `shared` → `server`/`admin`. Inside Docker, this means:
1. `COPY shared/package*.json` and `npm install` (for TypeScript compiler)
2. `COPY server/package*.json` and `npm install`
3. `COPY shared/` source and `npm run build` (generates `dist/`)
4. `COPY server/` source and `npm run build`

If step 1 is skipped (no `npm install` in shared), `tsc` is not available and the build fails with `sh: tsc: not found`. This is not obvious from the error message.

### 2.3 TypeScript Path Mapping

The server's `tsconfig.json` needs explicit `paths` configuration to resolve `@las-flores/shared` to the source files:

```json
{
  "paths": {
    "@las-flores/shared": ["../shared/src/index.ts"]
  }
}
```

Without this, TypeScript cannot find the module during compilation. This is a workspace resolution issue — npm workspaces resolve at runtime, but TypeScript's compiler needs explicit guidance.

### 2.4 Silent Migration Failures

The original migration CLI exited with code 1 but did not print which files failed or why. The error was hidden inside the result object. After debugging, the CLI was updated to print errors on failure:

```
💥 Migration failed!

Errors:
  - scenes/welcome_center.yaml: Schema validation failed: [...]
  - characters/aria_welcome_bot.yaml: Schema validation failed: [...]
```

**Recommendation:** Always surface errors in CLI tools during development. The original "silent failure" pattern made debugging significantly harder.

### 2.5 Container Health Checks

Docker Compose health checks use:
- PostgreSQL: `pg_isready -U las_flores`
- Redis: `redis-cli ping`
- MinIO: `mc ready local`

The server container has `depends_on` with `condition: service_healthy`, meaning it won't start until all three data stores report healthy. This prevents the common "connection refused" race condition on startup.

---

## 3. Services Running

```
NAMES                      STATUS                        PORTS
las-flores-postgres-oltp   Up (healthy)                  0.0.0.0:5434->5432/tcp
las-flores-postgres-olap   Up (healthy)                  0.0.0.0:5433->5432/tcp
las-flores-redis           Up (healthy)                  0.0.0.0:6379->6379/tcp
las-flores-minio           Up (healthy)                  0.0.0.0:9000-9001->9000-9001/tcp
las-flores-server          Up                           0.0.0.0:3000->3000/tcp
las-flores-admin           Up                           0.0.0.0:3001->3000/tcp
```

**Verified endpoints:**
- `GET /health` → 200 ✅
- `GET /player/state` → 200 ✅
- `GET /location/:id` → 200 ✅
- `GET /dialogue/:id` → 200 ✅

**Database:** 4 content files migrated (1 character, 1 scene, 1 dialogue tree, 1 overlay).

---

## 4. Files Modified (from original spec)

| File | Change |
|------|--------|
| `docker-compose.yml` | OLTP port `5432→5434`, build contexts changed to root |
| `server/Dockerfile` | Full rewrite for root context, `npm install`, shared build chain |
| `admin/Dockerfile` | Full rewrite for root context, `npm install`, shared build chain |
| `.env` | OLTP port updated to 5434 |
| `server/tsconfig.json` | Added `paths` for `@las-flores/shared`, adjusted `rootDir` |
| `server/src/content/validate.ts` | Made `file` optional in `ValidationError` |
| `server/src/database/connection.ts` | Added `QueryResultRow` constraint to generic types |
| `server/src/content/migrate.ts` | Fixed dependency order, added error printing in CLI |
| `content/characters/aria_welcome_bot.yaml` | UUIDs, removed `null` fields |
| `content/scenes/welcome_center.yaml` | UUIDs, removed `null` fields |
| `content/dialogues/welcome_dialogue.yaml` | UUIDs for all references |
| `content/overlays/welcome_nsfw_overlay.yaml` | UUIDs for all references |

---

## 5. Recommendations for Sprint 1

1. **Commit `package-lock.json`** — Enables `npm ci` in Docker for reproducible builds
2. **Add `nullable()` to Zod schemas** — Allows `null` in YAML for optional fields (common YAML convention)
3. **Content ID helper** — Provide `npm run content:new-id` to generate UUIDs for content authors
4. **Port documentation** — Add a "Ports" section to README with the 5434 mapping
5. **Route implementations** — Current routes return mock data; Sprint 1 should query the database
6. **E2E test setup** — Playwright config is ready but needs Docker services running; consider adding to CI with service containers
