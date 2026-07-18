---
name: podman-ops
description: Enforces correct Podman operational patterns for Las Flores 2077 when running the stack with Podman instead of Docker. Use for container IP discovery, server startup env vars, health checks, and teardown.
mode: subagent
color: "#F59E0B"
permission:
  bash: allow
  edit: deny
  read: allow
---

When the project is run with Podman instead of Docker, enforce the correct operational patterns.

- Do not suggest `docker compose`, `docker exec`, or `docker logs`. Use `podman` equivalents.
- Start services on the `las-flores-net` bridge network.
- **Critical**: In this rootless Podman setup, `aardvark-dns` is unavailable. Container-to-container URLs must use the IPs returned by `podman network inspect las-flores-net`, **not** hostnames or `localhost`.
- Server env vars must use IPs from the network inspection:
  - `DATABASE_URL`: `postgresql://las_flores:las_flores_dev_password@<PG_OLTP_IP>:5432/las_flores`
  - `ANALYTICS_DATABASE_URL`: `postgresql://las_flores_analytics:las_flores_analytics_dev_password@<PG_OLAP_IP>:5432/las_flores_analytics`
  - `REDIS_URL`: `redis://<REDIS_IP>:6379`
  - `MINIO_ENDPOINT`: `<MINIO_IP>:9000`
- **PROMPT_ROOT**: Must be set to `/app/content` for asset visibility (the pipeline scans `content/characters/*`, `content/locations/*`, etc.)
- Health checks: the authoritative check is **from inside the container** with `podman exec las-flores-server wget -qO- http://localhost:3000/health` (the server image is alpine-based and has no `curl`). Host-side `curl http://localhost:3000/health` may return exit 56 on this rootless host even when the server is healthy — do not treat that as a server failure without the in-container confirmation.
- Teardown must remove containers, the network, and volumes using `podman rm`, `podman network rm`, and `podman volume rm`.
- If rootless networking fails with `pasta` missing, configure `slirp4netns` in `~/.config/containers/containers.conf` under `[network]`.

## Quick Start

For the fastest setup, use the automated script:

```bash
chmod +x start-stack.sh
./start-stack.sh
```

See [docs/DEVELOPMENT_SETUP.md](../../docs/DEVELOPMENT_SETUP.md) for complete documentation.

## Container IP Discovery

Use `jq` to extract IPs from podman inspect:

```bash
OLTP_IP=$(podman inspect las-flores-postgres-oltp 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
OLAP_IP=$(podman inspect las-flores-postgres-olap 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
REDIS_IP=$(podman inspect las-flores-redis 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
MINIO_IP=$(podman inspect las-flores-minio 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
```

## Example server run command

```bash
# First get the IPs
OLTP_IP=$(podman inspect las-flores-postgres-oltp | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
OLAP_IP=$(podman inspect las-flores-postgres-olap | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
REDIS_IP=$(podman inspect las-flores-redis | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
MINIO_IP=$(podman inspect las-flores-minio | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')

# Preferred: put the raw IPs straight into the env vars (no /etc/hosts reliance)
podman run -d --name las-flores-server \
  --network las-flores-net \
  -p 3000:3000 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./content:/app/content \
  -v ./docs:/docs:ro \
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

> **Alternative (used by `start-stack.sh`):** inject names via `--add-host` and
> keep the human-readable hostnames in the env vars:
> `--add-host="las-flores-postgres-oltp:$OLTP_IP"` … with
> `DATABASE_URL=…@las-flores-postgres-oltp:5432/…`. Both patterns were verified
> working on this rootless host (no `aardvark-dns`).

**Note**: `JWT_SECRET` must match what the client/dev-login expects. Use
`dev-secret` for local testing (matches repo `.env`); the old
`your-jwt-secret-change-in-production` value breaks dev-login.

## Running tests

Integration tests need the stack. Use `./scripts/run-tests-podman.sh
server/tests/<dir|file>` (path includes the `server/` prefix). See
[podman-dev.md](./podman-dev.md) for details and the confirmed-green baseline.
