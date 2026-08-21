---
name: podman-dev
description: "Run, start, stop, or manage the Podman development environment for Las Flores 2077. Use when the user asks to bring up, tear down, check, or test the Podman stack. Do not use Docker commands when the target is Podman."
---

# Podman Dev Environment

Bring up, inspect, tear down, or test the Las Flores 2077 stack under **Podman**. This skill is the developer's jump-in guide for the local Podman dev environment, complementing the operational guardrails in the `podman-ops` skill.

## When to use

- The user asks to start/stop/status/health-check the Podman stack.
- The user wants to run the test suite against the Podman-backed services.
- A container or service needs restarting after code or network changes.

## Core Principles

- Target is Podman, not Docker. Never emit `docker`/`docker compose` commands.
- Rootless Podman here has **no `aardvark-dns`** — use raw container IPs in env vars (the pattern below) or `--add-host` (see `podman-ops`).
- The authoritative health check is in-container `wget` (alpine image has no `curl`; host-side `curl` may exit 56 even when healthy).
- Test runner reaches backing services via host-mapped ports (`localhost:5434/5433/6379`).
- `JWT_SECRET` must be `dev-secret` for local dev-login to work.
- **Migration ownership is load-bearing**: the `intake-worker` (port 3001) is the **only** process that runs `runAllMigrations()` (SQL **and** `migrateContent()`). The game-server (port 3000) never migrates — it only reads content tables. Start `intake-worker` first and wait for its `/health` before starting the game-server.
- **LiteLLM stays on the HOST**: pass `--add-host=host.containers.internal:host-gateway` and `LITELLM_BASE_URL=http://host.containers.internal:4000`. The container reaches the host's LiteLLM proxy through that mapping.
- `PROMPT_ROOT` is **not** required: the app default `resolveContentDir()` already resolves to `/app/content` inside the container (the workspace script runs from `/app/server`), matching `docker-compose.yml`. Do not set it.

---

## Steps

### Phase 1: Quick Start (recommended)

```bash
./start-stack.sh
```

This automates network/volume creation, service start (including the `intake-worker` migration owner and Neo4j), image build, IP discovery, and server launch.

### Phase 2: Manual Start

1. **Create network and volumes**
   ```bash
    podman network create las-flores-net
    podman volume create postgres-oltp-data postgres-olap-data redis-data minio-data neo4j-data
   ```

2. **Start backing services**
   ```bash
   podman run -d --name las-flores-postgres-oltp \
     --network las-flores-net -p 5434:5432 \
     -v postgres-oltp-data:/var/lib/postgresql/data \
     -e POSTGRES_DB=las_flores -e POSTGRES_USER=las_flores \
     -e POSTGRES_PASSWORD=las_flores_dev_password \
     docker.io/library/postgres:16-alpine

   podman run -d --name las-flores-postgres-olap \
     --network las-flores-net -p 5433:5432 \
     -v postgres-olap-data:/var/lib/postgresql/data \
     -e POSTGRES_DB=las_flores_analytics -e POSTGRES_USER=las_flores_analytics \
     -e POSTGRES_PASSWORD=las_flores_analytics_dev_password \
     docker.io/library/postgres:16-alpine

   podman run -d --name las-flores-redis \
     --network las-flores-net -p 6379:6379 \
     -v redis-data:/data \
     docker.io/library/redis:7-alpine

   podman run -d --name las-flores-minio \
     --network las-flores-net -p 9000:9000 -p 9001:9001 \
     -v minio-data:/data \
     -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
     docker.io/minio/minio:latest server /data --console-address ":9001"

   # Neo4j graph authoring canvas (M27). Internal-only; NEO4J_ENABLED defaults to
   # false so boot never aborts when it is down. The default compose
   # NEO4J_AUTH=neo4j/${NEO4J_PASSWORD:-neo4j} resolves to "neo4j/neo4j", which the
   # image rejects — a real password must be supplied.
   podman run -d --name las-flores-neo4j \
     --network las-flores-net -p 7474:7474 -p 7687:7687 \
     -e NEO4J_AUTH=neo4j/lasfloresdev123 \
     -e NEO4J_server_memory_heap_max__size=512M -e NEO4J_server_memory_pagecache_size=256M \
     docker.io/library/neo4j:5-community
   ```

