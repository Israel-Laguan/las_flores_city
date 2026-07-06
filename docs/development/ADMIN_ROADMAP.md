# Admin Panel Development Roadmap

This roadmap outlines the phased development of the admin panel, organized into milestones that build on each other. Each milestone is designed to be shippable independently.

---

## Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M1: Security Foundation | ✅ Complete | Auth middleware, path traversal, sanitization, rate limiting |
| M2: Admin Authentication | ✅ Complete | Role column, adminMiddleware, admin login flow, auth gate |
| M3: Content Pipeline Dashboard | ✅ Complete | Server endpoints + admin UI pages |
| M4: Story Beat Definition | ✅ Complete | Registry YAML, schema, migration, validation, content annotations |
| M5: Story Beat Admin UI | ✅ Complete | CRUD endpoints + list/detail pages + tests |
| M6: Content List Views | ✅ Complete | Paginated list + detail views for dialogues/scenes/characters |
| M7: Authoring Flow Completion | 🔲 Planned | Remaining list views, dashboard, nav, diff preview, analytics |

---

## Milestone 1: Security Foundation ✅

**Goal**: Close critical security holes before building any admin features on top of them.

**Status**: Complete

### Completed Tasks
1. ✅ Add `authMiddleware` to both asset routers (`assetsRouter` + `assetsImportRouter`)
2. ✅ Add path traversal validation to `import-base` endpoint (restrict `file_path` to `PROMPT_ROOT`)
3. ✅ Add `prompt_rel` sanitization (reject `..` sequences) across all import endpoints
4. ✅ Add basic rate limiting to generate endpoints (30 req/min per user)

**Key Files**:
- `server/src/routes/assets.ts` — `adminMiddleware` applied to all routes
- `server/src/routes/assets-import.ts` — `adminMiddleware` + `resolveAllowedImportFile()` + `sanitizePromptRel()`
- `server/src/middleware/rateLimiter.ts` — `createRateLimiter()` factory

---

## Milestone 2: Admin Authentication ✅

**Goal**: Establish admin identity before any admin UI features.

**Status**: Complete

### Completed Tasks
1. ✅ Add `role` column to `users` table (`player` | `admin` | `developer`)
2. ✅ Create `adminMiddleware` — checks `role === 'admin'` OR `role === 'developer'` after `authMiddleware`
3. ✅ Apply `adminMiddleware` to all `/assets/*` routes (after M1.1 adds `authMiddleware`)
4. ✅ Add admin login flow to admin Next.js app (JWT from main app)
5. ✅ Protect the admin app with auth gate — redirect to login if no token

**Key Files**:
- `server/src/database/migrations/043_user_roles.sql` — Adds `role` column with CHECK constraint
- `server/src/middleware/adminAuth.ts` — `adminMiddleware` + `authAndAdminMiddleware`
- `server/src/routes/auth.ts` — `POST /auth/admin-login`, `POST /auth/dev-admin-login`
- `admin/src/middleware.ts` — Next.js middleware checking `jwt_session` cookie
- `admin/src/app/api/auth/admin-login/route.ts` — Admin login handler

### Design Decision: Cookie Naming

Both the player client and admin panel currently use the same cookie name `jwt_session`. This is **intentional and secure** because:

1. **Different origins prevent collision**: Admin app runs on port 3001, player client on 5173, server on 3000. Cookies are scoped by origin, so a `jwt_session` set by the admin app is invisible to the player client and vice versa.

2. **Admin middleware is a UX gate, not a security boundary**: It only checks for cookie *presence*. The real security happens server-side where `adminMiddleware` queries `users.role` on every API call and returns 403 if not admin/developer.

3. **JWT is identical regardless of login path**: The token contains only `{ userId }` — no role claim. The server always re-checks role from the database.

**If separate admin sessions are desired** (e.g., shorter TTL, JWT verification at the gate), the implementation would be:
- Server sets a distinct `admin_session` cookie on `/auth/admin-login` with 4h TTL
- Admin middleware verifies the JWT signature (not just presence)
- Admin middleware checks an admin-specific claim embedded in the token

This would be **M2.4/M2.5** if implemented, but is not currently required.

---

## Milestone 3: Content Pipeline Dashboard ✅

**Goal**: Expose existing CLI tools (validate + migrate) through the admin UI.

**Status**: Complete

### Completed Tasks
1. ✅ New server endpoint: `POST /admin/content/validate` — runs `validateContent()` and returns results JSON
2. ✅ New server endpoint: `POST /admin/content/migrate` — runs `migrateContent()` and returns results JSON
3. ✅ New server endpoint: `GET /admin/content/status` — reads `migration_log` table, shows last-run per file
4. ✅ Admin UI: `/migration` page — trigger migration, show success/failure per file
5. ✅ Admin UI: `/validation` page — run validation, show errors grouped by file with severity

