# Admin Panel

> **Note:** The Next.js app has been renamed to `dashboard` (living reference). A new `admin` workspace will be scaffolded on Next 16 per M1.

The dashboard panel is a Next.js app (port 3001) that provides content management, asset generation, and quality tools for Las Flores 2077.

## Architecture

### 3-Layer Data Model

```
LORE (markdown)    →    CONTENT (yaml)    →    DB (postgres)
  docs/lore/              content/               tables
```

Lore markdown defines the world. Content YAML defines game data. The migration pipeline pushes YAML into Postgres.

### Network Flow

```
Admin UI  →  Next.js API proxy  →  Server Express API  →  Filesystem / DB
```

The dashboard container has no filesystem access to `content/` or `docs/`. All file operations proxy through server endpoints.

## Content Pipeline

### Write (YAML)

Authors create/edit YAML files in `content/` organized by type:

| Directory | Content Type | DB Table |
|-----------|-------------|----------|
| `characters/` | NPC definitions | `characters` |
| `dialogues/` | Conversation trees | `dialogue_trees` |
| `scenes/` | Location definitions | `scenes` |
| `locations/` | Location metadata | `scenes` (type=location) |
| `missions/` | Mystery quest lines | `mysteries` |
| `stories/` | Mission packages | `stories` |
| `overlays/` | SFW/NSFW content overlays | `dialogue_overlays` |
| `vault/` | Collectible items | `vault_items` |
| `gigs/` | Side jobs | `gigs` |
| `shop/` | Cosmetics and items | `shop_items` |
| `maps/` | District tile maps | `map_tiles` |
| `story_beats.yaml` | Narrative beat registry | `story_beats` |

### Validate

Two paths:
- **CLI**: `npm run validate:content`
- **Admin UI**: `/validation`

Checks: schema validation (Zod), dialogue cycle detection (DFS), XSS protection, beat cross-references.

### Migrate

Two paths:
- **CLI**: `npm run migrate`
- **Admin UI**: `/migration`

Processing order (dependency-aware):
1. `story_beat` — must precede dialogues and scenes
2. `character` — may be referenced by scenes
3. `scene` — may be referenced by dialogues
4. `location` — upserted as scenes
5. `mystery/mission` — referenced by overlays, vault items
6. `vault` — may reference mysteries
7. `dialogue` — references characters, beats
8. `overlay` — modifies dialogue trees
9. `gig`, `shop_item`, `map_tile`

Post-migration: dialogue tree AOT compilation (15-node chunks), Redis cache invalidation.

### Pre-Migration Diff

`POST /admin/content/diff` compares YAML checksums against `migration_log` and returns per-file status (unchanged/new/modified) with row change estimates.

## Admin UI Pages

### Content Browsing

| Route | Description |
|-------|-------------|
| `/characters` | Paginated list with portrait status |
| `/dialogues` | Paginated list with node count + beat association |
| `/scenes` | Paginated list with district + required beat |
| `/story-beats` | Full CRUD + usage cross-references |
| `/story-arc` | Beat timeline with content links and reachability |
| `/missions` | Mission list and detail views |
| `/stories` | Story package list and detail views |
| `/overlays` | Overlay list and detail views |
| `/locations` | Location list and detail views |
| `/vault` | Vault item list and detail views |
| `/gigs` | Gig list and detail views |
| `/shop` | Shop item list and detail views |
| `/maps` | Map tile list and detail views |

### Content Authoring

| Route | Description |
|-------|-------------|
| `/editor` | YAML file editor (textarea) with file tree |
| `/content-linker` | Link content types (NPCs↔scenes, overlays↔missions, etc.) |
| `/missions/new` | Step-by-step mission creation wizard |
| `/lore` | Browse lore markdown files with rendered preview |

### System

| Route | Description |
|-------|-------------|
| `/migration` | Run content migration, view per-file status |
| `/validation` | Run validation, view errors grouped by file |
| `/quality` | Content quality dashboard (density, length, inconsistency, completeness) |
| `/analytics` | Player engagement analytics (OLAP queries) |
| `/assets` | Asset generation pipeline (AKOOL integration) |
| `/coverage` | Lore-to-content coverage gaps |
| `/asset-coverage` | Portrait/background generation status |
| `/users` | User management (placeholder) |
| `/settings` | Configuration (placeholder) |

### Dashboard

The home page shows:
- Quick stats (characters, dialogues, scenes, overlays, mysteries) from `GET /admin/stats`
- Recent activity from `migration_log`
- Quick action buttons for migration, validation, analytics

## Core Shell Page Data Flows

Each core page fetches data via `api.ts` direct fetch to the Express server.

| Page | Route | Fetch Method | Express Endpoint | Response Shape |
|------|-------|-------------|-----------------|----------------|
| Login | `/login` | Client `POST` → Next API route → Express | `POST /auth/admin-login` | `{ success, data: { user } }` + Set-Cookie header |
| Home | `/` | Client `GET` → Next API route → Express | `GET /admin/stats` | `{ success, data: { counts: { characters, dialogues, scenes, overlays, mysteries }, recentActivity: [...] } }` |
| Layout | All pages | Server-side `getAdminUser()` | `GET /auth/admin-me` | `{ success, data: { user } }` |
| ContentListPage | `/{type}` | Client `GET {endpoint}?page={p}&pageSize=50` | `GET /admin/{type}` | `{ success, data: { items: T[], total: number } }` |
| ContentDetailPage | `/{type}/{id}` | Client `GET /api/admin/{type}/{id}` | `GET /admin/{type}/{id}` | `{ success, data: T }` |

**Auth flow:** Login posts FormData to `/api/auth/admin-login`, which forwards to Express and relays the `Set-Cookie` header. The middleware checks for `jwt_session` cookie on all routes except `/login`.

## Network Architecture

File operations route through the server, not the dashboard directly:

```
Dashboard UI  →  Next.js API proxy  →  Server Express API  →  Filesystem / DB
```

- Dashboard container has NO filesystem access to `content/` or `docs/`
- Server has read-write access to `content/` and read-only access to `docs/`
- All file operations proxy through server endpoints

## Authentication

- Admin login: `POST /auth/admin-login` (server) → JWT cookie
- Admin middleware checks `users.role` on every API call (admin or developer)
- Dashboard app runs on port 3001, player client on 5173, server on 3000 (different origins)

## Key Server Routes

| Route | Purpose |
|-------|---------|
| `/admin/content/validate` | Run validation pipeline |
| `/admin/content/migrate` | Run migration pipeline |
| `/admin/content/status` | Migration log status |
| `/admin/content/diff` | Pre-migration checksum diff |
| `/admin/content/file` | Read/write YAML files |
| `/admin/content/tree` | List all YAML files |
| `/admin/lore/tree` | List lore markdown files |
| `/admin/lore/file` | Read lore markdown content |
| `/admin/lore/search` | Search across lore |
| `/admin/coverage` | Lore-to-content coverage report |
| `/admin/stats` | Dashboard statistics |
| `/admin/dialogues` | Paginated dialogue list |
| `/admin/scenes` | Paginated scene list |
| `/admin/characters` | Paginated character list |
| `/admin/story-beats` | Story beat CRUD |
| `/admin/story-arc` | Story arc visualization data |
| `/admin/content/quality` | Content quality checks |
| `/admin/analytics/summary` | Player analytics |
| `/assets/*` | Asset generation pipeline |
