# Las Flores 2077 - Development Stack Setup Guide

This guide documents how to set up and run the complete Las Flores development stack. The project supports **two container runtimes**: Docker (via `docker-compose.yml`, the path documented in `AGENTS.md`) and Podman (via `start-stack.sh` and `scripts/apply-migrations.sh`). Pick one — both bring up the same services on the same host ports.

## Overview

The development stack consists of:
- **PostgreSQL OLTP** (port 5434) - Primary transactional database
- **PostgreSQL OLAP** (port 5433) - Analytics database  
- **Redis** (port 6379) - Session and cache store
- **MinIO** (ports 9000-9001) - Object storage for assets
- **Server** (port 3000) - Backend API
- **Admin UI** (port 3002 via `start-stack.sh`) - Next.js admin interface

## Prerequisites

Choose one container runtime:

- **Docker** (with Compose v2+) — primary path, used by `docker-compose.yml` and `AGENTS.md`
- **Podman** (v4.0+) — alternative path, used by `start-stack.sh` and `scripts/apply-migrations.sh`
- **jq** — JSON processor for container IP extraction (Podman path only)
- **Node.js** (optional) — only needed for local development, not for running containers

```bash
# Install Docker + Compose v2 on Debian/Ubuntu
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2

# Or install Podman + jq
sudo apt-get install -y podman jq

# Verify the selected runtime
# Docker:
docker --version
docker compose version

# Or Podman:
podman --version
jq --version
```

## Quick Start

### Docker (recommended)

```bash
# Clone and enter the repository
cd /path/to/las_flores_city

# Start all services (PostgreSQL, Redis, MinIO, server, admin, litellm)
docker compose up -d

# Apply database migrations (if the DB was freshly created)
# NOTE: scripts/apply-migrations.sh currently uses `podman exec` internally.
# On Docker, run the schema migration from inside the server container instead:
docker exec las-flores-server npm run schema:migrate
```

`docker-compose.yml` defines: `postgres-oltp` (5434), `postgres-olap` (5433), `redis` (6379), `minio` (9000-9001), `server` (3000), `admin` (3002), `litellm`, `playwright`.

Access the services:
- **Server API:** http://localhost:3000
- **Health Check:** `docker exec las-flores-server wget -qO- http://localhost:3000/health` (the alpine image has no curl; see `AGENTS.md` for the health-check gotcha)
- **Admin UI:** http://localhost:3002

### Podman (alternative)

The easiest way to start the entire stack with Podman:

```bash
# Clone and enter the repository
cd /path/to/las_flores_city

# Make the script executable
chmod +x start-stack.sh

# Run the full stack
./start-stack.sh
```

The script will:
1. Clean up existing containers
2. Create the podman network and volumes
3. Start backing services (PostgreSQL, Redis, MinIO)
4. Build and start the server
5. Build and start the admin panel
6. Apply database migrations
7. Output service URLs

Access the services:
- **Server API:** http://localhost:3000
- **Health Check:** http://localhost:3000/health
- **Admin UI:** http://localhost:3002 (mapped from container port 3000)

> Both runtimes expose the admin panel on host port 3002. The admin container internally listens on 3000; the host mapping is `3002:3000` in both `docker-compose.yml` and `start-stack.sh`.

## Manual Setup (For Debugging)

> The manual steps below are for the **Podman** path. Docker users rarely need manual setup — `docker compose up -d <service>` handles networking and volumes automatically. Use these steps only if you need fine-grained control over individual Podman containers.

If you need to start services individually:

### 1. Create Network and Volumes

```bash
podman network exists las-flores-net || podman network create las-flores-net
podman volume exists postgres-oltp-data || podman volume create postgres-oltp-data
podman volume exists postgres-olap-data || podman volume create postgres-olap-data
podman volume exists redis-data || podman volume create redis-data
podman volume exists minio-data || podman volume create minio-data
```

### 2. Start Backing Services

