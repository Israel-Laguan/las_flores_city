# Phase 0: Server Foundation

> **Goal:** Create server endpoints for reading lore markdown, listing content coverage, and reading/writing content YAML files. These endpoints power all admin UI features in later phases.
>
> **Dependencies:** None (uses existing `fs/promises`, `js-yaml`, `glob`, `zod`)
>
> **Status:** ✅ Complete

---

## Prerequisites

- [x] Server is running and healthy
- [x] `authAndAdminMiddleware` is working (all admin routes authenticated)
- [x] `docs/` volume mount is present (read-only is fine)
- [x] `content/` volume mount is present (read-write)

---

## Tasks

### 0A — Add `lore_ref` field to YAML schemas

**Files to modify:**
- `shared/src/schemas/yaml-content.ts`

**Changes:**
- Add optional `lore_ref: z.string().max(255).optional()` to:
  - `YAMLCharacterSchema`
  - `YAMLSceneSchema`
  - `YAMLMysterySchema`
  - `YAMLDialogueSchema`
  - `YAMLOverlaySchema`
  - `YAMLLocationSchema`

**Purpose:** Each content YAML can optionally point to its source lore markdown file. This enables the coverage dashboard to cross-reference lore → content.

**Verification:**
- [x] `npm run build --workspace=shared` passes
- [x] Existing YAML files still validate (field is optional)
- [x] New YAML files with `lore_ref` validate

---

### 0B — Create `/admin/lore` server endpoints

**Files to create:**
- `server/src/routes/admin-lore.ts` — new router

**Files to modify:**
- `server/src/index.ts` — register `admin-lore` router

**Endpoints:**

#### `GET /admin/lore/tree`
Returns a directory tree of all markdown files under `docs/lore/`.

```json
{
  "success": true,
  "data": {
    "tree": [
      {
        "path": "figures/ana_kim.md",
        "name": "ana_kim",
        "type": "figure",
        "category": "figures",
        "size": 12450,
        "modifiedAt": "2026-07-01T..."
      }
    ]
  }
}
```

**Implementation notes:**
- Walk `docs/lore/` recursively using `fs.promises.readdir`
- Return only `.md` files (skip `.prompt.md`, `.png`, etc.)
- Include file size and modification time
- Infer `type` from directory name (e.g., `figures/` → `figure`, `districts/` → `district`)

#### `GET /admin/lore/file?path=figures/ana_kim.md`
Returns the raw content of a single markdown file.

```json
{
  "success": true,
  "data": {
    "path": "figures/ana_kim.md",
    "content": "# Ana Kim\n\n> Tags: ...",
    "size": 12450,
    "modifiedAt": "2026-07-01T..."
  }
}
```

**Implementation notes:**
- Validate that the path:
  1. Starts with a known lore subdirectory (e.g., `figures/`, `districts/`, `landmarks/`, `stories/`, `communities/`, `companies/`, `events/`, `organizations/`, `families/`, `media/`, `platforms/`, `partnerships/`, `humanity_first/`, `assets/`, `guides/`)
  2. Does not contain `..` (path traversal guard)
  3. Ends with `.md`
  4. Resolves to an existing file
