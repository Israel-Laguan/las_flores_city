# Docker Integration Reference

This document describes the Docker Compose setup, deviations from the original specification, and operational notes for the Las Flores City development environment.

---

## 1. Deviations from Original Specification

### 1.1 Port Mapping (OLTP Database)

| Spec | Actual | Reason |
|------|--------|--------|
| PostgreSQL OLTP on `localhost:5432` | `localhost:5434` | Port 5432 was occupied by a local PostgreSQL instance. Docker cannot bind to an already-used port. |

**Impact:** The `.env` file uses port **5434**. All local dev tools (pgAdmin, DBeaver, test scripts) must connect to port 5434. Internal Docker networking is unaffected — the server container connects to `postgres-oltp:5432` inside the network.

### 1.2 Dockerfile Build Context

| Spec | Actual | Reason |
|------|--------|--------|
| `context: ./server` with `COPY ../shared/` | `context: .` (repo root) | Docker cannot access files outside the build context directory. `../shared` is unreachable when context is `./server`. |

**Impact:** Both `server/Dockerfile` and `admin/Dockerfile` use the repo root as build context. A `.dockerignore` file mitigates unnecessary file transfer. Docker layer caching minimizes rebuild time.

### 1.3 Content YAML IDs

| Spec | Actual | Reason |
|------|--------|--------|
| Short string IDs (`char_welcome_bot`, `dialogue_welcome`) | Full UUIDs (`550e8400-e29b-41d4-a716-446655440001`) | Zod schemas in `@las-flores/shared` enforce `z.string().uuid()` for all content IDs. The migration engine validates against these schemas before database insert. |

**Impact:** Content authoring requires UUIDs for all `id` fields in YAML files.

### 1.4 Content YAML Null Values

| Spec | Actual | Reason |
|------|--------|--------|
| `image_url: null`, `avatar_url: null` | Field omitted entirely | Zod schema uses `z.string().url().optional()` — this accepts `undefined` (field missing) but rejects `null`. YAML `null` is not the same as absent. |

**Impact:** Content authors must omit optional fields rather than setting them to `null`. Alternatively, schemas could be updated to use `.nullable().optional()`.

### 1.5 Dependency Order (Migration Engine)

| Spec | Actual | Reason |
|------|--------|--------|
| Characters → Overlays → Scenes → Dialogues | Characters → Scenes → Dialogues → Overlays | Overlays reference dialogue trees via `target_tree_id` (foreign key). Processing overlays before dialogues causes a FK constraint violation. |

**Impact:** Corrected in `server/src/content/migrate.ts`. The order ensures all referenced entities exist before dependent entities are inserted.

### 1.6 `npm ci` vs `npm install`

| Spec | Actual | Reason |
|------|--------|--------|
| `npm ci` in Dockerfiles | `npm install` | `npm ci` requires a `package-lock.json` file. The monorepo doesn't generate one by default. |

**Impact:** `npm install` is less deterministic than `npm ci`. For production, consider generating and committing `package-lock.json`, then reverting to `npm ci`.

---

## 2. Operational Notes

### 2.1 Local PostgreSQL Conflict

The developer machine may have a local PostgreSQL running on port 5432. Docker Compose will report:

```
Error response from daemon: Ports are not available: exposing port TCP 0.0.0.0:5432 -> 127.0.0.1:0: listen tcp 0.0.0.0:5432: bind: address already in use
```

**Recommendation:** Use `docker compose profiles` to allow developers to opt out of local Postgres if they already have one running.

### 2.2 Shared Package Build Chain

The monorepo requires a specific build order: `shared` → `server`/`admin`. Inside Docker:
1. `COPY shared/package*.json` and `npm install` (for TypeScript compiler)
2. `COPY server/package*.json` and `npm install`
3. `COPY shared/` source and `npm run build` (generates `dist/`)
4. `COPY server/` source and `npm run build`

If step 1 is skipped, `tsc` is not available and the build fails with `sh: tsc: not found`.

### 2.3 TypeScript Path Mapping

The server's `tsconfig.json` needs explicit `paths` configuration to resolve `@las-flores/shared`:

```json
{
  "paths": {
    "@las-flores/shared": ["../shared/src/index.ts"]
  }
}
```

Without this, TypeScript cannot find the module during compilation. npm workspaces resolve at runtime, but TypeScript's compiler needs explicit guidance.

### 2.4 Migration Error Reporting

The migration CLI prints errors on failure:

```
Migration failed!

Errors:
  - scenes/welcome_center.yaml: Schema validation failed: [...]
  - characters/aria_welcome_bot.yaml: Schema validation failed: [...]
```

### 2.5 Container Health Checks

Docker Compose health checks use:
- PostgreSQL: `pg_isready -U las_flores`
- Redis: `redis-cli ping`
- MinIO: `mc ready local`

The server container has `depends_on` with `condition: service_healthy`, preventing the common "connection refused" race condition on startup.

---

## 3. Services

```
NAMES                      STATUS                        PORTS
las-flores-postgres-oltp   Up (healthy)                  0.0.0.0:5434->5432/tcp
las-flores-postgres-olap   Up (healthy)                  0.0.0.0:5433->5432/tcp
las-flores-redis           Up (healthy)                  0.0.0.0:6379->6379/tcp
las-flores-minio           Up (healthy)                  0.0.0.0:9000-9001->9000-9001/tcp
las-flores-server          Up                           0.0.0.0:3000->3000/tcp
las-flores-admin           Up                           0.0.0.0:3001->3000/tcp
```

**Endpoints:**
- `GET /health` — server health check
- `GET /player/state` — current player state
- `GET /location/:id` — location details
- `GET /dialogue/:id` — dialogue tree

---

## 4. Modified Files

| File | Change |
|------|--------|
| `docker-compose.yml` | OLTP port 5434, build contexts changed to root |
| `server/Dockerfile` | Root context, `npm install`, shared build chain |
| `admin/Dockerfile` | Root context, `npm install`, shared build chain |
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

## 5. Recommendations

1. **Commit `package-lock.json`** — enables `npm ci` in Docker for reproducible builds
2. **Add `nullable()` to Zod schemas** — allows `null` in YAML for optional fields
3. **Content ID helper** — provide `npm run content:new-id` to generate UUIDs for content authors
4. **Port documentation** — add a "Ports" section to README with the 5434 mapping
5. **Route implementations** — routes should query the database rather than return mock data
6. **E2E test setup** — Playwright config is ready but needs Docker services running; consider adding to CI with service containers
