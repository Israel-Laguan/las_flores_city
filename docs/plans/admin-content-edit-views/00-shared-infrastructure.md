# Plan 00 — Shared Infrastructure for Content Entity View & Edit

> **Status:** Implemented (see [`docs/CONTENT_DB_CORRELATION_AUDIT.md`](../../CONTENT_DB_CORRELATION_AUDIT.md))
> **Scope:** Server resolver + shared admin components + field definitions
> **Depends on:** none
> **Blocks:** Plans 01 (Characters), 02 (Locations)
> **Non-goals:** Direct DB editing (would violate the `content/` = file DB / `server/` = sole mediator contract in `AGENTS.md`); scenes, dialogues, gigs, vault (out of scope — they can reuse this machinery later).

## 1. Context & problem

The admin detail pages for content entities currently render the raw Postgres row as a JSON dump:

```tsx
// admin/src/components/ContentDetailPage.tsx (lines 55-59)
<pre className={styles.json}>{JSON.stringify(record, null, 2)}</pre>
```

This is used by `scenes/[id]`, `locations/[id]`, `gigs/[id]`, `vault/[id]` (all delegate to `ContentDetailPage`), and `characters/[id]` / `dialogues/[id]` (which inline the same pattern).

To replace this with readable views and form-based editors, we need two things the codebase currently lacks:

1. **A way to resolve a DB entity `id` → its YAML file path.** Detail/list pages are id-based (`GET /admin/<type>/:id`); the YAML write endpoints (`PUT /admin/content/file`) are path-based. A form editor must load the YAML for a given id.
2. **Reusable, config-driven view + form components** so each entity plan only declares field definitions, not boilerplate.

## 2. Data-model reality (must be respected)

- **Canonical source = YAML** under `content/`. `server/` migrates YAML → DB. Editing the DB directly is a drift; the established pattern is edit-YAML-then-migrate (`AGENTS.md` "Content layering contract").
- **Characters** live in DB table `characters` (migrated from `content/characters/<slug>/char_<slug>.yaml`, schema `YAMLCharacterSchema`).
- **Locations** are **not** a table — they are `scenes` rows with `metadata->>'type' = 'location'`, migrated from `content/districts/<district>/locations/<slug>/location_<slug>.yaml` (schema `YAMLLocationSchema`). There is currently **no** `GET /admin/locations/:id` detail handler (this is fixed in Plan 02).
- **Existing write surface** (already admin-auth-guarded):
  - `GET  /admin/content/file?path=<rel>` — raw YAML read (`admin-content.tree.ts`)
  - `PUT  /admin/content/file` — atomic YAML write + `js-yaml.load` validation (`admin-content.ts`)
  - `POST /admin/content/link` — field-level add/remove/set ops (`admin-content-link.ts`)
  - `GET  /admin/content/tree` — list all content YAML files
  - `POST /admin/content/migrate` — migrate YAML → DB
  - `POST /admin/content/validate` — validate content
- **Path safety** is already handled by `validateContentPath()` (`admin-content.helpers.ts`): rejects empty, `..`, non-`.yaml`, and paths escaping `resolveContentDir()`.

## 3. Goals

1. Add a read-only `GET /admin/content/by-id?type=<type>&id=<uuid>` endpoint that returns the matching content file's relative path + parsed YAML object.
2. Provide shared admin components: `EntityDetailView` (readable, labeled fields — never raw JSON) and `EntityEditForm` (config-driven form).
3. Provide `useEntityYaml(type, id)` and `useEntityYamlSave()` hooks wrapping the resolver + `GET/PUT /admin/content/file` + optional `POST /admin/content/migrate`.
4. Provide per-entity `FieldDefinitions.ts` files (one for characters, one for locations) derived from the Zod schemas, so Plans 01/02 are declarative.

## 4. Approach

### 4.1 Server: `GET /admin/content/by-id`

Add to a new file `server/src/routes/admin-content-resolver.ts` (keeps `admin-content.ts` focused on pipeline ops) and mount it in `server/src/index.ts` alongside the other admin routers:

```ts
// server/src/index.ts
import { adminContentResolverRouter } from './routes/admin-content-resolver.js';
app.use('/admin/content', adminContentResolverRouter);
```

Endpoint:

```ts
// GET /admin/content/by-id?type=character&id=<uuid>
// Returns { success: true, data: { path: "characters/<slug>/char_<slug>.yaml", yaml: {...} } }
```

Implementation notes:
- Reuse `authAndAdminMiddleware` (admin-only, consistent with every other admin route).
- Reuse `resolveContentDir()` + `validateContentPath()`.
- Map `type` → content search roots:
  - `character` → `content/characters/**`
  - `location` → `content/districts/**/locations/**` (nested — locations are under district folders)
  - (extensible: `scene` → `content/scenes/**`, etc.)
- Walk the glob, `readFile` each YAML, `jsYaml.load`, compare top-level `id` field to the requested uuid. Return the first match.
- Reject unknown `type` with 400; no match with 404.
- **Performance:** for the current content size (tens of characters, ~25 locations) a linear scan is acceptable. Add a short in-process cache (Map keyed by `${type}:${id}`) with a TTL, invalidated on any `PUT /admin/content/file` or `POST /admin/content/link` write. Keep the cache optional/simple — do not introduce a new cache layer (respect `AGENTS.md`: use `getCache`/`setCache`/`deleteCache` only if needed; a plain module-level Map is fine for a dev tool).
- Validate the resolved path with `validateContentPath` before returning it (defense in depth, even though we generated it).

