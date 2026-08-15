# Las Flores 2077 - Development Stack Setup Guide

This guide documents how to set up and run the complete Las Flores development stack. The project supports **two container runtimes**: Docker (via `docker-compose.yml`, the path documented in `AGENTS.md`) and Podman (via `start-stack.sh` and `scripts/apply-migrations.sh`). Pick one — both bring up the same services on the same host ports.

## Overview

The development stack consists of:
- **PostgreSQL OLTP** (port 5434) - Primary transactional database
- **PostgreSQL OLAP** (port 5433) - Analytics database  
- **Redis** (port 6379) - Session and cache store
- **MinIO** (ports 9000-9001) - Object storage for assets
- **Neo4j** (ports 7474/7687) - Graph authoring canvas (M27; internal-only, optional)
- **LiteLLM** (port 4000) - LLM proxy for story builder (runs on host)
- **intake-worker** (port 3001) - Migration owner + admin/AI/content engine (the only process that runs migrations)
- **Server** (port 3000) - Game-server API (reads content tables the intake-worker creates)
- **Admin UI** (port 3002) - Next.js admin interface (talks to intake-worker:3001)

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

`docker-compose.yml` defines: `postgres-oltp` (5434), `postgres-olap` (5433), `redis` (6379), `minio` (9000-9001), `neo4j` (7474/7687), `server` (3000), `intake-worker` (3001, migration owner + admin/AI/content), `admin` (3002), `litellm`, `playwright`.

Access the services:
- **Server API:** http://localhost:3000
- **Health Check:** `docker exec las-flores-server wget -qO- http://localhost:3000/health` (the alpine image has no curl; see `AGENTS.md` for the health-check gotcha)
- **Admin UI:** http://localhost:3002

### Podman (alternative)

The easiest way to start the entire stack with Podman:

```bash
# Clone and enter the repository
cd /path/to/las_flores_city

# Start the full stack (databases + server + admin)
./scripts/podman-workflow.sh setup

# Or start admin panel separately (requires server already running)
./scripts/podman-workflow.sh admin
```

The script will:
1. Create the podman network and volumes (one-time)
2. Start backing services (PostgreSQL, Redis, MinIO, Neo4j)
3. Build the server image and start the `intake-worker` (migration owner, port 3001)
4. Wait for the intake-worker to be healthy, then start the game-server (port 3000)
5. Start the admin panel (talks to intake-worker:3001)
6. Output service URLs

Access the services:
- **Server API:** http://localhost:3000
- **Health Check:** http://localhost:3000/health
- **Admin UI:** http://localhost:3002 (mapped from container port 3000)

> Both runtimes expose the admin panel on host port 3002. The admin container internally listens on 3000; the host mapping is `3002:3000` in both `docker-compose.yml` and `start-stack.sh`.

### Podman Workflow Commands

```bash
# Full setup (build images, start services, apply migrations)
./scripts/podman-workflow.sh setup

# Start admin panel only (requires server running)
./scripts/podman-workflow.sh admin

# Check status of all services
./scripts/podman-workflow.sh status

# Clean up all containers and volumes
./scripts/podman-workflow.sh clean
```

## LiteLLM Setup (Required for Story Builder)

The Story Builder pipeline requires an LLM to generate content plans, lore, and prompts. LiteLLM acts as a unified proxy to LLM providers (Poolside, OpenRouter, etc.).

### Why litellm runs on the host (not in a container)

The litellm container can't reach external APIs (poolside.ai, openrouter.ai) because:
- Podman rootless without `aardvark-dns` means containers have no DNS resolution
- External HTTPS endpoints fail with `Temporary failure in name resolution`

**Solution**: Run litellm on the host where DNS works, and have the server container reach it via `host.containers.internal`.

### Start litellm

```bash
# Start litellm on the host (background)
litellm --config ~/litellm_config/config.yaml --port 4000 &

# Verify it's running
sleep 3 && curl -s http://localhost:4000/health
```

The config file (`~/litellm_config/config.yaml`) should contain:
```yaml
model_list:
  - model_name: poolside/laguna-m.1
    litellm_params:
      model: openai/poolside/laguna-m.1
      api_key: <your-poolside-api-key>
      api_base: https://inference.poolside.ai/v1
  - model_name: openrouter/owl-alpha
    litellm_params:
      model: openrouter/owl-alpha
      api_key: <your-openrouter-api-key>
      api_base: https://openrouter.ai/api/v1
      modify_params: True

general_settings:
  master_key: local-key
```

### Server environment for LLM

When starting the server container, add these env vars:

```bash
-e LITELLM_BASE_URL=http://host.containers.internal:4000 \
-e LITELLM_API_KEY=local-key \
-e LLM_PROVIDER=litellm \
-e LLM_MODEL=poolside/laguna-m.1 \
```

**Critical**: `LLM_PROVIDER` defaults to `mock` if not set. The mock provider returns minimal deterministic plans (1 item, 0 asset needs) — useful for testing the pipeline mechanically but won't generate real content.

### Story Builder Troubleshooting

#### Files not appearing in `content/` folder