- Reject `.prompt.md` files (they're prompts, not lore content)
- Read file with `fs.promises.readFile` with `utf-8` encoding

#### `GET /admin/lore/search?q=keyword`
Returns search results across all lore markdown files.

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "path": "figures/ana_kim.md",
        "name": "ana_kim",
        "match": "Ana Kim is the **honest mirror** of..."
      }
    ]
  }
}
```

**Implementation notes:**
- Simple case-insensitive substring search
- Return first 200 chars of the match for context
- Skip binary files (`.png`, `.jpg`)

**Verification:**
- [x] `GET /admin/lore/tree` returns all markdown files
- [x] `GET /admin/lore/file?path=figures/ana_kim.md` returns content
- [x] `GET /admin/lore/file?path=../.env` returns 400 (path traversal blocked)
- [x] `GET /admin/lore/file?path=figures/ana_kim.prompt.md` returns 400 (prompt files rejected)
- [x] `GET /admin/lore/search?q=Ana+Kim` returns results
- [x] All endpoints return 401/403 without valid admin auth

---

### 0C — Create `/admin/content/file` endpoints

**Files to modify:**
- `server/src/routes/admin-content.ts` — add file read/write endpoints

**Purpose:** These endpoints allow the admin to read and write content YAML files. Writing is gated to prevent accidental corruption.

#### `GET /admin/content/file?path=characters/char_ana_kim.yaml`
Returns the raw content of a YAML file.

```json
{
  "success": true,
  "data": {
    "path": "characters/char_ana_kim.yaml",
    "content": "id: \"e6f7a8b9-...\"\nname: \"Ana Kim\"\n...",
    "size": 350,
    "modifiedAt": "2026-07-01T..."
  }
}
```

**Implementation notes:**
- Validate path against `content/` directory
- Path traversal guard (reject `..`)
- Must end with `.yaml`
- Resolve relative to `resolveContentDir()` (same helper used by validate/migrate)
- Read with `fs.promises.readFile`

#### `PUT /admin/content/file`
Writes content to a YAML file. Requires admin role.

**Request:**
```json
{
  "path": "characters/char_new_character.yaml",
  "content": "id: \"...\"\nname: \"...\"\n..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "characters/char_new_character.yaml",
    "size": 350,
    "modifiedAt": "2026-07-06T..."
  }
}
```

**Implementation notes:**
- Same path validation as GET
- Parse the YAML after writing to verify it's valid YAML
- Optionally validate content before saving (runs `validateContentByType`)
- Use `fs.promises.writeFile` with atomic write pattern (write to `.tmp`, rename)

#### `GET /admin/content/tree`
Returns a directory tree of all YAML files under `content/`.

```json
{
  "success": true,
  "data": {
    "tree": [
      {
        "path": "characters/char_ana_kim.yaml",
        "name": "char_ana_kim",
        "type": "character",
        "size": 350,
        "modifiedAt": "2026-07-01T..."
      }
    ]
  }
}
```

**Implementation notes:**
- Walk `content/` recursively
- Return only `.yaml` files
- Infer `type` from subdirectory name (e.g., `characters/` → `character`, `scenes/` → `scene`)

**Verification:**
- [x] `GET /admin/content/tree` returns all YAML files
- [x] `GET /admin/content/file` returns YAML content
- [x] `PUT /admin/content/file` writes new YAML file
- [x] `PUT /admin/content/file` with invalid YAML returns 400
- [x] Path traversal attacks are blocked (returns 400)
- [x] Non-admin user gets 403 on PUT

---

### 0D — Create `/admin/coverage` endpoint

**Files to create:**
- `server/src/routes/admin-coverage.ts` — new router

**Files to modify:**
- `server/src/index.ts` — register `admin-coverage` router

**Purpose:** Cross-reference lore markdown files against content YAML files to find coverage gaps.

#### `GET /admin/coverage`

Returns a coverage report showing which lore entities have corresponding content YAML files.

```json
{
  "success": true,
  "data": {
    "byType": {
      "figures": {
        "total": 128,
        "withCharacterYaml": 160,
        "missingLoreRef": 45,
        "withoutPortrait": 120,
        "items": [
          {
            "name": "ana_kim",
            "lorePath": "figures/ana_kim.md",
            "hasCharacterYaml": true,
            "hasPortraitUrl": true,
            "hasDialogue": false
          }
        ]
      },
      "districts": {
        "total": 11,
        "withScene": 5,
        "items": [
          {
            "name": "south",
            "lorePath": "districts/south.md",
            "hasScene": true,
            "sceneCount": 2
          }
        ]
      },
      "landmarks": {
        "total": 70,
        "withScene": 1,
        "items": [...]
      },
      "stories": {
        "total": 40,
        "withMystery": 1,
        "items": [...]
      }
    }
  }
}
```

**Implementation notes:**
- Walk `docs/lore/figures/` for figures, cross-reference against `content/characters/` YAMLs by extracting the name from the markdown filename and matching against character YAML filenames
- Walk `docs/lore/districts/` for districts, cross-reference against `content/scenes/` by checking `scene.district` field
- Walk `docs/lore/landmarks/` for landmarks, cross-reference against `content/scenes/` by name similarity
- Walk `docs/lore/stories/` for stories, cross-reference against `content/mysteries/` by name similarity
- Check DB tables for portrait_urls, background_url completeness

**Verification:**
- [x] `GET /admin/coverage` returns a comprehensive report
- [x] Report correctly identifies which figures have character YAMLs
- [x] Report correctly identifies which districts have scenes
- [x] Report correctly identifies characters without portraits
- [x] Report correctly identifies scenes without backgrounds

---

### 0E — Expand prompt catalog to include figures and landmarks

**Files to modify:**
- `server/src/routes/assets.helpers.ts` — modify `getPromptRoot()` and `getPromptCatalog()`

**Changes:**
1. Create a new function `getPromptRoots()` that returns an array of directories:
   - `docs/lore/assets/ui-concepts` (existing)
   - `docs/lore/figures` (new — contains `*.prompt.md` files for character portraits)
   - `docs/lore/landmarks` (new — contains `*.prompt.md` files for location backgrounds)

2. Modify `getPromptCatalog()` to scan all directories and merge results
3. Add category labels for new sources:
   - `figures` → `🎭 Character Portraits` 
   - `landmarks` → `🏙️ Location Backgrounds`

4. Ensure the `**Type:**` field in prompt files is correctly parsed to differentiate `portrait` vs `background` vs existing types

**Verification:**
- [x] `GET /assets/prompt-catalog` now shows 5 categories (existing 3 + 2 new)
- [x] Character portrait prompts from `docs/lore/figures/*.prompt.md` appear
- [x] Location background prompts from `docs/lore/landmarks/**/*.prompt.md` appear
- [x] Existing `ui-concepts` prompts still work

---

## Verification Checklist

- [x] All new server endpoints work with valid admin auth
- [x] All new server endpoints return 401/403 without auth
- [x] Path traversal is blocked on all file endpoints
- [x] Shared schemas build successfully
- [x] Coverage report is accurate
- [x] Prompt catalog includes figures and landmarks
- [x] `npm run lint --workspace=server` passes
- [x] `npm run build --workspace=server` passes

## Registration in index.ts

Add to `server/src/index.ts`:

```typescript
import { adminLoreRouter } from './routes/admin-lore.js';
import { adminCoverageRouter } from './routes/admin-coverage.js';
// ... existing imports ...

app.use('/admin/lore', adminLoreRouter);
app.use('/admin/coverage', adminCoverageRouter);
```

The `/admin/content/file` endpoints should be added to the existing `adminContentRouter` in `admin-content.ts`.