### 4.2 Shared admin components

Create `admin/src/components/entity/`:

- **`EntityDetailView.tsx`** — props: `record: unknown`, `fields: FieldDef[]`, optional `title`, optional `imageUrl`. Renders a two-column labeled field grid. Each `FieldDef` has:
  - `key` (dot-path into record, e.g. `metadata.role`)
  - `label`
  - `type`: `'text' | 'textarea' | 'number' | 'date' | 'badge' | 'array' | 'image' | 'link'`
  - `badgeVariant?` (for `badge` type → `success`/`warning`/`info`/`danger`)
  - `render?` (optional custom renderer)
  - `section?` (group fields under a heading)
  - For `array`/`array-of-objects`: render a small table.
- **`EntityEditForm.tsx`** — props: `yaml: Record<string,unknown>`, `fields: FieldDef[]`, `submitting`, `onChange`, `onSubmit`. Renders the same field config as form controls:
  - `text`/`textarea` → `<input>`/`<textarea>`
  - `number` → `<input type="number">`
  - `badge`/`select` → `<select>` (for enum fields like relationship `type`)
  - `array` → inline tag editor (add/remove strings)
  - `array-of-objects` → sub-table with per-field inputs (e.g. relationships, important_places)
  - `image` → read-only preview
  - All controls use `@las-flores/ui` global classes (`input`, `btn`, `badge`) + a local CSS Module.
- **`FieldDef` type** + helpers: `getByPath(obj, 'a.b.c')`, `setByPath`.

Styling: follow `docs/UI_STYLE_SYSTEM.md` — import `tokens.css` + `global.css` + `components.css` from `@las-flores/ui` (admin convention), use CSS Modules for layout. Do **not** unify the `--accent`/`--background` (tokens) vs `--color-*` (themes) namespaces.

### 4.3 Hooks

- **`useEntityYaml(type, id)`** — fetches `GET /admin/content/by-id?type=<type>&id=<id>`; returns `{ yaml, path, loading, error, refetch }`.
- **`useEntityYamlSave()`** — `save(path, yamlObj)` → `PUT /admin/content/file` with `jsYaml.dump(yamlObj, { lineWidth: -1, noRefs: true })`; returns `{ success, error }`. Separate `migrate()` → `POST /admin/content/migrate`.

### 4.4 Field definitions

Create `admin/src/app/(admin)/characters/field-definitions.ts` and `admin/src/app/(admin)/locations/field-definitions.ts`. Each exports a `FieldDef[]` derived from `YAMLCharacterSchema` / `YAMLLocationSchema` (import the Zod schemas from `@las-flores/shared` for the source of truth on enums/optionality). These are the only entity-specific declarations Plans 01/02 need.

## 5. File-by-file changes

| File | Action |
|------|--------|
| `server/src/routes/admin-content-resolver.ts` | **new** — `by-id` endpoint |
| `server/src/index.ts` | edit — import + mount router |
| `admin/src/components/entity/FieldDef.ts` | **new** — type + path helpers |
| `admin/src/components/entity/EntityDetailView.tsx` | **new** |
| `admin/src/components/entity/EntityDetailView.module.css` | **new** |
| `admin/src/components/entity/EntityEditForm.tsx` | **new** |
| `admin/src/components/entity/EntityEditForm.module.css` | **new** |
| `admin/src/components/entity/useEntityYaml.ts` | **new** |
| `admin/src/components/entity/useEntityYamlSave.ts` | **new** |
| `admin/src/app/(admin)/characters/field-definitions.ts` | **new** |
| `admin/src/app/(admin)/locations/field-definitions.ts` | **new** |

## 6. API contract

```
GET /admin/content/by-id?type=character&id=<uuid>
-> 200 { success: true, data: { path: "characters/peter_van_der_meer/char_peter_van_der_meer.yaml", yaml: { id, name, title, ... } } }
-> 400 { success: false, error: "type must be one of: character, location, ..." }
-> 404 { success: false, error: "No content file found for type 'character' with id '<uuid>'" }
```

## 7. Verification

- `npm run lint --workspace=server`
- `npm run build --workspace=server`
- `npm run typecheck --workspace=admin`
- `npm run lint --workspace=admin`
- `npm run build --workspace=admin`
- Vitest: `server/tests/integration/content-resolver.test.ts` (mock content dir or use real `content/` with a fixture uuid), `admin/src/components/entity/__tests__/*.test.tsx`.
- After server route changes: `docker compose build server && docker compose up -d server` then `docker exec las-flores-server wget -qO- http://localhost:3000/health` (in-container wget — alpine has no curl; host curl may return exit 56 from stale docker-proxy).

## 8. Open questions

1. **Cache invalidation:** should `PUT /admin/content/file` invalidate the by-id cache? (Lean yes — simplest is a module-level Map with TTL + clear on write.)
2. **Locations resolver search roots:** confirm `content/districts/**/locations/**` covers all location YAML. (Verified: `content/districts/southeast/locations/...`.)
3. **Field-definition completeness:** should `metadata` (a free-form `record(string, any)`) be a generic kv editor? (Lean yes — both schemas allow arbitrary metadata.)
