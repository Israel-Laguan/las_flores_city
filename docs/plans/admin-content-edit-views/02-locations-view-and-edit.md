# Plan 02 — Locations: Fix Detail Endpoint + Readable View + Form-Based Edit

> **Status:** Implemented (see [`docs/CONTENT_DB_CORRELATION_AUDIT.md`](../../CONTENT_DB_CORRELATION_AUDIT.md))
> **Scope:** `admin/src/app/(admin)/locations/` + one server route
> **Depends on:** Plan 00 (shared infrastructure)
> **Non-goals:** Other entities; DB-direct editing.

## 1. Context — and a bug to fix first

`admin/src/app/(admin)/locations/[id]/page.tsx` delegates to `ContentDetailPage`, which fetches `GET /admin/locations/:id`. **That endpoint does not exist.** `admin-list-views.ts` defines only `GET /admin/locations` (a filtered query: `SELECT ... FROM scenes WHERE metadata->>'type' = 'location'`). There is no `/locations/:id` handler, so the locations detail page always 404s and shows "Not found."

Locations are **not** a table — they are `scenes` rows tagged as locations, migrated from YAML at `content/districts/<district>/locations/<slug>/location_<slug>.yaml` (schema `YAMLLocationSchema`).

## 2. Goals

1. **Fix the broken detail endpoint** so the locations detail page works at all.
2. Replace the JSON dump with a readable, labeled field view.
3. Add a separate **edit** route (`locations/[id]/edit`) with a config-driven form (text fields, textareas, tags/aliases array editors, an important-places sub-editor, and map fields).
4. Editing targets the YAML file via `PUT /admin/content/file` (Plan 00), then offers "Run Migration."

## 3. Data shape (from `YAMLLocationSchema`)

Editable fields:
- `id` (uuid, read-only)
- `type` (literal `'location'`, read-only)
- `name` (string, required)
- `description` (string, optional)
- `district` (string, optional)
- `color` (nullable, optional)
- `aliases` (string array)
- `tags` (string array)
- `alwaysIncludeInContext`, `doNotTrack`, `noAutoInclude` (booleans)
- `history` (string)
- `daytime` (string), `nightlife` (string)
- `important_places` (array of `{ name, description }`)
- `conclusion` (string)
- `map` (`{ grid: {cols,rows}, base_tile, walkable_mask, spawn: {x,y}, waypoints: [{name,x,y}] }`)
- `lore_ref`, `image_urls`, `lore_path`, `asset_paths`

## 4. Approach

### 4.1 Bug fix — server: `GET /admin/locations/:id`

Add to `admin-list-views.ts` (alongside the existing `/locations` list handler):

```ts
adminListViewsRouter.get('/locations/:id', makeDetailHandler({
  sql: `SELECT * FROM scenes WHERE id = $1 AND metadata->>'type' = 'location'`,
  entityLabel: 'Location',
}));
```

This reuses the existing `makeDetailHandler` (404 on no row, returns `result.rows[0]`). It returns the DB row (which includes `metadata` containing the location-specific fields, plus `district_id`, `created_at`, etc.).

> **Note:** The DB `scenes` row stores location fields inside `metadata` (e.g. `metadata->>'district'`, `metadata->>'tags'`). The YAML schema (`YAMLLocationSchema`) is the flatter, canonical shape. The edit view will load YAML via the Plan 00 resolver (`GET /admin/content/by-id?type=location&id=<id>`), which searches `content/districts/**/locations/**`. The detail view will read from the DB row and flatten `metadata` for display.

### 4.2 Detail view — `locations/[id]/page.tsx`

- Fetch `GET /admin/locations/:id` (DB row).
- Flatten `record.metadata` into the record for display (e.g. `district` from `metadata.district`, `tags` from `metadata.tags`).
- Render via `<EntityDetailView fields={LOCATION_DETAIL_FIELDS} record={flattened} title={name} />`.
- `LOCATION_DETAIL_FIELDS` (in `field-definitions.ts`):
  - Basic: `name`, `description` (textarea), `district`, `tags` (badge array), `aliases` (array).
  - Booleans: `alwaysIncludeInContext`, `doNotTrack`, `noAutoInclude` (badge yes/no).
  - Lore: `history` (textarea), `daytime`, `nightlife`, `conclusion` (textarea).
  - Important places: `important_places` (array-of-objects table: name, description).
  - Map: `map.base_tile`, `map.spawn`, `map.grid`, `map.waypoints` (read-only structured display).
  - Assets: `image_urls` (image type), `lore_path`, `asset_paths.image`.