**Key Files**:
- `server/src/routes/admin-content.ts` — HTTP wrappers for validate, migrate, and status
- `server/src/index.ts` — registers `/admin/content` routes
- `admin/src/app/api/admin/content/validate/route.ts` — Next.js API route proxying to server
- `admin/src/app/api/admin/content/migrate/route.ts` — Next.js API route proxying to server
- `admin/src/app/api/admin/content/status/route.ts` — Next.js API route proxying to server
- `admin/src/app/migration/page.tsx` — Migration dashboard UI with run/status views
- `admin/src/app/validation/page.tsx` — Validation UI with file-grouped error display

---

## Milestone 4: Story Beat Definition ✅

**Goal**: Establish canonical beats and start using them in content.

**Status**: Complete

### Completed Tasks
1. ✅ Create `content/story_beats.yaml` — 7 canonical beat slugs with metadata
2. ✅ Add `StoryBeatRegistrySchema` to `shared/src/schemas/story-beat.ts` — validates slug format, dedup
3. ✅ Migration `044_story_beats.sql` — `story_beats` table with PK on slug, UNIQUE on order
4. ✅ Migration `045_migration_log_text_id.sql` — widen `content_id` from UUID to TEXT for slug PKs
5. ✅ Validation in `validate.ts` — cross-references `effects.story_beat` (dialogues) and `required_story_beat` (scenes) against registry
6. ✅ Add `effects.story_beat` to dialogue YAML files: `dialogue_awakening` → `act1_awakening`, `welcome_dialogue` → `act1_city_arrived`, `dialogue_first_contact` → `act1_first_contact`, `dialogue_finale` → `finale_complete`
7. ✅ Add `required_story_beat: act1_awakening` to `scene_cafe.yaml` and `old_town_cafe.yaml`
8. ✅ Upsert logic in `upsert.ts` with Redis cache (TTL 0 = persist until explicit delete)
9. ✅ Processing order: `story_beat` before `dialogue` and `scene` in migration pipeline
10. ✅ Property-based unit tests + integration pipeline tests

**Key Files**:
- `content/story_beats.yaml` — canonical beat registry
- `shared/src/schemas/story-beat.ts` — `StoryBeatSchema` + `StoryBeatRegistrySchema`
- `server/src/database/migrations/044_story_beats.sql` — table creation
- `server/src/database/migrations/045_migration_log_text_id.sql` — content_id type change
- `server/src/content/validate.ts` — beat slug cross-reference validation
- `server/src/content/upsert.ts` — `processStoryBeatData()` upsert + cache
- `server/src/content/migrate.ts` — story_beat processing order + cache invalidation
- `server/tests/unit/storyBeatSchema.property.test.ts` — comprehensive property tests
- `server/tests/integration/story-beat-pipeline.integration.test.ts` — end-to-end pipeline test

**Note**: `act2_mystery_active` and `act3_finale_unlocked` are set server-side (mystery join flow, LeaderboardWorker), not in content YAML.

**Why fourth**: This unblocks the story progression system. Authors need a controlled vocabulary before they can use `story_beat` consistently.

### Proposed Beat Slugs
```yaml
beats:
  - slug: prologue
    label: "Prologue"
    order: 0
    description: "Player has just arrived"
  - slug: act1_awakening
    label: "Act 1 — Awakening"
    order: 10
    description: "Vance explains the contract"
  - slug: act1_city_arrived
    label: "Act 1 — City Arrived"
    order: 20
    description: "Player has gotten their bearings"
  - slug: act1_first_contact
    label: "Act 1 — First Contact"
    order: 30
    description: "First conversation with the Barista"
  - slug: act2_mystery_active
    label: "Act 2 — Mystery Active"
    order: 100
    description: "After joining a mystery"
  - slug: act3_finale_unlocked
    label: "Act 3 — Finale Unlocked"
    order: 200
    description: "Set server-side when mystery is solved"
  - slug: finale_complete
    label: "Finale Complete"
    order: 300
    description: "After the meta-plot finale"
```

---

## Milestone 5: Story Beat Admin UI ✅

**Goal**: Simple CRUD for beats + visibility into which content uses them.

**Status**: Complete

