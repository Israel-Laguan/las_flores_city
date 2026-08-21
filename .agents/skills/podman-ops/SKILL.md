---
name: podman-ops
description: "Enforces correct Podman operational patterns for Las Flores 2077 when running the stack with Podman instead of Docker. Use for container IP discovery, server startup env vars, health checks, and teardown. Do NOT suggest Docker commands when the target is Podman."
---

# Podman Operations

Operational guardrails for running the Las Flores 2077 stack with **Podman** instead of Docker. The agent enforces correct networking, env-var, health-check, and teardown patterns so the rootless Podman setup stays healthy.

## When to use

- The user is starting, inspecting, or tearing down the stack on a Podman host.
- A command suggests `docker compose` / `docker exec` / `docker logs` but the environment is Podman.
- Debugging server connection refusals, DNS resolution failures, or flaky health checks on the rootless host.

## Core Principles

- **Never** use `docker`/`docker compose` here. Use `podman` equivalents (`podman run`, `podman exec`, `podman inspect`, `podman ps`, `podman logs`, `podman rm`, `podman network`, `podman volume`).
- All services live on the `las-flores-net` bridge network.
- This rootless Podman host has **no `aardvark-dns`**: container-to-container URLs must use the IPs from `podman network inspect las-flores-net` (or `--add-host`), NOT bare hostnames or `localhost`.
- The server image is alpine-based and has **no `curl`**. The authoritative health check is from *inside* the container with `wget`.
- `JWT_SECRET` must be `dev-secret` for local testing (matches repo `.env`); the placeholder `your-jwt-secret-change-in-production` breaks dev-login.
- `PROMPT_ROOT` is **not** required: the app default `resolveContentDir()` already resolves to `/app/content` inside the container (the workspace script runs from `/app/server`), matching `docker-compose.yml`. Do not set it.
- **Migration ownership is load-bearing**: the `intake-worker` (port 3001) is the **only** process that runs `runAllMigrations()` (SQL **and** `migrateContent()`). The game-server (port 3000) never migrates. Start `intake-worker` first and wait for its `/health` before starting the game-server.
- **LiteLLM stays on the HOST**: pass `--add-host=host.containers.internal:host-gateway` and `LITELLM_BASE_URL=http://host.containers.internal:4000`. The container reaches the host's LiteLLM proxy through that mapping.

---

## Steps

### Phase 1: Network & Volumes (one-time)

```bash
podman network create las-flores-net
for v in postgres-oltp-data postgres-olap-data redis-data minio-data neo4j-data; do
  podman volume create "$v"
done
```

### Phase 2: Start backing services

```bash
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
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  docker.io/minio/minio:latest server /data --console-address ":9001"

# Neo4j graph authoring canvas (M27). Internal-only; NEO4J_ENABLED defaults to
# false so boot never aborts when it is down. NOTE: the default compose
# NEO4J_AUTH=neo4j/${NEO4J_PASSWORD:-neo4j} resolves to "neo4j/neo4j", which the
# image rejects — a real password must be supplied.
podman run -d --name las-flores-neo4j \
  --network las-flores-net -p 7474:7474 -p 7687:7687 \
  -v neo4j-data:/data \
  -e NEO4J_AUTH=neo4j/lasfloresdev123 \
  -e NEO4J_server_memory_heap_max__size=512M -e NEO4J_server_memory_pagecache_size=256M \
  docker.io/library/neo4j:5-community
```

### Phase 3: Container IP Discovery

```bash
OLTP_IP=$(podman inspect las-flores-postgres-oltp  | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
OLAP_IP=$(podman inspect las-flores-postgres-olap  | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
REDIS_IP=$(podman inspect las-flores-redis        | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
MINIO_IP=$(podman inspect las-flores-minio        | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
NEO4J_IP=$(podman inspect las-flores-neo4j        | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
```

### Phase 4: Build & Run (two containers from one image)

