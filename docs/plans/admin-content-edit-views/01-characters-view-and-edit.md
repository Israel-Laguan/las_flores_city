# Plan 01 — Characters: Readable Detail View + Form-Based Edit

> **Status:** Implemented (see [`docs/CONTENT_DB_CORRELATION_AUDIT.md`](../../CONTENT_DB_CORRELATION_AUDIT.md))
> **Scope:** `admin/src/app/(admin)/characters/`
> **Depends on:** Plan 00 (shared infrastructure)
> **Non-goals:** Other entities (see Plan 02 for locations); DB-direct editing (violates content-layering contract).

## 1. Context

`admin/src/app/(admin)/characters/[id]/page.tsx` currently fetches `GET /admin/characters/:id` (a `SELECT * FROM characters` DB row) and renders:

```tsx
<pre className={styles.json}>{JSON.stringify(record, null, 2)}</pre>
```

The list page (`characters/page.tsx`) is already a nice table; only the detail view is a JSON dump. The canonical source is `content/characters/<slug>/char_<slug>.yaml` (schema `YAMLCharacterSchema` in `shared/src/schemas/yaml-content.ts`).

## 2. Goals

1. Replace the characters detail page with a readable, labeled field view (no JSON).
2. Add a separate **edit** route (`characters/[id]/edit`) with a config-driven form (text fields, textareas, a relationships sub-editor with a `type` selector, a `available_dialogues` multi-select, and a metadata key/value editor).
3. Editing targets the YAML file via `PUT /admin/content/file` (Plan 00), then offers a "Run Migration" step to sync the DB.
4. Client-side validation against `YAMLCharacterSchema` (shared) before save.

## 3. Data shape (from `YAMLCharacterSchema`)

Key editable fields:
- `id` (uuid, read-only)
- `name` (string, required)
- `title` (string, optional)
- `description` (string, required, max 1000)
- `relationships` (array of `{ target_id, type: enum[friend|rival|romance|professional|family|enemy|mentor|subordinate], closeness: -100..100, trust?, context? }`)
- `avatar_url` (url, optional)
- `portrait_urls` (array of `{ url, label?, expression? }`)
- `available_dialogues` (uuid array)
- `metadata` (record<string, any>)
- `written_by`, `lore_ref`, `lore_path`, `asset_paths` (mostly read-only / path fields)

## 4. Approach

### 4.1 Detail view — `characters/[id]/page.tsx`

- Fetch `GET /admin/characters/:id` (DB row — shows the *live migrated* state, including `portraitStatus` and `portrait_urls`).
- Render via `<EntityDetailView fields={CHARACTER_DETAIL_FIELDS} record={record} title={record.name} />`.
- `CHARACTER_DETAIL_FIELDS` (in `field-definitions.ts`) maps DB columns to readable labels:
  - Basic: `name`, `title`, `description` (textarea), `portraitStatus` (badge: ready=success, missing=warning).
  - Portrait preview: `portrait_urls` (image type) if present.
  - Metadata: `metadata.role`, `metadata.faction`, `metadata.personality`, `metadata.appearance`, `metadata.interests`, `metadata.goals` (text).
  - Relationships: `relationships` (array-of-objects table: target_id, type, closeness, trust, context).
  - System: `id`, `created_at`, `updated_at`, `lore_path`, `asset_paths.portrait`.
- Add an **"Edit" button** → `/characters/[id]/edit`.

### 4.2 Edit view — `characters/[id]/edit/page.tsx` (new route)

- Load YAML via `useEntityYaml('character', id)` (Plan 00 resolver).
- Render `<EntityEditForm fields={CHARACTER_EDIT_FIELDS} yaml={yaml} ... />`.
- `CHARACTER_EDIT_FIELDS` (in `field-definitions.ts`):
  - `name` → text (required)
  - `title` → text
  - `description` → textarea (required, max 1000)
  - `relationships` → array-of-objects sub-editor: per row `{ target_id (text), type (select), closeness (number -100..100), trust (number), context (text) }`, add/remove rows.
  - `available_dialogues` → multi-select populated from `GET /admin/dialogues` (fetch list, render checkboxes).
  - `metadata` → key/value editor (add/remove pairs; values as text).
  - Read-only display of `id`, `lore_path`, `asset_paths.portrait` (not editable here).
- **Save flow:**
  1. Validate the assembled YAML object with `YAMLCharacterSchema.safeParse()`.
  2. On success: `useEntityYamlSave().save(path, yamlObj)` → `PUT /admin/content/file`.
  3. On success: show confirmation + **"Run Migration"** button → `POST /admin/content/migrate` (to sync the DB row the detail view reads).
- **Cancel/back** → link back to `/characters/[id]`.

### 4.3 Field definitions file

`admin/src/app/(admin)/characters/field-definitions.ts` exports:
- `CHARACTER_DETAIL_FIELDS: FieldDef[]` (DB-row view)
- `CHARACTER_EDIT_FIELDS: FieldDef[]` (YAML edit form)

Both derived from `YAMLCharacterSchema` for enum/optionality truth.

## 5. File-by-file changes

| File | Action |
|------|--------|
| `admin/src/app/(admin)/characters/[id]/page.tsx` | edit — replace JSON dump with `EntityDetailView` + Edit button |
| `admin/src/app/(admin)/characters/[id]/page.module.css` | edit — remove `.json` style, add field-grid styles (or reuse `EntityDetailView.module.css`) |
| `admin/src/app/(admin)/characters/[id]/edit/page.tsx` | **new** — form editor |
| `admin/src/app/(admin)/characters/[id]/edit/page.module.css` | **new** |
| `admin/src/app/(admin)/characters/field-definitions.ts` | **new** — `CHARACTER_DETAIL_FIELDS`, `CHARACTER_EDIT_FIELDS` |

## 6. Verification

- `npm run typecheck --workspace=admin`
- `npm run lint --workspace=admin`
- `npm run build --workspace=admin`
- Vitest: `admin/src/app/(admin)/characters/__tests__/charactersView.test.tsx` (render detail with a fixture record, assert fields appear, no `<pre>` JSON), `charactersEdit.test.tsx` (form renders, save calls `PUT /admin/content/file` with re-dumped YAML, migrate button calls `POST /admin/content/migrate`).
- Manual: open `/characters/<id>`, confirm readable layout; open `/characters/<id>/edit`, edit `name`, save, run migration, confirm detail view reflects the change.

## 7. Open questions

1. Should the detail view switch from DB-row to YAML-source (via the Plan 00 resolver) so it always reflects the file even before migration? (Lean: keep DB-row for now — it shows the *live* game state including portrait status; the edit view is YAML-based. Flag as a future option.)
2. `avatar_url` / `portrait_urls` editing — include in the form or keep read-only? (Lean: read-only here; asset publishing is the `AssetPublishService` flow.)
