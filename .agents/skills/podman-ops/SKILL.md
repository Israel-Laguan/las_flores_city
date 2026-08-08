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
- `PROMPT_ROOT` must be `/app/content` for asset visibility (the pipeline scans `content/characters/*`, `content/locations/*`, etc.).

---

## Steps

### Phase 1: Network & Volumes (one-time)

```bash
podman network create las-flores-net
podman volume create postgres-oltp-data
podman volume create postgres-olap-data
podman volume create redis-data
podman volume create minio-data
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
```

### Phase 3: Container IP Discovery

```bash
OLTP_IP=$(podman inspect las-flores-postgres-oltp  | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
OLAP_IP=$(podman inspect las-flores-postgres-olap  | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
REDIS_IP=$(podman inspect las-flores-redis        | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
MINIO_IP=$(podman inspect las-flores-minio        | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
```

### Phase 4: Build & Run Server (IP-based env)

```bash
podman build -f server/Dockerfile -t las-flores-server .

podman run -d --name las-flores-server \
  --network las-flores-net \
  -p 3000:3000 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./content:/app/content \
  -v ./docs:/app/docs:ro \
  -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@$OLTP_IP:5432/las_flores" \
  -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@$OLAP_IP:5432/las_flores_analytics" \
  -e REDIS_URL="redis://$REDIS_IP:6379" \
  -e MINIO_ENDPOINT="$MINIO_IP" \
  -e MINIO_PORT="9000" \
  -e MINIO_ACCESS_KEY="minioadmin" \
  -e MINIO_SECRET_KEY="minioadmin" \
  -e JWT_SECRET="dev-secret" \
  -e PROMPT_ROOT="/app/content" \
  las-flores-server
```

> **Alternative (`--add-host`)**: instead of raw IPs in env, inject `--add-host="las-flores-postgres-oltp:$OLTP_IP"` … and keep human-readable hostnames in `DATABASE_URL`/`REDIS_URL`/`MINIO_ENDPOINT`. Both patterns are verified working on this rootless host (no `aardvark-dns`).

### Phase 5: Apply Migrations

```bash
./scripts/apply-migrations.sh both
```

### Phase 6: Health Check (authoritative)

```bash
# From INSIDE the container — image has no curl, and host-side curl often
# returns exit 56 on this rootless host even when the server is healthy.
podman exec las-flores-server wget -qO- http://localhost:3000/health
# expected: {"success":true,"data":{"status":"healthy",...}}
```

Do NOT treat a host-side `curl http://localhost:3000/health` exit 56 as a server failure without the in-container confirmation above.

### Phase 7: Teardown

```bash
podman rm -f las-flores-server las-flores-dashboard \
  las-flores-postgres-oltp las-flores-postgres-olap \
  las-flores-redis las-flores-minio
podman network rm las-flores-net
podman volume rm -f postgres-oltp-data postgres-olap-data redis-data minio-data
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