Build the single server image once; run it twice — once as the migration-owning
`intake-worker` (port 3001) and once as the game-server (port 3000).

```bash
podman build -f server/Dockerfile -t las-flores-server .

# (1) intake-worker — migration owner. Runs ALL SQL + content migrations on boot.
podman run -d --name las-flores-intake-worker \
  --network las-flores-net \
  --add-host=host.containers.internal:host-gateway -p 3001:3001 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./infra:/app/infra \
  -v ./content:/app/content \
  -v ./docs:/app/docs:ro \
  -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@$OLTP_IP:5432/las_flores" \
  -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@$OLAP_IP:5432/las_flores_analytics" \
  -e REDIS_URL="redis://$REDIS_IP:6379" \
  -e MINIO_ENDPOINT="$MINIO_IP" \
  -e MINIO_PORT="9000" \
  -e MINIO_PUBLIC_URL="http://localhost:9000" \
  -e MINIO_ACCESS_KEY="minioadmin" \
  -e MINIO_SECRET_KEY="minioadmin" \
  -e NEO4J_URI="bolt://$NEO4J_IP:7687" \
  -e NEO4J_USER="neo4j" \
  -e NEO4J_PASSWORD="lasfloresdev123" \
  -e NEO4J_ENABLED="true" \
  -e JWT_SECRET="dev-secret" \
  -e LITELLM_BASE_URL="http://host.containers.internal:4000" \
  -e LITELLM_API_KEY="local-key" \
  -e LLM_MODEL="poolside/laguna-m.1" \
  -e LLM_PROVIDER="litellm" \
  -e PORT="3001" \
  las-flores-server npm run dev:intake --workspace=server
```

Wait until the intake-worker is healthy (in-container `wget`), then start the game-server:

```bash
podman exec las-flores-intake-worker wget -qO- http://localhost:3001/health

# (2) game-server — reads content tables the intake-worker just created. No migrations.
podman run -d --name las-flores-server \
  --network las-flores-net \
  --add-host=host.containers.internal:host-gateway -p 3000:3000 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./infra:/app/infra \
  -v ./content:/app/content \
  -v ./docs:/app/docs:ro \
  -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@$OLTP_IP:5432/las_flores" \
  -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@$OLAP_IP:5432/las_flores_analytics" \
  -e REDIS_URL="redis://$REDIS_IP:6379" \
  -e MINIO_ENDPOINT="$MINIO_IP" \
  -e MINIO_PORT="9000" \
  -e MINIO_PUBLIC_URL="http://localhost:9000" \
  -e MINIO_ACCESS_KEY="minioadmin" \
  -e MINIO_SECRET_KEY="minioadmin" \
  -e NEO4J_URI="bolt://$NEO4J_IP:7687" \
  -e NEO4J_USER="neo4j" \
  -e NEO4J_PASSWORD="lasfloresdev123" \
  -e NEO4J_ENABLED="true" \
  -e JWT_SECRET="dev-secret" \
  -e LITELLM_BASE_URL="http://host.containers.internal:4000" \
  -e LITELLM_API_KEY="local-key" \
  -e LLM_MODEL="poolside/laguna-m.1" \
  -e LLM_PROVIDER="litellm" \
  las-flores-server
```

> **Alternative (`--add-host`)**: instead of raw IPs in env, inject `--add-host="las-flores-postgres-oltp:$OLTP_IP"` … and keep human-readable hostnames in `DATABASE_URL`/`REDIS_URL`/`MINIO_ENDPOINT`. Both patterns are verified working on this rootless host (no `aardvark-dns`). Note the `host.containers.internal:host-gateway` mapping is separate and required for host-side LiteLLM.

### Phase 4b: Build & start the admin panel (port 3002 → intake-worker:3001)

