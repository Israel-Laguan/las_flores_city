---
description: Run, start, stop, or manage the Podman development environment for Las Flores 2077. Use when the user asks to bring up, tear down, or check the Podman stack. Do not use Docker commands when the target is Podman.
allowed-tools: bash
argument-hint: "[start|stop|status|health|test <path>]"
---

Use this command when the user asks to run, start, stop, or manage the Podman development environment for Las Flores 2077. Do not use Docker commands when the target is Podman.

## Quick Start

For the fastest setup, use the automated script:

```bash
./start-stack.sh
```

## Manual Start

### 1. Create network and volumes

```bash
podman network create las-flores-net
podman volume create postgres-oltp-data
podman volume create postgres-olap-data
podman volume create redis-data
podman volume create minio-data
```

### 2. Start backing services

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
```

### 3. Build server image

```bash
podman build -f server/Dockerfile -t las-flores-server .
```

### 4. Get container IPs for DNS resolution

```bash
OLTP_IP=$(podman inspect las-flores-postgres-oltp | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
OLAP_IP=$(podman inspect las-flores-postgres-olap | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
REDIS_IP=$(podman inspect las-flores-redis | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
MINIO_IP=$(podman inspect las-flores-minio | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
```

### 5. Start server with DNS resolution

```bash
podman run -d --name las-flores-server \
  --network las-flores-net \
  --add-host="las-flores-postgres-oltp:$OLTP_IP" \
  --add-host="las-flores-postgres-olap:$OLAP_IP" \
  --add-host="las-flores-redis:$REDIS_IP" \
  --add-host="las-flores-minio:$MINIO_IP" \
  -p 3000:3000 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./content:/app/content \
  -v ./docs:/app/docs:ro \
  -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@las-flores-postgres-oltp:5432/las_flores" \
  -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@las-flores-postgres-olap:5432/las_flores_analytics" \
  -e REDIS_URL="redis://las-flores-redis:6379" \
  -e MINIO_ENDPOINT="las-flores-minio" \
  -e MINIO_PORT="9000" \
  -e MINIO_ACCESS_KEY="minioadmin" \
  -e MINIO_SECRET_KEY="minioadmin" \
  -e JWT_SECRET="dev-secret" \
  -e PROMPT_ROOT="/app/content" \
  las-flores-server
```

> **Note on DNS:** This relies on `--add-host` (injected into the server's
> `/etc/hosts`). Because rootless Podman here has **no `aardvark-dns`**, you
> cannot use bare container names in `DATABASE_URL` without `--add-host`. The
> simpler, equally-valid alternative is to put the raw container IPs directly in
> the env vars — see the IP-discovery snippet in [podman-ops.md](./podman-ops.md).

### 6. Build and start dashboard

```bash
podman build -f dashboard/Dockerfile -t las-flores-dashboard .
podman run -d --name las-flores-dashboard \
  --network las-flores-net \
  --add-host="las-flores-postgres-oltp:$OLTP_IP" \
  --add-host="las-flores-postgres-olap:$OLAP_IP" \
  --add-host="las-flores-redis:$REDIS_IP" \
  --add-host="las-flores-minio:$MINIO_IP" \
  -p 3001:3000 \
  -v ./dashboard:/app/dashboard \
  -v ./shared:/app/shared \
  -v ./client:/app/client \
  -v ./server:/app/server \
  -e NODE_ENV=development \
  las-flores-dashboard
```

### 7. Apply migrations

```bash
./scripts/apply-migrations.sh both
```

## Status

```bash
podman ps --filter name=las-flores
```

## Health

```bash
# Authoritative: verify from INSIDE the container (image has no curl, and
# host-side curl often returns exit 56 on this rootless host even when healthy)
podman exec las-flores-server wget -qO- http://localhost:3000/health
# expected: {"success":true,"data":{"status":"healthy",...}}
```

## Running Tests (jump-in)

The integration tests and health check require the Podman stack. Use the bundled
runner, which launches a `node:20` container on `--network host` so it reaches the
backing services through the host-mapped ports (localhost:5434/5433/6379). It
reads env from `.env` (`DATABASE_URL`, `REDIS_URL`, `ANALYTICS_DATABASE_URL`,
`MINIO_*`, `JWT_SECRET`).

**Path quirk:** the test path is relative to the repo root AND must include the
`server/` prefix (the runner does `cd server && npm test -- <path>`):

```bash
# Full integration suite (needs the stack up + migrations applied)
./scripts/run-tests-podman.sh server/tests/integration

# Unit / smoke only
./scripts/run-tests-podman.sh server/tests/unit
./scripts/run-tests-podman.sh server/tests/smoke

# A single file
./scripts/run-tests-podman.sh server/tests/integration/story-builder-drafts.test.ts
```

Confirmed-green baseline (run 2026-07-16 on this Podman stack):
- `npm run lint --workspace=server` → clean
- `npm run build --workspace=server` → clean
- `run-tests-podman.sh server/tests/unit` → 42 suites / 512 tests
- `run-tests-podman.sh server/tests/integration` → 35 suites / 269 tests
  (includes `story-builder-drafts.test.ts`, `story-builder-plans.test.ts`, etc.)
- `podman exec las-flores-server wget -qO- http://localhost:3000/health` → healthy

Host-equivalent (if node + deps are installed locally): `npm run test --workspace=server`.

## Logs

```bash
podman logs las-flores-server
podman logs las-flores-postgres-oltp
```

## Stop

```bash
podman rm -f las-flores-server las-flores-dashboard
podman rm -f las-flores-postgres-oltp
podman rm -f las-flores-postgres-olap
podman rm -f las-flores-redis
podman rm -f las-flores-minio
```

## Remove volumes

```bash
podman volume rm -f postgres-oltp-data postgres-olap-data redis-data minio-data
```

## See Also

- [podman-ops.md](./podman-ops.md) - Operational guidelines
- [../../docs/DEVELOPMENT_SETUP.md](../../docs/DEVELOPMENT_SETUP.md) - Complete setup guide
- [../../start-stack.sh](../../start-stack.sh) - Automated startup script
