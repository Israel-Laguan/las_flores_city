# Las Flores 2077

A narrative-driven cyberpunk adventure game where players create their own character, explore a living city, and experience branching storylines through dialogue-driven missions.

## About

Las Flores 2077 is an immersive RPG set in a neon-lit cyberpunk city. Players create their own character and navigate the streets of Las Flores, encountering memorable NPCs—each with their own stories, motivations, and secrets. Through a real-time dialogue system, players make meaningful choices that shape their journey through the city's mysteries and factions.

### Gameplay

- **Character Creation**: Players create and customize their own protagonist with unique traits
- **City Exploration**: Navigate diverse locations across Las Flores, from neon-lit streets to hidden underground clubs
- **Dialogue Missions**: Engage with NPCs through branching conversation trees where choices matter
- **Time Management**: Balance your daily activities with a limited time-block system
- **Player Progression**: Track flags, relationships, and story advances across sessions

> Note: While NPCs like Alex have their own rich backstories and character arcs, players do not play AS Alex—they play as their own character who interacts with Alex and other NPCs throughout the city.

## Tech Stack

| Layer | Technology |
|-------|-------------|
| Game Client | Phaser.js 3 |
| API Server | Node.js + Express |
| Admin Panel | Next.js |
| Database (OLTP) | PostgreSQL 16 |
| Database (OLAP) | PostgreSQL 16 (analytics) |
| Caching | Redis 7 |
| Object Storage | MinIO (S3-compatible) |
| Content Format | YAML |

### Architecture

- **Content-Driven**: All game content (characters, dialogues, scenes, overlays) defined in YAML files and migrated to the database
- **Dual Database**: OLTP for real-time game state, OLAP for analytics and leaderboards
- **Layered Overlays**: Support for SFW/NSFW content overlays (e.g., Patreon supporter content)
- **Dialogue System**: Node-based conversation trees with conditions, effects, and time-block costs

## Quick Start

### Prerequisites

- Docker and Docker Compose OR Podman (with `uidmap`, `slirp4netns`)
- Node.js 18+ (for local development)
- Git

### Running with Docker Compose

```bash
git clone <repository-url>
cd las_flores_city
docker-compose up -d
```

### Running with Podman

```bash
git clone <repository-url>
cd las_flores_city

# Create network and volumes (one-time)
podman network create las-flores-net
podman volume create postgres-oltp-data
podman volume create postgres-olap-data
podman volume create redis-data
podman volume create minio-data

# Build and start
podman build -f server/Dockerfile -t las-flores-server .
# ... (see full Podman setup in the developer docs)
```

### Verify Setup

```bash
curl http://localhost:3000/health
```

Services started:
- **Server**: http://localhost:3000
- **PostgreSQL (OLTP)**: port 5434
- **PostgreSQL (OLAP)**: port 5433
- **Redis**: port 6379
- **MinIO**: ports 9000/9001

### Migrate Content

```bash
npm install
npm run migrate
```

This scans `/content`, validates YAML schemas, and upserts content into the database.

## Project Structure

```
las_flores_city/
├── client/              # Phaser.js game client
├── server/              # Node.js/Express API
├── admin/               # Next.js admin panel
├── shared/              # TypeScript interfaces
├── content/             # YAML content files
│   ├── characters/      # NPC definitions
│   ├── dialogues/       # Dialogue trees
│   ├── overlays/        # Content overlays
│   ├── scenes/          # Location definitions
│   └── mysteries/       # Mission/story content
├── docker-compose.yml
└── package.json
```

## Development

### Content Creation

1. Create YAML files in `/content` subdirectories
2. Follow schemas in `/shared/src/index.ts`
3. Validate: `npm run validate:content`
4. Migrate: `npm run migrate`

### Running Tests

```bash
npm run test --workspace=server
npm run test --workspace=client
```

### Linting

```bash
npm run lint --workspace=server
npm run lint --workspace=client
```

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health check |
| `/player/state` | GET | Get player state (authenticated) |
| `/player/spend-time-blocks` | POST | Spend time blocks |
| `/player/set-flag` | POST | Set a player flag |
| `/location/:id` | GET | Get location details |
| `/location/:id/dialogues` | GET | Get available dialogues |
| `/dialogue/:id` | GET | Get dialogue tree |
| `/dialogue/:id/choose` | POST | Make a dialogue choice |

## Time-Block System

The Time-Block (TB) system controls daily pacing:
- Players start with 12 TBs per day
- Actions cost 1-3 TBs based on complexity
- TBs refresh daily at midnight (server time)
- Costs shown before making choices

## Contributing

1. Create a feature branch
2. Make your changes
3. Run `npm run validate:content` if modifying content
4. Run `npm run lint` to check code style
5. Submit a pull request

## License

Proprietary. All rights reserved.