The admin panel talks to the **intake-worker** (port 3001), not the game-server.
Build the admin image and run it with `--add-host` so the container can resolve
`las-flores-intake-worker` to the intake-worker's IP. The browser uses
`NEXT_PUBLIC_SERVER_URL` (host:3001) and server-side route handlers use
`INTERNAL_SERVER_URL` (intake-worker:3001, resolved via `--add-host`).

```bash
podman build -f admin/Dockerfile -t las-flores-admin .
INTAKE_IP=$(podman inspect las-flores-intake-worker | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
podman run -d --name las-flores-admin \
  --network las-flores-net \
  --add-host="las-flores-intake-worker:$INTAKE_IP" \
  -p 127.0.0.1:3002:3000 \
  -v ./admin/src:/app/admin/src \
  -v ./shared:/app/shared \
  -e NODE_ENV=development \
  -e NEXT_PUBLIC_SERVER_URL=http://localhost:3001 \
  -e INTERNAL_SERVER_URL=http://las-flores-intake-worker:3001 \
  -e NEXT_PUBLIC_DEV_LOGIN_ENABLED=true \
  -e DEV_LOGIN_ENABLED=true \
  las-flores-admin
```

Verify the admin panel is up and can reach the intake-worker:

```bash
podman logs las-flores-admin | grep "Ready in"
podman exec las-flores-admin env | grep SERVER_URL
# Exercise the admin → intake-worker path directly from inside the admin
# container (node:20-alpine includes busybox wget):
podman exec las-flores-admin wget -qO- http://las-flores-intake-worker:3001/health
# expected: {"success":true,...}
```

### Phase 5: Apply Migrations (verify only)

`./scripts/apply-migrations.sh` is a **SQL-only** verify/`podman exec psql` tool. The
content migration (`migrateContent()`) runs inside the `intake-worker` at boot, so it
is **not** part of this script. After the intake-worker is healthy:

```bash
./scripts/apply-migrations.sh verify
```

### Phase 6: Health Check (authoritative)

```bash
# From INSIDE the container — image has no curl, and host-side curl often
# returns exit 56 on this rootless host even when the server is healthy.
podman exec las-flores-intake-worker wget -qO- http://localhost:3001/health
# expected: {"success":true,"data":{"status":"healthy",...}}
podman exec las-flores-server wget -qO- http://localhost:3000/health
# expected: {"success":true,"data":{"status":"healthy",...}}
```

Do NOT treat a host-side `curl http://localhost:3000/health` exit 56 as a server failure without the in-container confirmation above.

### Phase 7: Teardown

```bash
podman rm -f las-flores-server las-flores-intake-worker las-flores-admin \
  las-flores-neo4j las-flores-minio las-flores-redis \
  las-flores-postgres-olap las-flores-postgres-oltp
podman network rm las-flores-net
podman volume rm -f postgres-oltp-data postgres-olap-data redis-data minio-data neo4j-data
```

### Phase 8: Rootless networking fallback

If rootless networking fails with `exec: "pasta": executable file not found in $PATH`, install `slirp4netns` and set:

```ini
# ~/.config/containers/containers.conf
[engine]
network_backend = "cni"
[network]
default_rootless_network_cmd = "slirp4netns"
```

---

## Notes

- Fastest setup is the automated script: `./start-stack.sh` (see `docs/DEVELOPMENT_SETUP.md`).
- Integration tests need the stack. Use `./scripts/run-tests-podman.sh server/tests/<dir|file>` (path includes the `server/` prefix). See the `podman-dev` skill for the confirmed-green baseline and runner details.
- If container IPs change after recreate, re-run the Phase 3 discovery before restarting the server.
- There is **no `dashboard` image** — the admin panel (`las-flores-admin`) replaced it.
- The admin panel talks to **`intake-worker:3001`**, not the game-server. Set `NEXT_PUBLIC_SERVER_URL=http://localhost:3001` (browser) and `INTERNAL_SERVER_URL=http://las-flores-intake-worker:3001` (server-side, via `--add-host`).