- Add an **"Edit" button** → `/locations/[id]/edit`.

### 4.3 Edit view — `locations/[id]/edit/page.tsx` (new route)

- Load YAML via `useEntityYaml('location', id)` (Plan 00 resolver — searches nested `content/districts/**/locations/**`).
- Render `<EntityEditForm fields={LOCATION_EDIT_FIELDS} yaml={yaml} ... />`.
- `LOCATION_EDIT_FIELDS` (in `field-definitions.ts`):
  - `name` → text (required)
  - `description` → textarea
  - `district` → text
  - `tags` → array editor (add/remove strings)
  - `aliases` → array editor
  - `history` → textarea
  - `daytime` → text
  - `nightlife` → text
  - `conclusion` → textarea
  - `important_places` → array-of-objects sub-editor: per row `{ name (text), description (textarea) }`, add/remove rows.
  - `map` → nested editor: `base_tile` (text), `grid.cols`/`grid.rows` (number), `spawn.x`/`spawn.y` (number), `walkable_mask` (text), `waypoints` (array-of-objects: name, x, y).
  - `image_urls` → read-only (asset publishing flow).
  - `id`, `type`, `lore_path`, `asset_paths` → read-only display.
- **Save flow:** same as Plan 01 — `YAMLLocationSchema.safeParse()` → `useEntityYamlSave().save(path, yamlObj)` → "Run Migration" button.

### 4.4 Field definitions file

`admin/src/app/(admin)/locations/field-definitions.ts` exports:
- `LOCATION_DETAIL_FIELDS: FieldDef[]` (DB-row view, with `metadata` flattening)
- `LOCATION_EDIT_FIELDS: FieldDef[]` (YAML edit form)

## 5. File-by-file changes

| File | Action |
|------|--------|
| `server/src/routes/admin-list-views.ts` | edit — add `GET /locations/:id` handler |
| `admin/src/app/(admin)/locations/[id]/page.tsx` | edit — replace `ContentDetailPage` JSON dump with `EntityDetailView` + Edit button |
| `admin/src/app/(admin)/locations/[id]/page.module.css` | edit/replace — remove `.json` style |
| `admin/src/app/(admin)/locations/[id]/edit/page.tsx` | **new** — form editor |
| `admin/src/app/(admin)/locations/[id]/edit/page.module.css` | **new** |
| `admin/src/app/(admin)/locations/field-definitions.ts` | **new** — `LOCATION_DETAIL_FIELDS`, `LOCATION_EDIT_FIELDS` |

## 6. Verification

- `npm run lint --workspace=server` + `npm run build --workspace=server`
- `npm run typecheck --workspace=admin` + `npm run lint --workspace=admin` + `npm run build --workspace=admin`
- Vitest:
  - `server/tests/integration/locations-detail.test.ts` — `GET /admin/locations/:id` returns 200 for a tagged scene, 404 for a non-location scene.
  - `admin/src/app/(admin)/locations/__tests__/locationsView.test.tsx` — detail renders fields, no `<pre>` JSON.
  - `admin/src/app/(admin)/locations/__tests__/locationsEdit.test.tsx` — form save calls `PUT /admin/content/file`; migrate button calls `POST /admin/content/migrate`.
- Manual: confirm `/locations/<id>` no longer shows "Not found"; edit `name`, save, migrate, confirm detail reflects change.

## 7. Open questions

1. **DB vs YAML for the detail view:** The DB `scenes` row stores location fields inside `metadata`. Should the detail view flatten `metadata` (DB-backed) or load YAML via the resolver (file-backed)? (Lean: flatten `metadata` from the DB row — keeps the detail view consistent with the live migrated state and avoids an extra resolver call; the edit view is YAML-based.)
2. **`map` editor complexity:** Is a full map sub-editor in scope, or should `map` be read-only in the form with a note to edit YAML directly? (Lean: include a minimal editor for `base_tile`, `spawn`, `grid`, `waypoints` since they're simple scalars/arrays; keep `walkable_mask` as a textarea.)