### Completed Tasks
1. ✅ Server endpoints: `GET/POST/PUT/DELETE /admin/story-beats` + `GET /:slug/usages` — CRUD with cross-reference
2. ✅ Admin UI: `/story-beats/page.tsx` — list beats in order, inline edit, add/delete with confirmation
3. ✅ Admin UI: `/story-beats/[slug]/page.tsx` — detail view showing dialogue/scene usages
4. ✅ Next.js API proxies for all endpoints
5. ✅ Test coverage: loading states, CRUD operations, badge rendering, property-based tests

**Key Files**:
- `server/src/routes/admin-story-beats.ts` — Express CRUD + usages endpoint
- `admin/src/app/story-beats/page.tsx` — List page with inline editing
- `admin/src/app/story-beats/[slug]/page.tsx` — Detail view with cross-references
- `admin/src/app/api/admin/story-beats/route.ts` — Next.js API proxy (GET, POST)
- `admin/src/app/api/admin/story-beats/[slug]/route.ts` — Next.js API proxy (PUT, DELETE)
- `admin/src/app/api/admin/story-beats/[slug]/usages/route.ts` — Next.js API proxy (GET)
- `admin/src/app/story-beats/__tests__/page.test.tsx` — Test coverage

---

## Milestone 6: Content List Views ✅

**Goal**: Read-only browsers for dialogues, scenes, and characters.

**Status**: Complete

### Completed Tasks
1. ✅ Server endpoints: `GET /admin/dialogues`, `GET /admin/scenes`, `GET /admin/characters` — paginated lists with metadata
2. ✅ Server endpoints: `GET /admin/dialogues/:id`, `GET /admin/scenes/:id`, `GET /admin/characters/:id` — detail views
3. ✅ Admin UI: `/dialogues/page.tsx` — table with node count, beat association badge, pagination
4. ✅ Admin UI: `/scenes/page.tsx` — table with district, required story beat badge, pagination
5. ✅ Admin UI: `/characters/page.tsx` — table with portrait status badge (ready/missing), pagination
6. ✅ Detail views: read-only JSON preview for each content type with back navigation
7. ✅ Test coverage: pagination, badge rendering, navigation, property-based tests

**Key Files**:
- `server/src/routes/admin-list-views.ts` — Express paginated list + detail endpoints
- `admin/src/app/dialogues/page.tsx` — Dialogue list page
- `admin/src/app/dialogues/[id]/page.tsx` — Dialogue detail (JSON preview)
- `admin/src/app/scenes/page.tsx` — Scene list page
- `admin/src/app/scenes/[id]/page.tsx` — Scene detail (JSON preview)
- `admin/src/app/characters/page.tsx` — Character list page
- `admin/src/app/characters/[id]/page.tsx` — Character detail (JSON preview)
- `admin/src/app/__tests__/contentListViews.test.tsx` — Test coverage

---

## Dependency Chain

```
M1 (Security) → M2 (Admin Auth) → M3 (Pipeline Dashboard)
                                      ↓
                                   M4 (Beat Definition) → M5 (Beat UI)
                                      ↓
                                   M6 (Content List Views) → M7 (Authoring Flow Completion)
```

M1-M6 are complete. The admin panel now supports:
- Content pipeline execution (validate + migrate)
- Story beat CRUD with cross-reference visibility
- Read-only browsing of dialogues, scenes, and characters

---

## Current Authoring Flow

With M1-M6 complete, the end-to-end authoring flow is:

### 1. Write Content (YAML)
Authors create/edit YAML files in `content/` organized by type:
```
content/
├── characters/     # NPC definitions
├── dialogues/      # Interactive conversation trees
├── overlays/       # SFW/NSFW content overlays
├── scenes/         # Location definitions
├── locations/      # Location metadata
├── mysteries/      # Mystery quest lines
├── vault/          # Collectible items
├── gigs/           # Side jobs
├── shop/           # Cosmetics and items
├── maps/           # District tile maps
└── story_beats.yaml  # Narrative beat registry
```

### 2. Validate Content
Two paths:
- **CLI**: `npm run validate:content` (runs `server/src/content/validate.ts`)
- **Admin UI**: Visit `/validation` and click "Run Validation"

Validation checks:
- Schema validation per content type (Zod schemas in `shared/src/schemas/`)
- Dialogue cycle detection (DFS)
- XSS protection in user-facing text
- Cross-reference: dialogue `effects.story_beat` vs beat registry
- Cross-reference: scene `metadata.required_story_beat` vs beat registry

### 3. Migrate Content (Push to DB)
Two paths:
- **CLI**: `npm run migrate` (runs `server/src/content/migrate.ts`)
- **Admin UI**: Visit `/migration` and click "Run Migration"

