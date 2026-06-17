# Las Flores 2077 - Developer Quickstart Guide

Welcome to the Las Flores 2077 development environment! This guide will help you get up and running quickly.

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development outside Docker)
- Git

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd las_flores_city
```

### 2. Start the Development Environment

```bash
docker-compose up -d
```

This will start:
- **PostgreSQL (OLTP)** on port 5432 - Main game state database
- **PostgreSQL (OLAP)** on port 5433 - Analytics and leaderboards
- **Redis** on port 6379 - Content caching
- **MinIO** on ports 9000/9001 - S3-compatible object storage
- **Server** on port 3000 - Node.js/Express API
- **Admin Panel** on port 3001 - Next.js admin interface

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

```bash
# Check if containers are running
docker-compose ps

# View container logs
docker-compose logs postgres-oltp
docker-compose logs server
```

### Content Migration Errors

```bash
# Run validation only
npm run validate:content

# Check migration logs
docker-compose exec postgres-oltp psql -U las_flores -d las_flores -c "SELECT * FROM migration_log ORDER BY applied_at DESC LIMIT 10;"
```

### Redis Connection Issues

```bash
# Test Redis connection
docker-compose exec redis redis-cli ping
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