```bash
# PostgreSQL OLTP
podman run -d \
  --name las-flores-postgres-oltp \
  --network las-flores-net \
  -p 5434:5432 \
  -v postgres-oltp-data:/var/lib/postgresql/data \
  -e POSTGRES_DB=las_flores \
  -e POSTGRES_USER=las_flores \
  -e POSTGRES_PASSWORD=las_flores_dev_password \
  docker.io/library/postgres:16-alpine

# PostgreSQL OLAP
podman run -d \
  --name las-flores-postgres-olap \
  --network las-flores-net \
  -p 5433:5432 \
  -v postgres-olap-data:/var/lib/postgresql/data \
  -e POSTGRES_DB=las_flores_analytics \
  -e POSTGRES_USER=las_flores_analytics \
  -e POSTGRES_PASSWORD=las_flores_analytics_dev_password \
  docker.io/library/postgres:16-alpine

# Redis
podman run -d \
  --name las-flores-redis \
  --network las-flores-net \
  -p 6379:6379 \
  -v redis-data:/data \
  docker.io/library/redis:7-alpine

# MinIO
podman run -d \
  --name las-flores-minio \
  --network las-flores-net \
  -p 9000:9000 -p 9001:9001 \
  -v minio-data:/data \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  docker.io/minio/minio:latest \
  server /data --console-address ":9001"
```

### 3. Get Service IP Addresses

Since Podman doesn't have built-in container name DNS resolution, we need to get IPs:

```bash
OLTP_IP=$(podman inspect las-flores-postgres-oltp 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
OLAP_IP=$(podman inspect las-flores-postgres-olap 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
REDIS_IP=$(podman inspect las-flores-redis 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
MINIO_IP=$(podman inspect las-flores-minio 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')

echo "OLTP: $OLTP_IP, OLAP: $OLAP_IP, REDIS: $REDIS_IP, MINIO: $MINIO_IP"
```

### 4. Build and Start Server

```bash
# Build the server image
podman build -t las-flores-server -f server/Dockerfile .

# Run the server with host mappings for DNS resolution
podman run -d \
  --name las-flores-server \
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
  -e PROMPT_ROOT="/app/content" \
  las-flores-server
```

**Important:** The `PROMPT_ROOT` environment variable must point to `/app/content` because the server's working directory is `/app/server`, and without this explicit setting it would look for `/app/server/content` (which doesn't exist). The modern pipeline scans `content/characters/*`, `content/locations/*`, `content/scenes/*`, etc. for prompt files.

### 5. Build and Start Admin UI

```bash
# Build the admin image
podman build -t las-flores-admin -f admin/Dockerfile .

# Run the admin container
SERVER_IP=$(podman inspect las-flores-server 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
podman run -d \
  --name las-flores-admin \
  --network las-flores-net \
  --add-host="las-flores-server:$SERVER_IP" \
  -p 3002:3000 \
  -v ./admin:/app/admin \
  -v ./shared:/app/shared \
  -e NODE_ENV=development \
  -e NEXT_PUBLIC_SERVER_URL=http://las-flores-server:3000 \
  las-flores-admin
```

### 6. Apply Database Migrations

```bash
./scripts/apply-migrations.sh both
```

Note: The migration script uses `podman` (not `docker`). If you see `docker: command not found` errors, the script needs to be updated.

## Service URLs

| Service | URL | Port |
|---------|-----|------|
| Server API | http://localhost:3000 | 3000 |
| Server Health | http://localhost:3000/health | 3000 |
| Admin UI | http://localhost:3002 | 3002 |
| PostgreSQL OLTP | localhost:5434 | 5434 |
| PostgreSQL OLAP | localhost:5433 | 5433 |
| Redis | localhost:6379 | 6379 |
| MinIO Console | http://localhost:9001 | 9001 |

## API Endpoints

### Health
```bash
curl http://localhost:3000/health
```

### Asset Prompt Catalog
Returns all asset categories and prompt files:
```bash
curl http://localhost:3000/assets/prompt-catalog | jq '.data.categories'
```

### Asset List (by prompt_rel)
```bash
curl "http://localhost:3000/assets/list?prompt_rel=isometric-map/assets/lm_electra"
```

### Asset List All
Returns all asset groups:
```bash
curl http://localhost:3000/assets/list-all
```

## Known Issues & Fixes

### 1. `docker: command not found` in migrations
**Fix:** The migration script (`scripts/apply-migrations.sh`) was updated to use `podman` instead of `docker`.

