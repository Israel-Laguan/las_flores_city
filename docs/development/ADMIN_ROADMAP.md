# Admin Panel Development Roadmap

This roadmap outlines the phased development of the admin panel, organized into milestones that build on each other. Each milestone is designed to be shippable independently.

---

## Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M1: Security Foundation | ✅ Complete | Auth middleware, path traversal, sanitization, rate limiting |
| M2: Admin Authentication | ✅ Complete | Role column, adminMiddleware, admin login flow, auth gate |
| M3: Content Pipeline Dashboard | ✅ Complete | Server endpoints + admin UI pages |
| M4: Story Beat Definition | ⏳ Pending | Content YAML + schema work |
| M5: Story Beat Admin UI | ⏳ Pending | CRUD UI for beats |
| M6: Content List Views | ⏳ Pending | Read-only browsers for dialogues/scenes/characters |

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

## Milestone 4: Story Beat Definition

**Goal**: Establish canonical beats and start using them in content.

**Estimated effort**: 2-3 days

### Tasks
1. Create `content/story_beats.yaml` — a registry of canonical beat slugs with metadata
2. Add `StoryBeatRegistrySchema` to `shared/src/schemas/`
3. Migrate `story_beats.yaml` into a `story_beats` table (or cache in Redis)
4. Add validation: `effects.story_beat` values must exist in the registry
5. Add `story_beat` to key dialogue YAML files (the 7 beats from `STORY_PROGRESSION_CONTEXT.md`)
6. Add `required_story_beat` to scene `metadata` where gating is needed

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

## Milestone 5: Story Beat Admin UI

**Goal**: Simple CRUD for beats + visibility into which content uses them.

**Estimated effort**: 3-4 days

### Tasks
1. Server endpoints: `GET/POST/PUT/DELETE /admin/story-beats` — CRUD for beat registry
2. Admin UI: `/story-beats` page — list beats in order, add/edit/delete beats
3. Admin UI: Beat detail view — shows which dialogues set this beat, which scenes require it
4. Update `STORY_PROGRESSION_CONTEXT.md` to reflect implemented state

**Why fifth**: Now that beats exist in content, authors need a way to manage them without editing YAML by hand. Simple forms, not visual editors.

---

## Milestone 6: Content List Views

**Goal**: Read-only browsers for dialogues, scenes, and characters.

**Estimated effort**: 3-4 days

### Tasks
1. Server endpoints: `GET /admin/dialogues`, `GET /admin/scenes`, `GET /admin/characters` — list with pagination
2. Admin UI: `/dialogues` page — table of dialogue trees with node count, beat associations
3. Admin UI: `/scenes` page — table of scenes with `required_story_beat` column
4. Admin UI: `/characters` page — table of characters with portrait status
5. Click-through to detail views (read-only YAML preview)

**Why sixth**: Before editors, authors need to *see* what exists. Read-only is fast to build and immediately useful.

---

## Future Roadmap (Not in this milestone)
- Dialogue tree visual editor (drag-and-drop nodes)
- Scene map view with district layout
- Character relationship matrix
- Overlay diff viewer
- Inline YAML editor with live validation
- Story arc timeline visualization

---

## Dependency Chain

```
M1 (Security) → M2 (Admin Auth) → M3 (Pipeline Dashboard)
                                      ↓
                                   M4 (Beat Definition) → M5 (Beat UI)
                                      ↓
                                   M6 (Content List Views)
```

M1 and M2 are prerequisites for everything. M3 can ship independently of M4-M6. M4 is content work (YAML + schema), M5 is UI for M4. M6 is independent read-only views.

---

## Total Estimated Effort
**~15-20 days** for all milestones, shippable incrementally.

Each milestone builds a foundation for the next, with clear value delivered at each step:
- M1: Secure system ✅
- M2: Admin access control ✅
- M3: One-click content pipeline (READY)
- M4: Structured story progression
- M5: Beat management UI
- M6: Content visibility