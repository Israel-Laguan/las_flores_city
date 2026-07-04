# Agent Guidelines

This file captures durable agent-facing guidance for Las Flores 2077. Human-facing project docs remain in `README.md` and `docs/`.

## Hard constraints

- Use the existing database/cache/event patterns: `oltpPool` / `withOLTPTransaction`, `getCache` / `setCache` / `deleteCache`, and `queryOLAP(...)`. Do not introduce new pools or alternate cache layers.
- If a task spec conflicts with established codebase patterns, follow the established pattern and surface the drift before changing behavior.
- Verify alleged missing variables by reading the relevant file end-to-end or grepping before scheduling a fix.
- Sudo operations require user confirmation. Present the exact command, explain the expected result, wait for the user to confirm it ran, then verify the fix.
- Test fixtures that create rows must use a dedicated UUID or `gen_random_uuid()`, clean up in `afterAll`, and include a collision-avoidance comment.
- Integration tests that touch `player_mysteries` must create their own test user in `beforeAll` and clean it up in `afterAll`.
- After server code changes, rebuild and restart the server container: `docker compose build server && docker compose up -d server`. Verify with `docker exec las-flores-server wget -qO- http://localhost:3000/health` (not curl — see health check gotcha below).

## Current codebase facts

- Content migration now recognizes `/mysteries/` as a content type: `server/src/content/migrate.ts:87` and `server/src/content/validate.ts:193`.
- Dialogue overlays are stored with both `modifications` and `nodes`; `upsertDialogueOverlay()` writes both columns: `server/src/content/migrate.ts:148-178`.
- The resolver reads `dialogue_overlays.nodes` for mystery overlays: `server/src/services/DialogueResolver.ts:146-160`.
- Mystery overlay YAML should follow `OverlaySchema` with `nodes`: `shared/src/schemas/overlay.ts:14-38`.
- `player_dialogue_states` tracks position with `current_node_id`; `users.active_dialogue_id` tracks the active tree.
- OLAP `player_events` uses `event_data`, `created_at`, and `time_blocks_cost`. Do not use `data`, `occurred_at`, or `event_data->>'tb_cost'`.
- `mysteries.status` has a CHECK constraint for `ACTIVE`, `RESOLVING`, and `ARCHIVED`; adding a new status requires rewriting the CHECK constraint: `server/src/database/migrations/021_leaderboards.sql:49-53`.

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