### 2. `npm: command not found` when starting admin
**Fix:** Modified `start-stack.sh` to build and run the admin UI in a podman container instead of requiring npm on the host.

### 3. Container name resolution fails (aardvark-dns not found)
**Fix:** Added `--add-host` flags to map container names to their IP addresses. The `get_container_ip()` function in `start-stack.sh` uses `jq` to extract IPs from podman inspect output.

### 4. Assets not visible in admin UI
**Fix:** Added `PROMPT_ROOT="/app/content"` environment variable to the server container. Without this, the server looks for prompts in `/app/server/content` (wrong path).

## Troubleshooting

### Check running containers
```bash
podman ps --format "{{.Names}}: {{.Status}} ({{.Ports}})"
```

### View container logs
```bash
podman logs las-flores-server
podman logs las-flores-admin
```

### Test database connections
```bash
# PostgreSQL OLTP
podman exec las-flores-postgres-oltp pg_isready -h localhost -p 5432

# PostgreSQL OLAP
podman exec las-flores-postgres-olap pg_isready -h localhost -p 5432

# Redis
podman exec las-flores-redis redis-cli ping
```

### Test API endpoints
```bash
# Health check
curl -s http://localhost:3000/health | jq

# Prompt catalog
curl -s http://localhost:3000/assets/prompt-catalog | jq '.data.categories | length'

# Should return 3 categories and 51+ entries
```

### Restart a specific service
```bash
# Stop and remove
podman stop las-flores-server
podman rm las-flores-server

# Restart with updated code
# (Use the commands from Manual Setup section)
```

### Clean everything and start fresh
```bash
# Remove all containers
podman rm -f las-flores-postgres-oltp las-flores-postgres-olap las-flores-redis las-flores-minio las-flores-server

# Remove volumes (if needed)
podman volume rm -f postgres-oltp-data postgres-olap-data redis-data minio-data

# Remove network (if needed)
podman network rm las-flores-net

# Then run start-stack.sh again
./start-stack.sh
```

## File Structure

```text
las_flores_city/
├── start-stack.sh          # Main startup script
├── scripts/
│   └── apply-migrations.sh  # Database migrations (uses podman)
├── server/
│   ├── Dockerfile           # Server container definition
│   └── src/
│       ├── routes/
│       │   └── assets.ts     # Asset API routes
│       └── routes/
│           └── assets.helpers.ts  # Prompt catalog functions
├── admin/
│   └── Dockerfile           # Admin UI container definition
├── docs/
│   └── lore/
│       └── assets/
│           └── ui-concepts/   # Legacy PROMPT_ROOT (see env vars below)
└── shared/                 # Shared TypeScript types and schemas
```

## Environment Variables

### Server Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| DATABASE_URL | postgresql://... | OLTP database connection |
| ANALYTICS_DATABASE_URL | postgresql://... | OLAP database connection |
| REDIS_URL | redis://las-flores-redis:6379 | Redis connection |
| MINIO_ENDPOINT | las-flores-minio | MinIO host |
| MINIO_PORT | 9000 | MinIO port |
| MINIO_ACCESS_KEY | minioadmin | MinIO access key |
| MINIO_SECRET_KEY | minioadmin | MinIO secret key |
| JWT_SECRET | your-jwt-secret... | JWT signing secret |
| PROMPT_ROOT | /app/content | Path to content root (prompt files scanned under `content/characters/*`, `content/locations/*`, etc.) |

### Admin Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| NODE_ENV | development | Node.js environment |

## Tips for Development

1. **Live code reloading:** The server uses `tsx watch`, so changes to files in `./server/src` are automatically picked up (no need to restart the container).

2. **Volume mounts:** All source directories are volume-mounted, so you can edit files on your host and see changes immediately.

3. **Database access:** You can connect to PostgreSQL directly:
   ```bash
   podman exec -it las-flores-postgres-oltp psql -U las_flores -d las_flores
   ```

4. **MinIO access:** Use the MinIO console at http://localhost:9001 (user: minioadmin, pass: minioadmin)

5. **Adding new prompt files:** Place `.prompt.md` files in the appropriate `content/<type>/<slug>/` folder (e.g. `content/characters/<slug>/<slug>.prompt.md`) and they will automatically appear in the prompt catalog.