3. **Build the single server image** (runs BOTH the game-server and the intake-worker)
   ```bash
   podman build -f server/Dockerfile -t las-flores-server .
   ```

4. **Discover container IPs** (rootless Podman has no `aardvark-dns`)
   ```bash
   O(){ podman inspect "$1" | jq -r '.[]|.NetworkSettings.Networks["las-flores-net"].IPAddress'; }
   OLTP_IP=$(O las-flores-postgres-oltp); OLAP_IP=$(O las-flores-postgres-olap)
   REDIS_IP=$(O las-flores-redis); MINIO_IP=$(O las-flores-minio); NEO4J_IP=$(O las-flores-neo4j)
   ```

5. **Start `intake-worker` FIRST (migration owner, port 3001)** — it runs all SQL + content migrations on boot, then the game-server can read content tables.
   ```bash
   podman run -d --name las-flores-intake-worker --network las-flores-net \
     --add-host=host.containers.internal:host-gateway -p 3001:3001 \
     -v ./server/src:/app/server/src -v ./shared:/app/shared -v ./infra:/app/infra \
     -v ./content:/app/content -v ./docs:/app/docs:ro \
     -e NODE_ENV=development -e PORT=3001 \
     -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@$OLTP_IP:5432/las_flores" \
     -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@$OLAP_IP:5432/las_flores_analytics" \
     -e REDIS_URL="redis://$REDIS_IP:6379" \
     -e MINIO_ENDPOINT="$MINIO_IP" -e MINIO_PORT=9000 -e MINIO_PUBLIC_URL=http://localhost:9000 \
     -e MINIO_ACCESS_KEY=minioadmin -e MINIO_SECRET_KEY=minioadmin \
     -e NEO4J_URI="bolt://$NEO4J_IP:7687" -e NEO4J_USER=neo4j -e NEO4J_PASSWORD=lasfloresdev123 -e NEO4J_ENABLED=true \
     -e JWT_SECRET=dev-secret \
     -e LITELLM_BASE_URL=http://host.containers.internal:4000 -e LITELLM_API_KEY=local-key \
     -e LLM_MODEL=poolside/laguna-m.1 -e LLM_PROVIDER=litellm \
     las-flores-server npm run dev:intake --workspace=server
   ```

   Wait until healthy (in-container `wget`; image has no `curl`):
   ```bash
   podman exec las-flores-intake-worker wget -qO- http://localhost:3001/health
   # expected: {"success":true,...}  (content tables now exist)
   ```

6. **Start the game-server (port 3000)** — start it only after intake-worker is healthy. Same image, default CMD (`npm run dev`), no `PORT` override.
   ```bash
   podman run -d --name las-flores-server --network las-flores-net \
     --add-host=host.containers.internal:host-gateway -p 3000:3000 \
     -v ./server/src:/app/server/src -v ./shared:/app/shared -v ./infra:/app/infra \
     -v ./content:/app/content -v ./docs:/app/docs:ro \
     -e NODE_ENV=development \
     -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@$OLTP_IP:5432/las_flores" \
     -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@$OLAP_IP:5432/las_flores_analytics" \
     -e REDIS_URL="redis://$REDIS_IP:6379" \
     -e MINIO_ENDPOINT="$MINIO_IP" -e MINIO_PORT=9000 -e MINIO_PUBLIC_URL=http://localhost:9000 \
     -e MINIO_ACCESS_KEY=minioadmin -e MINIO_SECRET_KEY=minioadmin \
     -e NEO4J_URI="bolt://$NEO4J_IP:7687" -e NEO4J_USER=neo4j -e NEO4J_PASSWORD=lasfloresdev123 -e NEO4J_ENABLED=true \
     -e JWT_SECRET=dev-secret \
     -e LITELLM_BASE_URL=http://host.containers.internal:4000 -e LITELLM_API_KEY=local-key \
     -e LLM_MODEL=poolside/laguna-m.1 -e LLM_PROVIDER=litellm \
     las-flores-server
   ```