**Symptom**: You run `POST /admin/story-builder/plan` successfully (returns `{success: true, scaffolded_at: ...}`) but no files appear in the host's `content/` directory.

**Root Cause**: The `resolveContentDir()` function in `StoryBuilderLore.ts` uses `process.cwd()` which is `/app/server` (where `tsx watch` runs from), causing files to be written to `/app/server/content/` instead of `/app/content/`. The volume mount `./content:/app/content` means files must go to `/app/content` in the container.

**Fix Applied**: Update `StoryBuilderLore.ts` to use `__dirname` with correct relative path:
```typescript
export function resolveContentDir(): string {
  // From /app/server/src/services/: ../../../content = /app/content
  return path.resolve(__dirname, '../../../content');
}
```

**Verification**: After restarting the server, check logs for:
```
[story-builder] Writing file: /app/content/characters/name/char_name.yaml
```
Files should now appear in the host's `content/` directory.

#### Template literal bug in lore/prompt file names

**Symptom**: Files are created but lore/prompt stubs have literal names like `${item.slug}.md` instead of `character_name.md`.

**Root Cause**: `tsx` does not evaluate template literals in imported TypeScript files. Lines 63 and 66 of `admin-story-builder-generate.ts` use `${item.slug}.md` which is written as a literal string.

**Fix**: Replace template literals with string concatenation:
```typescript
// Line 63
const lorePath = path.join(contentDir, filePath.replace(/[^/]+$/, ''), item.slug + '.md');
// Line 66  
const promptPath = path.join(contentDir, filePath.replace(/[^/]+$/, ''), item.slug + '.prompt.md');
```

#### tsx module caching

**Symptom**: Code changes don't take effect even after saving.

**Root Cause**: `tsx watch` caches compiled modules. Changes to TypeScript files may not be picked up immediately.

**Fix**: 
1. Wait for automatic reload (tsx watches for changes)
2. Or force reload: `podman exec las-flores-server pkill -f "tsx watch"`
3. Or restart container: `podman restart las-flores-server`

## Manual Setup (For Debugging)

> The manual steps below are for the **Podman** path. Docker users rarely need manual setup — `docker compose up -d <service>` handles networking and volumes automatically. Use these steps only if you need fine-grained control over individual Podman containers.

If you need to start services individually, prefer the `podman-workflow.sh` script:

```bash
# Start the full stack
./scripts/podman-workflow.sh setup

# Or start admin panel only (requires server running)
./scripts/podman-workflow.sh admin
```

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
NEO4J_IP=$(podman inspect las-flores-neo4j 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')

echo "OLTP: $OLTP_IP, OLAP: $OLAP_IP, REDIS: $REDIS_IP, MINIO: $MINIO_IP, Neo4j: $NEO4J_IP"
```

### 4. Build and Start `intake-worker` FIRST (migration owner, port 3001)

The `intake-worker` is the **only** process that runs `runAllMigrations()` (SQL schema **and** `migrateContent()` content migration). The game-server (Step 5) never migrates — it reads the content tables the intake-worker creates. Start the intake-worker first and wait for its `/health` before starting the game-server.

```bash
# Build the single server image (runs BOTH server + intake-worker)
podman build -t las-flores-server -f server/Dockerfile .

podman run -d \
  --name las-flores-intake-worker \
  --network las-flores-net \
  --add-host="host.containers.internal:host-gateway" \
  -p 3001:3001 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./infra:/app/infra \
  -v ./content:/app/content \
  -v ./docs:/app/docs:ro \
  -e NODE_ENV=development \
  -e PORT=3001 \
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
  las-flores-server npm run dev:intake --workspace=server
```

Wait until healthy (in-container `wget`; the alpine image has no `curl`):

```bash
podman exec las-flores-intake-worker wget -qO- http://localhost:3001/health
# expected: {"success":true,...}  (content tables now exist)
```

### 5. Build and Start the Game-Server (port 3000)

Same environment as the intake-worker, but the default CMD (`npm run dev`), no `PORT` override, host port 3000, and container name `las-flores-server`.

```bash
podman run -d \
  --name las-flores-server \
  --network las-flores-net \
  --add-host="host.containers.internal:host-gateway" \
  -p 3000:3000 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./infra:/app/infra \
  -v ./content:/app/content \
  -v ./docs:/app/docs:ro \
  -e NODE_ENV=development \
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

The `PROMPT_ROOT` environment variable is **not** required: the app default
`resolveContentDir()` already resolves to `/app/content` inside the container (the
workspace script runs from `/app/server`), matching `docker-compose.yml`.

### 6. Build and Start Admin UI

The admin panel talks to the **intake-worker (port 3001)**, not the game-server. The browser uses `NEXT_PUBLIC_SERVER_URL` (`localhost:3001`) and the server-side route handlers use `INTERNAL_SERVER_URL` (`intake-worker:3001`, resolved via `--add-host`).

```bash
# Build the admin image
podman build -t las-flores-admin -f admin/Dockerfile .

# Run the admin container
INTAKE_IP=$(podman inspect las-flores-intake-worker 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress')
podman run -d \
  --name las-flores-admin \
  --network las-flores-net \
  --add-host="las-flores-intake-worker:$INTAKE_IP" \
  -p 3002:3000 \
  -v ./admin/src:/app/admin/src \
  -v ./shared:/app/shared \
  -e NODE_ENV=development \
  -e NEXT_PUBLIC_SERVER_URL=http://localhost:3001 \
  -e INTERNAL_SERVER_URL=http://las-flores-intake-worker:3001 \
  las-flores-admin
```

### 7. Verify Migrations

`./scripts/apply-migrations.sh` is a **SQL-only** verify tool (it `podman exec` psql
directly into the databases). The content migration (`migrateContent()`) runs inside
the `intake-worker` at boot, so it is **not** part of this script. After the
intake-worker is healthy:

```bash
./scripts/apply-migrations.sh verify
```

## Service URLs

| Service | URL | Port |
|---------|-----|------|
| intake-worker API | http://localhost:3001 | 3001 |
| Server (game) API | http://localhost:3000 | 3000 |
| Server Health | http://localhost:3000/health | 3000 |
| Admin UI | http://localhost:3002 | 3002 |
| Neo4j Browser | http://localhost:7474 | 7474 |
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

### 4. `podman-compose` doesn't expand `${VAR:-default}` syntax
**Symptom:** Containers receive literal `${POSTGRES_PASSWORD:-las_flores_dev_password}` instead of `las_flores_dev_password`, causing password authentication failures.
**Fix:** Use `podman run` with explicit `-e POSTGRES_PASSWORD=las_flores_dev_password` instead of relying on `podman-compose` for env var expansion. Or export the variables before running `podman-compose`.

### 5. litellm container can't reach external APIs
**Symptom:** `socket.gaierror: [Errno -3] Temporary failure in name resolution` when litellm tries to call poolside.ai or openrouter.ai.
**Fix:** Run litellm on the host (not in a container). The server container reaches it via `--add-host=host.containers.internal:host-gateway`. See the LiteLLM Setup section above.

### 6. Server LLM calls return minimal plans (1 item, 0 needs)
**Symptom:** `LLM_PROVIDER` defaults to `mock`, which returns deterministic minimal plans.
**Fix:** Set `LLM_PROVIDER=litellm` in the server container environment.

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
| REDIS_URL | redis://<ip>:6379 | Redis connection |
| MINIO_ENDPOINT | <ip> | MinIO host IP (raw container IP) |
| MINIO_PORT | 9000 | MinIO port |
| MINIO_PUBLIC_URL | http://localhost:9000 | Browser-reachable MinIO origin for presigned URLs |
| MINIO_ACCESS_KEY | minioadmin | MinIO access key |
| MINIO_SECRET_KEY | minioadmin | MinIO secret key |
| NEO4J_URI | bolt://<ip>:7687 | Neo4j bolt connection (graph authoring canvas) |
| NEO4J_USER | neo4j | Neo4j user |
| NEO4J_PASSWORD | lasfloresdev123 | Neo4j password (the default `neo4j/neo4j` is rejected by the image) |
| NEO4J_ENABLED | `true` or `false` | Enables the Neo4j graph (defaults to `false`; boot never aborts when down) |
| JWT_SECRET | dev-secret | JWT signing secret (use `dev-secret` for local dev-login) |
| LLM_PROVIDER | `mock` or `litellm` | LLM backend (default: `mock`) |
| LITELLM_BASE_URL | http://host.containers.internal:4000 | LiteLLM gateway URL (LiteLLM runs on the HOST) |
| LITELLM_API_KEY | local-key | LiteLLM auth key |
| LLM_MODEL | poolside/laguna-m.1 | Model name for plan generation |

> `PROMPT_ROOT` is intentionally **not** set: the app default `resolveContentDir()` resolves to `/app/content` inside the container, matching `docker-compose.yml`.

### Admin Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SERVER_URL` | `http://localhost:3001` | Browser-facing intake-worker URL (host:3001) |
| `INTERNAL_SERVER_URL` | `http://las-flores-intake-worker:3001` | Server-side URL the admin container uses to reach the intake-worker (container network) |
| `NODE_ENV` | development | Node.js environment |

### Admin Dev Login

In development mode, the admin panel includes a "DEV LOGIN" button on the login page that uses the `/api/auth/dev-login` endpoint to authenticate via the server's `/auth/dev-admin-login` route. No password is required.

This is enabled automatically when `NODE_ENV !== 'production'` in the admin container.

## Tips for Development

1. **Live code reloading:** The server uses `tsx watch`, so changes to files in `./server/src` are automatically picked up (no need to restart the container).

2. **Volume mounts:** All source directories are volume-mounted, so you can edit files on your host and see changes immediately.

3. **Database access:** You can connect to PostgreSQL directly:
   ```bash
   podman exec -it las-flores-postgres-oltp psql -U las_flores -d las_flores
   ```

4. **MinIO access:** Use the MinIO console at http://localhost:9001 (user: minioadmin, pass: minioadmin)

5. **Adding new prompt files:** Place `.prompt.md` files in the appropriate `content/<type>/<slug>/` folder (e.g. `content/characters/<slug>/<slug>.prompt.md`) and they will automatically appear in the prompt catalog.