Processing order (dependency-aware):
1. `story_beat` — must precede dialogues and scenes (cross-refs)
2. `character` — may be referenced by scenes
3. `scene` — may be referenced by dialogues
4. `location` — upserted as scenes
5. `mystery` — referenced by overlays, vault items
6. `vault` — may reference mysteries
7. `dialogue` — references characters, beats
8. `overlay` — modifies dialogue trees
9. `gig`, `shop_item`, `map_tile`

Post-migration:
- Dialogue tree chunk compilation (AOT, ≤15-node chunks)
- Redis cache invalidation for dialogue, map, and story_beat caches

### 4. Browse Content (Admin UI)
- `/dialogues` — paginated list with node count + beat association
- `/scenes` — paginated list with district + required beat
- `/characters` — paginated list with portrait status
- `/story-beats` — full CRUD + usage cross-references
- `/overlays` — placeholder (real list view planned in M7.1)

### 5. Manage Story Beats (Admin UI)
- `/story-beats` — list, add, inline-edit, delete beats
- `/story-beats/{slug}` — see which dialogues set this beat, which scenes require it

---

## Milestone 7: Authoring Flow Completion ✅

**Goal**: Close remaining gaps so authors can browse all content types, see real dashboard data, navigate the full admin panel, and preview changes before migration.

**Status**: Complete

### Tasks

#### 7.1 — Extend List Views to All Content Types
M6 covers dialogues, scenes, and characters. Add paginated list + detail views for:

| Content Type | Server Table | Columns to Show | Priority |
|---|---|---|---|
| Mysteries | `mysteries` | title, status (ACTIVE/RESOLVING/ARCHIVED), expiry | High |
| Overlays | `dialogue_overlays` | name, target_tree_id, is_nsfw, priority | High |
| Locations | `scenes` (type='location') | name, district (reuse scenes endpoint with filter) | High |
| Vault items | `vault_items` | title, item_type, mystery_id | Medium |
| Gigs | `gigs` | title, time_block_cost, credit_payout | Medium |
| Shop items | `shop_items` | name, item_type, price, is_active | Low |
| Map tiles | `map_tiles` | district, x, y, terrain_type | Low |

**Approach**: Extend `server/src/routes/admin-list-views.ts` with new endpoints, add Next.js API proxies, create `admin/src/app/{type}/page.tsx` list pages and `admin/src/app/{type}/[id]/page.tsx` detail pages. Follow the M6 pattern (paginated table with metadata badges, read-only JSON detail).

**Note on locations**: Locations are upserted into the `scenes` table with `metadata.type = 'location'`. The list view can either add a filter to the existing scenes endpoint or create a separate endpoint that queries `scenes WHERE metadata->>'type' = 'location'`.

#### 7.2 — Fix Dashboard Stats
The admin home page (`admin/src/app/page.tsx:33-38`) has hardcoded `"1"` for all stats. Add a server endpoint `GET /admin/stats` that returns real counts:
- Characters: `SELECT count(*) FROM characters`
- Dialogues: `SELECT count(*) FROM dialogue_trees`
- Scenes: `SELECT count(*) FROM scenes`
- Overlays: `SELECT count(*) FROM dialogue_overlays`
- Mysteries: `SELECT count(*) FROM mysteries`

Convert the dashboard to a client component that fetches from this endpoint. Also update the "Recent Activity" panel to show the last 5 migration_log entries instead of "No recent activity".

#### 7.3 — Complete Navigation
The nav bar (`admin/src/app/layout.tsx:98-102`) currently links only to Dialogues, Scenes, and Characters. Add links for:

**Content section**:
- Story Beats (`/story-beats`)
- Mysteries (`/mysteries`) — after 7.1
- Overlays (`/overlays`) — after 7.1

**System section** (grouped under a dropdown or secondary row):
- Migration (`/migration`)
- Validation (`/validation`)
- Assets (`/assets`)
- Analytics (`/analytics`)

Also update the dashboard's "Content Management" section to include links to Story Beats and all new content list views from 7.1.

#### 7.4 — Pre-Migration Diff Preview
Add a `POST /admin/content/diff` endpoint that:
1. Reads each YAML file in `content/`
2. Compares its checksum against `migration_log.file_checksum`
3. Returns per-file status: `unchanged`, `new`, `modified`
4. For modified files, shows a summary: "N rows will be created, M rows will be updated"

Add a UI page `/diff` (or integrate into `/migration`) that displays this before the user clicks "Run Migration". This prevents accidental overwrites.

#### 7.5 — Content Authoring Analytics
Replace the analytics placeholder page (`admin/src/app/analytics/page.tsx`) with a real dashboard. Add `GET /admin/analytics/summary` endpoint that queries the OLAP `player_events` table for:

- Dialogue completion rates (which dialogues are started vs completed)
- Story beat reach percentages (what % of players have each beat set)
- Mystery status distribution (how many ACTIVE vs RESOLVING vs ARCHIVED)
- Time-block spend per content type

Use the existing `queryOLAP(...)` pattern. Charts can start as simple tables or bar charts; full visualization is a later milestone.

#### 7.6 — Placeholder Page Cleanup
Four admin pages are currently `PlaceholderPage` stubs with no functionality:
- `/overlays` — will be replaced by 7.1
- `/analytics` — will be replaced by 7.5
- `/users` — keep as placeholder (user management is a separate concern)
- `/settings` — keep as placeholder (configuration is a separate concern)

After 7.1 and 7.5 are complete, the overlays and analytics placeholders are deleted. Users and settings remain as-is with their "Future Milestone" badges.

### Dependency Order

```
7.1 (List Views)  ←  highest value, unblocks 7.3
7.2 (Dashboard)   ←  independent, quick win
7.3 (Navigation)  ←  depends on 7.1 for new links
7.4 (Diff Preview) ← independent, requires only admin-content.ts extension
7.5 (Analytics)   ←  independent, requires OLAP queries
7.6 (Cleanup)     ←  depends on 7.1 and 7.5
```

### Key Files (to be created or modified)

**Server**:
- `server/src/routes/admin-list-views.ts` — add endpoints for mysteries, overlays, locations, vault, gigs, shop, maps
- `server/src/routes/admin-content.ts` — add `POST /diff` endpoint
- `server/src/routes/admin-stats.ts` — new file for dashboard stats + analytics summary

**Admin UI**:
- `admin/src/app/page.tsx` — convert to client component, fetch real stats
- `admin/src/app/layout.tsx` — expand nav bar
- `admin/src/app/mysteries/page.tsx` — new list page
- `admin/src/app/mysteries/[id]/page.tsx` — new detail page
- `admin/src/app/locations/page.tsx` — new list page
- `admin/src/app/vault/page.tsx` — new list page
- `admin/src/app/gigs/page.tsx` — new list page
- `admin/src/app/shop/page.tsx` — new list page
- `admin/src/app/maps/page.tsx` — new list page
- `admin/src/app/analytics/page.tsx` — replace placeholder with real dashboard
- `admin/src/app/overlays/page.tsx` — replace placeholder with real list view

**API Proxies** (Next.js route handlers):
- `admin/src/app/api/admin/stats/route.ts`
- `admin/src/app/api/admin/content/diff/route.ts`
- `admin/src/app/api/admin/analytics/summary/route.ts`
- `admin/src/app/api/admin/mysteries/route.ts` + `[id]/route.ts`
- (similar pattern for vault, gigs, shop, maps)

---

### Gap Resolution Summary

The original "What's Missing" analysis identified 8 gaps. Here is the current status after codebase investigation:

| Gap | Description | Status | Notes |
|-----|-------------|--------|-------|
| 1 | Missing list views | Open → M7.1 | Mysteries, overlays, vault, gigs, shop, maps, locations still need pages |
| 2 | No inline content editing | Partial | Story beats have full CRUD; no other content type has editing |
| 3 | Hardcoded dashboard stats | Open → M7.2 | Stats still show hardcoded "1" in `page.tsx:33-38` |
| 4 | Incomplete navigation | Open → M7.3 | Nav bar only has 3 links (Dialogues, Scenes, Characters) |
| 5 | No diff/preview before migration | Open → M7.4 | No diff endpoints or UI exist |
| 6 | No publish workflow | Deferred | No draft/staging/publish tables — multi-author collaboration not yet needed |
| 7 | Content README coverage | **Resolved** | `content/README.md` covers all 11 content types, processing order, and admin UI |
| 8 | No content analytics | Open → M7.5 | Analytics page is a PlaceholderPage stub; no analytics endpoints |

**Gap 2 (inline editing)** is partially resolved: story beats have full inline CRUD. Extending editing to other content types (dialogue YAML editor, scene forms) is a larger effort best suited for a future milestone focused on visual editing tools.

**Gap 6 (publish workflow)** is deferred: the current YAML → migration → database pipeline works for a single-author workflow. A staging/publish system becomes necessary when multiple authors collaborate, which is not yet the case.

### Future Roadmap (Beyond M7)

- Dialogue tree visual editor (drag-and-drop nodes)
- Scene map view with district layout
- Character relationship matrix
- Story arc timeline visualization
- Content staging/publish workflow (when multi-author collaboration begins)