7. **Build and start the admin panel (port 3002 → intake-worker:3001)**
   ```bash
   podman build -f admin/Dockerfile -t las-flores-admin .
   INTAKE_IP=$(O las-flores-intake-worker)
   podman run -d --name las-flores-admin --network las-flores-net \
     --add-host="las-flores-intake-worker:$INTAKE_IP" -p 3002:3000 \
     -v ./admin/src:/app/admin/src -v ./shared:/app/shared \
      -e NODE_ENV=development \
      -e NEXT_PUBLIC_SERVER_URL=http://localhost:3001 \
      -e INTERNAL_SERVER_URL=http://las-flores-intake-worker:3001 \
      -e NEXT_PUBLIC_DEV_LOGIN_ENABLED=true \
      -e DEV_LOGIN_ENABLED=true \
      las-flores-admin
   ```

8. **Verify migrations** (SQL-only; `apply-migrations.sh` is a verify tool — content migration runs inside the intake-worker at boot)
   ```bash
   ./scripts/apply-migrations.sh verify
   ```

### Phase 3: Status & Health

```bash
podman ps --filter name=las-flores

# Authoritative health checks (in-container wget; image has no curl)
podman exec las-flores-intake-worker wget -qO- http://localhost:3001/health
# expected: {"success":true,"data":{"status":"healthy",...}}
podman exec las-flores-server wget -qO- http://localhost:3000/health
# expected: {"success":true,"data":{"status":"healthy",...}}
```

### Phase 4: Run Tests

Integration tests and health checks require the Podman stack up with migrations applied (the `intake-worker` boot run handled content migration). Use the bundled runner, which launches a `node:20` container on `--network host` so it reaches backing services through host-mapped ports (`localhost:5434/5433/6379`). It reads env from `.env` (`DATABASE_URL`, `REDIS_URL`, `ANALYTICS_DATABASE_URL`, `MINIO_*`, `JWT_SECRET`).

**Path quirk**: the test path is relative to repo root AND must include the `server/` prefix (the runner does `cd server && npm test -- <path>`).

```bash
./scripts/run-tests-podman.sh server/tests/integration
./scripts/run-tests-podman.sh server/tests/unit
./scripts/run-tests-podman.sh server/tests/smoke
./scripts/run-tests-podman.sh server/tests/integration/story-builder-drafts.test.ts
```

**Confirmed-green baseline** (run 2026-08-15 on this Podman stack — full bring-up via the canonical procedure above, `LLM_PROVIDER=mock` to avoid host-LiteLLM dependency):
- `npm run lint --workspace=server` → clean
- `npm run build --workspace=server` → clean
- `run-tests-podman.sh server/tests/unit` → 89 suites / 1001 tests passed
- `run-tests-podman.sh server/tests/integration` → 58 suites / 384 tests passed
- `podman exec las-flores-intake-worker wget -qO- http://localhost:3001/health` → healthy
- `podman exec las-flores-server wget -qO- http://localhost:3000/health` → healthy
- `./scripts/apply-migrations.sh verify` → no drift; content tables present (created by the intake-worker at boot)

Host-equivalent (if node + deps installed locally): `npm run test --workspace=server`.

### Phase 5: Logs

```bash
podman logs las-flores-server
podman logs las-flores-intake-worker
podman logs las-flores-postgres-oltp
```

### Phase 6: Stop & Remove

```bash
podman rm -f las-flores-server las-flores-intake-worker las-flores-admin \
  las-flores-neo4j las-flores-minio las-flores-redis \
  las-flores-postgres-olap las-flores-postgres-oltp
podman network rm las-flores-net
podman volume rm -f postgres-oltp-data postgres-olap-data redis-data minio-data neo4j-data
```

---

## Notes

- See the `podman-ops` skill for operational guardrails (IP discovery, env vars, health-check gotchas, rootless `pasta` fallback).
- Full setup guide: `docs/DEVELOPMENT_SETUP.md`.
- Automated startup: `start-stack.sh`.
- There is **no `dashboard` image** — the admin panel (`las-flores-admin`) replaced it.
