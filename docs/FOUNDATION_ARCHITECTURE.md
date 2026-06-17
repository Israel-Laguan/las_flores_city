# Foundation Architecture

## Monorepo & Infrastructure

### Project Structure

- `/client` — Phaser.js game client with TypeScript
- `/server` — Node.js/Express API server
- `/admin` — Next.js admin panel
- `/shared` — TypeScript interfaces and types (Zod schemas)
- `/content` — YAML content files with sample content

### Docker Compose

The `docker-compose.yml` provisions the following services:

- **PostgreSQL (OLTP)** — main game state database (port 5434)
- **PostgreSQL (OLAP)** — analytics and leaderboards (port 5433)
- **Redis** — versioned content cache (port 6379)
- **MinIO** — S3-compatible object storage (ports 9000/9001)
- **Server** — Node.js/Express API (port 3000)
- **Admin Panel** — Next.js admin interface (port 3001)

### CI/CD Pipeline

GitHub Actions workflows:

- `.github/workflows/ci.yml` — main CI/CD pipeline (test, validate, build)
- `.github/workflows/content-validation.yml` — YAML validation on content changes

---

## Shared Contract & Data Schema

### Shared Types Package

`@las-flores/shared` provides comprehensive TypeScript interfaces:

- **TimeBlock** — time-block system types
- **User & Auth** — user and entitlement types
- **Content & Dialogue** — dialogue tree, node, choice types
- **Location & Scene** — location and scene types
- **Player State** — player state and flags
- **API Responses** — standardized API response types
- **YAML Content Types** — content validation schemas
- **Migration Types** — migration log types
- **Event Sourcing** — OLAP event types

### SQL Schema

**OLTP Schema (`001_initial_schema.sql`)**:

| Table | Purpose |
|-------|---------|
| `users` | User accounts with auth and entitlements |
| `time_blocks` | Time-block balance and refresh tracking |
| `characters` | NPC character definitions |
| `dialogue_trees` | Interactive dialogue trees with JSONB nodes |
| `dialogue_overlays` | NSFW/premium content overlays |
| `scenes` | Location definitions with available dialogues |
| `player_states` | Player progress and state |
| `player_sms_threads` | Phone message history |
| `public_profiles` | Cosmetics and badges |
| `migration_log` | YAML migration tracking |

**OLAP Schema (`002_analytics_schema.sql`)**:

| Table | Purpose |
|-------|---------|
| `player_events` | Event sourcing for analytics |
| `player_sessions` | Session tracking |
| `mystery_progress` | Competitive mystery engine |
| `leaderboard_efficiency` | Materialized view for leaderboards |

### API Contract

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |
| GET | `/health/player-state` | Get current player state |
| GET | `/player/state` | Get player state |
| POST | `/player/spend-time-blocks` | Spend time blocks |
| POST | `/player/set-flag` | Set player flags |
| GET | `/location/:id` | Get location details |
| GET | `/location/:id/dialogues` | Get available dialogues |
| GET | `/dialogue/:id` | Get dialogue tree |
| POST | `/dialogue/:id/choose` | Make dialogue choice |

---

## Idempotent Migration Engine

### Content Validation (`server/src/content/validate.ts`)

- Schema validation using Zod
- Cycle detection in dialogue trees
- XSS protection and content sanitization
- Dependency resolution

### Migration Engine (`server/src/content/migrate.ts`)

- Scans `/content` folder for `.yaml` files
- Validates content before migration
- Upserts using `INSERT ... ON CONFLICT` for idempotency
- Respects dependency order: Characters → Scenes → Dialogues → Overlays
- Logs file checksums to skip unchanged files
- Provides detailed migration reports

### Sample Content

- `content/characters/aria_welcome_bot.yaml` — welcome AI character
- `content/dialogues/welcome_dialogue.yaml` — tutorial dialogue tree
- `content/scenes/welcome_center.yaml` — starting location
- `content/overlays/welcome_nsfw_overlay.yaml` — NSFW overlay example

---

## UI/Engine Bridge

### Phaser Integration

**Boot Scene (`client/src/scenes/BootScene.ts`)**:
- Loading screen with progress bar
- Transition to world scene

**World Scene (`client/src/scenes/WorldScene.ts`)**:
- Basic game world with grid
- Player movement with arrow keys
- Location interaction with SPACE key
- Event Bus integration for DOM communication

### Event Bus

The `EventBus` class (`client/src/utils/EventBus.ts`) provides Phaser ↔ DOM communication:

- Singleton pattern for global access
- Events: `world:ready`, `world:pause`, `world:resume`, `phone:app-opened`, `phone:app-closed`, `dialogue:start`, `dialogue:choose`

### Phone Overlay

The Phone OS shell (`client/src/components/PhoneOverlay.ts`):

- CSS layering above Phaser (z-index: 1000)
- App navigation: Feed, Messages, Vault, Identity
- Dialogue system with choices and TB costs
- Real-time time-block display
- Event-driven updates

### API Client

The frontend API client (`client/src/utils/api.ts`) provides type-safe API calls with error handling for all endpoints.

---

## Quickstart

A new developer can:

1. Clone the repo and run `docker-compose up -d`
2. Run `npm run migrate` to populate the database with the welcome content
3. Launch the client to see the Phaser canvas with the functional phone overlay
4. Call `GET /player-state` and receive valid JSON
