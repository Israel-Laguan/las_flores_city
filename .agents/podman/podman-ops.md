# Podman Ops Agent

> **Note**: This documentation has been moved from `.kilo/agent/podman-ops.md` to `.agents/podman/podman-ops.md` for accessibility by all agents.

When the project is run with Podman instead of Docker, this agent enforces the correct operational patterns.

- Do not suggest `docker compose`, `docker exec`, or `docker logs`. Use `podman` equivalents.
- Start services on the `las-flores-net` bridge network.
- **Critical**: In this rootless Podman setup, `aardvark-dns` is unavailable. Container-to-container URLs must use the IPs returned by `podman network inspect las-flores-net`, **not** hostnames or `localhost`.
- Server env vars must use IPs from the network inspection:
  - `DATABASE_URL`: `postgresql://las_flores:las_flores_dev_password@<PG_OLTP_IP>:5432/las_flores`
  - `ANALYTICS_DATABASE_URL`: `postgresql://las_flores_analytics:las_flores_analytics_dev_password@<PG_OLAP_IP>:5432/las_flores_analytics`
  - `REDIS_URL`: `redis://<REDIS_IP>:6379`
  - `MINIO_ENDPOINT`: `<MINIO_IP>:9000`
- **PROMPT_ROOT**: Must be set to `/app/docs/lore/assets/ui-concepts` for asset visibility
- Health checks should be run from the host with `curl http://localhost:3000/health`. If host curl returns exit 56, verify from inside the container with `podman exec las-flores-server wget -qO- http://localhost:3000/health`.
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
  -e JWT_SECRET="your-jwt-secret-change-in-production" \
  -e PROMPT_ROOT="/app/docs/lore/assets/ui-concepts" \
  las-flores-server
```

**Note**: The `--add-host` flags work around Podman's lack of container name DNS resolution. Container names in env vars (like `las-flores-postgres-oltp`) will be resolved via `/etc/hosts` entries.

## See Also

- [podman-dev.md](./podman-dev.md) - Command reference
- [../../docs/DEVELOPMENT_SETUP.md](../../docs/DEVELOPMENT_SETUP.md) - Complete setup guide
- [../../start-stack.sh](../../start-stack.sh) - Automated startup script
