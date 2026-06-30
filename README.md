# Las Flores 2077 - Developer Quickstart Guide

Welcome to the Las Flores 2077 development environment! This guide will help you get up and running quickly.

## Prerequisites

- **Docker and Docker Compose** OR **Podman** (with `uidmap`, `slirp4netns`, and optional `podman-compose`)
- Node.js 18+ (for local development outside Docker)
- Git

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd las_flores_city
```

### 2. Start the Development Environment

**Option A: Docker Compose**

```bash
docker-compose up -d
```

**Option B: Podman (no Docker required)**

```bash
# Create bridge network (one-time)
podman network create las-flores-net

# Create volumes (one-time)
podman volume create postgres-oltp-data
podman volume create postgres-olap-data
podman volume create redis-data
podman volume create minio-data

# Build server image
podman build -f server/Dockerfile -t las-flores-server .

# Start infrastructure
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

# Start server (uses container IPs for intra-network connectivity)
podman run -d --name las-flores-server \
  --network las-flores-net -p 3000:3000 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./content:/app/content \
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

This will start:
- **PostgreSQL (OLTP)** on port 5434 - Main game state database
- **PostgreSQL (OLAP)** on port 5433 - Analytics and leaderboards
- **Redis** on port 6379 - Content caching
- **MinIO** on ports 9000/9001 - S3-compatible object storage
- **Server** on port 3000 - Node.js/Express API
- **Admin Panel** on port 3001 - Next.js admin interface (use Docker Compose or build separately)

### 3. Install Dependencies (Optional - for local development)

```bash
npm install
```

### 4. Run the Content Migration

```bash
npm run migrate
```

This will:
- Scan the `/content` folder for YAML files
- Validate the content (schema + cycle detection)
- Upsert content into the database
- Respect dependency order (Characters → Overlays → Scenes → Dialogues)
- Log file checksums to prevent re-processing unchanged files

### 5. Verify the Setup

```bash
# Check server health
curl http://localhost:3000/health

# Check player state
curl http://localhost:3000/health/player-state

# Check a location
curl http://localhost:3000/location/scene_welcome_center
```

## Project Structure

```
las_flores_city/
├── client/          # Phaser.js game client
├── server/          # Node.js/Express API server
├── admin/           # Next.js admin panel
├── shared/          # TypeScript interfaces and types
├── content/         # YAML content files
│   ├── characters/  # Character definitions
│   ├── dialogues/   # Dialogue trees
│   ├── overlays/    # Content overlays (SFW/NSFW)
│   └── scenes/      # Location/scene definitions
├── docker-compose.yml
└── package.json
```

## Development Workflow

### Content Creation

1. Create YAML files in the appropriate `/content` subdirectory
2. Follow the schema definitions in `/shared/src/index.ts`
3. Run `npm run validate:content` to check for errors
4. Run `npm run migrate` to push content to the database

### Content Validation

The content validation system checks:
- **Schema Validation**: Ensures YAML files match the defined schemas
- **Cycle Detection**: Prevents circular references in dialogue trees
- **XSS Protection**: Sanitizes user-facing content
- **Dependency Resolution**: Ensures proper order for content insertion

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health check |
| `/health/player-state` | GET | Get current player state |
| `/player/state` | GET | Get player state (authenticated) |
| `/player/spend-time-blocks` | POST | Spend time blocks |
| `/player/set-flag` | POST | Set a player flag |
| `/location/:id` | GET | Get location details |
| `/location/:id/dialogues` | GET | Get available dialogues |
| `/dialogue/:id` | GET | Get dialogue tree |
| `/dialogue/:id/choose` | POST | Make a dialogue choice |

## Time-Block System

The Time-Block (TB) system is the core pacing mechanism:
- Players start with 12 TBs per day
- Each action costs 1-3 TBs depending on complexity
- TBs refresh daily at midnight (server time)
- TB costs are displayed to players before they make choices

## Content Types

### Characters
Define NPCs with personality, appearance, and dialogue options.

### Dialogues
Interactive conversation trees with choices, conditions, and effects.

### Overlays
Modifications to existing dialogues (e.g., NSFW content for Patreon supporters).

### Scenes
Location definitions with available dialogues and ambiance settings.

## Troubleshooting

### Database Connection Issues

**Docker Compose:**
```bash
# Check if containers are running
docker-compose ps

# View container logs
docker-compose logs postgres-oltp
docker-compose logs server
```

**Podman:**
```bash
# Check if containers are running
podman ps --filter name=las-flores

# View container logs
podman logs las-flores-postgres-oltp
podman logs las-flores-server
```

### Podman-Specific Issues

- If `podman run` fails with `exec: "pasta": executable file not found in $PATH`, install `slirp4netns` and configure `~/.config/containers/containers.conf` with `default_rootless_network_cmd = "slirp4netns"` under `[network]`.
- Container hostnames like `las-flores-postgres-oltp` do not resolve between containers without `aardvark-dns`. Use the container IPs (visible in `podman network inspect las-flores-net`) in environment variables if DNS fails.
- If the server cannot reach the database, verify connectivity with `podman exec las-flores-postgres-oltp pg_isready -U las_flores -d las_flores`.

### Content Migration Errors

```bash
# Run validation only
npm run validate:content

# Check migration logs (Docker)
docker-compose exec postgres-oltp psql -U las_flores -d las_flores -c "SELECT * FROM migration_log ORDER BY applied_at DESC LIMIT 10;"

# Check migration logs (Podman)
podman exec las-flores-postgres-oltp psql -U las_flores -d las_flores -c "SELECT * FROM migration_log ORDER BY applied_at DESC LIMIT 10;"
```

### Redis Connection Issues

```bash
# Docker
docker-compose exec redis redis-cli ping

# Podman
podman exec las-flores-redis redis-cli ping
```

## Next Steps

Once the foundation is set up, you can:
1. Create more content in the `/content` folder
2. Build out the admin panel for content management
3. Implement authentication and user management
4. Add more API endpoints for game features

## Contributing

1. Create a feature branch
2. Make your changes
3. Run `npm run validate:content` if modifying content
4. Run `npm run lint` to check code style
5. Submit a pull request

## License

This project is proprietary. All rights reserved.
