# Phase 3: Mission Authoring

> **Goal:** Rename the `mystery` content type to `mission` across schemas, YAML directory, and admin UI (keeping DB table/column names as `mysteries`/`mystery_id`). Add a `story` content type that groups a mission with its associated characters, scenes, dialogues, overlays, and vault items. Build a YAML content editor, content linker, and mission creation wizard in the admin UI.
>
> **Dependencies:** None for base (textarea editor). Optional: `@monaco-editor/react` for syntax highlighting.
>
> **Prerequisites:** Phase 0 complete (server file read/write endpoints working), content pipeline functional
>
> **Status:** ✅ Complete

---

## Tasks

### 3A — Schema Rename: mystery → mission

**Purpose:** Rename the `mystery` concept to `mission` in YAML schemas, content directory, and admin UI. DB tables and columns remain as `mysteries`/`mystery_id` — a mapping layer in `upsert.ts` translates between the two.

**Files to modify:**

| File | Changes |
|------|---------|
| `shared/src/schemas/yaml-content.ts` | Rename `YAMLMysterySchema` → `YAMLMissionSchema`, `YAMLMysteryFileSchema` → `YAMLMissionFileSchema` |
| `shared/src/schemas/content-validation.ts` | Add `'mission'` to `ContentType` enum |
| `server/src/content/validate.ts` | Detect `/missions/` in `getContentTypeFromPath`, parse with `YAMLMissionSchema` |
| `server/src/content/migrate.ts` | Add `mission: 'missions'` to `CONTENT_TYPE_TABLE`, update processing order |
| `server/src/content/upsert.ts` | Add `mission` case that maps to `mysteries` table INSERT/UPDATE |
| `content/mysteries/` | Rename directory to `content/missions/` |
| `content/missions/mystery_great_lithium_leak.yaml` | Rename file to `mission_great_lithium_leak.yaml` |
| `content/overlays/*.yaml` | Rename `mystery_id` field to `mission_id` |
| `content/vault/*.yaml` | Rename `mystery_id` field to `mission_id` |
| `admin/src/app/mysteries/` | Rename directory to `admin/src/app/missions/` |
| `admin/src/app/components/AdminNav.tsx` | Change `/mysteries` link to `/missions` |

**DB mapping layer (in `upsert.ts`):**

```typescript
// YAML uses 'mission' but DB table is 'mysteries'
// The upsert function maps mission YAML → mysteries table INSERT/UPDATE
// All FK columns (dialogue_overlays.mystery_id, vault_items.mystery_id, etc.)
// continue to use 'mystery_id' — the mapping happens in the SQL statements only.
```

**ContentType enum update:**

```typescript
// shared/src/schemas/content-validation.ts
export const ContentTypeSchema = z.enum([
  'character', 'dialogue', 'overlay', 'scene', 'gig', 'vault',
  'mission',  // was 'mystery'
  'shop_item', 'location', 'map_tile', 'story_beat', 'story'
]);
```

**YAML field renames (overlay/vault files):**

| File | Old Field | New Field |
|------|-----------|-----------|
| `content/overlays/overlay_*.yaml` | `mystery_id` | `mission_id` |
| `content/vault/*.yaml` (items with mystery refs) | `mystery_id` | `mission_id` |

**Verification:**
- [ ] `npm run build --workspace=shared` passes
- [ ] `npm run validate:content` passes after rename
- [ ] `npm run migrate` succeeds with renamed content
- [ ] Admin `/missions` page shows mission data (was `/mysteries`)
- [ ] Overlay YAMLs use `mission_id` field
- [ ] Vault YAMLs use `mission_id` field
- [ ] DB queries still work (mysteries table, mystery_id columns unchanged)

---

### 3B — Stories Content Type

**Purpose:** Add a `story` content type that acts as a "mission package" — grouping a mission with all its associated characters, scenes, dialogues, overlays, and vault items into a single manifest YAML.

**Files to create:**

| File | Purpose |
|------|---------|
| `shared/src/schemas/story.ts` | `YAMLStorySchema` definition |
| `content/stories/` | Directory for story YAML files |
| `server/src/database/migrations/XXX_stories.sql` | Create `stories` table |
| `admin/src/app/stories/page.tsx` | Story list view |
| `admin/src/app/stories/[id]/page.tsx` | Story detail view |
| `admin/src/app/api/admin/stories/route.ts` | Next.js API proxy |

**Files to modify:**

| File | Changes |
|------|---------|
| `shared/src/schemas/content-validation.ts` | Add `'story'` to `ContentType` enum |
| `server/src/content/validate.ts` | Detect `/stories/`, validate with `YAMLStorySchema` |
| `server/src/content/migrate.ts` | Add `story: 'stories'` to `CONTENT_TYPE_TABLE` |
| `server/src/content/upsert.ts` | Add `story` type handler |
| `admin/src/app/components/AdminNav.tsx` | Add `/stories` link |

**YAML Schema:**

```yaml
stories:
  - id: "e4f5a6b7-c8d9-0123-efab-456789012345"
    title: "The Great Lithium Leak — Complete Package"
    description: "Full mission package for the lithium leak storyline"
    mission_id: "a0000000-e29b-41d4-a716-446655440001"
    characters:
      - "b2c3d4e5-f6a7-8901-bcde-f12345678901"  # Marco
      - "..."                                     # other characters
    scenes:
      - "..."  # scene IDs
    dialogues:
      - "f6a7b8c9-d0e1-2345-fabc-456789012345"  # target tree
    overlays:
      - "c0000000-e29b-41d4-a716-446655440001"  # overlay ID
    vault_items:
      - "b0000000-e29b-41d4-a716-446655440001"  # vault item ID
    written_by: "Author Name"
    lore_ref: "stories/the_great_lithium_leak.md"
```

**Schema definition (`shared/src/schemas/story.ts`):**

```typescript
import { z } from 'zod';

export const YAMLStorySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  mission_id: z.string().uuid(),
  characters: z.array(z.string().uuid()).default([]),
  scenes: z.array(z.string().uuid()).default([]),
  dialogues: z.array(z.string().uuid()).default([]),
  overlays: z.array(z.string().uuid()).default([]),
  vault_items: z.array(z.string().uuid()).default([]),
  written_by: z.string().max(255).optional(),
  lore_ref: z.string().max(255).optional(),
});

export const YAMLStoryFileSchema = z.object({
  stories: z.array(YAMLStorySchema),
});
```

**DB table (`stories`):**

```sql
CREATE TABLE stories (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  mission_id UUID REFERENCES mysteries(id) ON DELETE SET NULL,
  characters UUID[] DEFAULT '{}',
  scenes UUID[] DEFAULT '{}',
  dialogues UUID[] DEFAULT '{}',
  overlays UUID[] DEFAULT '{}',
  vault_items UUID[] DEFAULT '{}',
  written_by VARCHAR(255),
  lore_ref VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Verification:**
- [ ] Story YAML validates against `YAMLStorySchema`
- [ ] `npm run validate:content` includes story validation
- [ ] `npm run migrate` creates story records in `stories` table
- [ ] Admin `/stories` page lists stories
- [ ] Story detail view shows linked mission and content IDs

---

### 3C — YAML Content Editor (`/editor`)

**Files to create:**
- `admin/src/app/editor/page.tsx` — content editor page
- `admin/src/app/api/admin/content/tree/route.ts` — Next.js API proxy
- `admin/src/app/api/admin/content/file/route.ts` — Next.js API proxy (GET + PUT)

**Files to modify:**
- `admin/src/app/components/AdminNav.tsx` — add `/editor` link

**Purpose:** Provide a textarea-based YAML editor where authors can read and write content YAML files directly from the admin UI.

**UI Layout:**

```
┌─────────────────────────────────────────────┐
│ Content Editor                    [Save]     │
├──────────┬──────────────────────────────────┤
│ content/ │ id: "e6f7a8b9-..."              │
│ ├── characters│ name: "Ana Kim"            │
│ │  ├ char_ana │ lore_ref: "figures/ana..." │
│ │  ├ char_alex│ description: "..."          │
│ │  └ ...      │ metadata:                   │
│ ├── scenes/  │   type: "human"             │
│ ├── dialogues│   role: "npc"               │
│ ├── missions │ portrait_urls:               │
│ ├── stories  │   - url: "..."              │
│ ├── overlays │     label: "Standard"        │
│ └── ...      │     expression: "neutral"    │
│              │                              │
│ Line: 42  Col: 15                    UTF-8  │
└──────────┴──────────────────────────────────┘
```

**Left panel (file tree):**
- Directory tree of `content/` (fetched from `GET /admin/content/tree`)
- Grouped by content type (characters, scenes, dialogues, missions, stories, etc.)
- "New file" button per directory
- Color-coded icons per type

**Right panel (editor):**
- `<textarea>` with monospace font for YAML editing
- Line numbers displayed alongside
- Status bar showing file path, last saved timestamp
- "Save" button (sends `PUT /admin/content/file`)
- On save: validates YAML before writing, shows errors inline

**Server endpoints (already specified in Phase 0C):**
- `GET /admin/content/tree` — list all YAML files
- `GET /admin/content/file?path=...` — read YAML content
- `PUT /admin/content/file` — write YAML content (with validation)

**Implementation notes:**
- Use `useSWR` or simple `useEffect` + `fetch` for data loading
- Debounce save (auto-save after 30s of inactivity)
- On save: client sends YAML string, server validates with `js-yaml`, optionally runs `validateContentByType`
- Show validation errors in a panel below the editor
- Track dirty state (has the file changed since last save?)
- Confirm before navigating away from unsaved changes

**Verification:**
- [ ] `/editor` shows file tree on left, editor on right
- [ ] Clicking a file loads its content into the editor
- [ ] Editing and saving writes to the YAML file
- [ ] Invalid YAML shows validation error and prevents save
- [ ] Dirty state warning on navigation
- [ ] Auto-save works
- [ ] "New file" creates a new YAML file in the selected directory
- [ ] `content/missions/` and `content/stories/` appear in file tree

---

### 3D — Content Linker

**Files to create:**
- `admin/src/app/content-linker/page.tsx` — content linker UI
- `admin/src/app/api/admin/content/link/route.ts` — Next.js API proxy

**Files to modify:**
- `admin/src/app/components/AdminNav.tsx` — add `/content-linker` link
- `server/src/routes/admin-content.ts` — add link endpoints

**Server endpoints (add to `admin-content.ts`):**

| Endpoint | Purpose |
|----------|---------|
| `POST /admin/content/link-npc` | Add NPC to scene's `metadata.npcs[]` |
| `POST /admin/content/link-dialogue` | Add dialogue to scene's `available_dialogues[]` |
| `POST /admin/content/link-character` | Set `speaker_id` on dialogue node |
| `POST /admin/content/link-mission-overlay` | Set `mission_id` on overlay YAML |
| `POST /admin/content/link-mission-vault` | Set `mission_id` on vault item YAML |
| `POST /admin/content/link-story-mission` | Set `mission_id` on story YAML |
| `POST /admin/content/link-story-content` | Add content IDs to story's arrays |

**Purpose:** Provide UI for linking content types together — the connections that make the game world coherent.

**Link Types:**

| Link | Source Field | Target | Update Method |
|------|-------------|--------|---------------|
| NPC → Scene | `scene.metadata.npcs[]` | `character.id` | YAML field update |
| Dialogue → Scene | `scene.available_dialogues[]` | `dialogue.id` | YAML field update |
| Character → Dialogue | `dialogue.nodes[].speaker_id` | `character.id` | YAML field update |
| Mission → Overlay | `overlay.mission_id` | `mission.id` | YAML field update |
| Mission → Vault | `vault_item.mission_id` | `mission.id` | YAML field update |
| Mission → Story | `story.mission_id` | `mission.id` | YAML field update |
| Content → Story | `story.characters[]`, etc. | content IDs | YAML array update |

**UI Layout — Scene Linker:**

```
┌─────────────────────────────────────────────┐
│ Content Linker — Scenes                     │
├─────────────────────────────────────────────┤
│ Select Scene: [Old Town Café ▼]             │
│                                              │
│ NPCs in this scene:                         │
│ ┌─────────────────────────────────────────┐ │
│ │ ✅ char_barista (The Barista)    [Remove]│ │
│ │ ❌ char_alex (Alex Garcia)       [Add]  │ │
│ │ ❌ char_vance (Handler)          [Add]  │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Available Dialogues:                        │
│ ┌─────────────────────────────────────────┐ │
│ │ ✅ welcome_dialogue             [Remove]│ │
│ │ ❌ dialogue_first_contact       [Add]   │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ [Save Changes]                               │
└─────────────────────────────────────────────┘
```

**UI Layout — Mission Linker:**

```text
┌─────────────────────────────────────────────┐
│ Content Linker — Missions                   │
├─────────────────────────────────────────────┤
│ Select Mission: [The Great Lithium Leak ▼]  │
│                                              │
│ Linked Overlays:                            │
│ ┌─────────────────────────────────────────┐ │
│ │ ✅ overlay_lithium_leak          [Remove]│ │
│ │ ❌ overlay_another_mystery       [Add]   │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Linked Vault Items:                         │
│ ┌─────────────────────────────────────────┐ │
│ │ ✅ lithium_leak_clues            [Remove]│ │
│ │ ❌ starter_clues                 [Add]   │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Linked Story:                               │
│ ┌─────────────────────────────────────────┐ │
│ │ ✅ story_lithium_leak            [Remove]│ │
│ │ ❌ (no story linked)                     │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ [Save Changes]                               │
└─────────────────────────────────────────────┘
```

**Implementation notes:**
- Read scene/character/dialogue data from DB (faster than YAML parsing)
- Write updates to YAML files (source of truth)
- On save: read YAML, update field, validate, write back
- Show current state vs proposed changes before saving
- Undo/redo within session

**Verification:**
- [ ] Can add NPCs to a scene
- [ ] Can remove NPCs from a scene
- [ ] Can add dialogues to a scene
- [ ] Can remove dialogues from a scene
- [ ] Can link overlays to missions (`mission_id` field)
- [ ] Can link vault items to missions (`mission_id` field)
- [ ] Can link missions to stories (`mission_id` field)
- [ ] Can add content IDs to stories
- [ ] Changes persist in YAML files
- [ ] Validation passes after changes

---

### 3E — Mission Wizard

**Files to create:**
- `admin/src/app/missions/new/page.tsx` — mission creation wizard
- `admin/src/app/missions/page.tsx` — mission list view
- `admin/src/app/missions/[id]/page.tsx` — mission detail view
- `admin/src/app/api/admin/missions/route.ts` — Next.js API proxy

**Files to modify:**
- `admin/src/app/components/AdminNav.tsx` — add `/missions` link (done in 3A)

**Purpose:** Guide authors through creating a new mission with all its associated content (characters, scenes, dialogues, vault items, overlays) and packaging it into a story.

**Wizard Steps:**

```text
Step 1: Define Mission
  ┌─────────────────────────────────────────────┐
  │ Title: [The Great Lithium Leak             ]│
  │ Description: [Decades after the...         ]│
  │ Status: [ACTIVE ▼]                         │
  │ Lore ref: [stories/the_great_lithium... ▼] │
  │ [Next →]                                    │
  └─────────────────────────────────────────────┘

Step 2: Add Characters
  ┌─────────────────────────────────────────────┐
  │ Select characters for this mission:          │
  │ ☑ char_ana_kim (Ana Kim)                   │
  │ ☐ char_alex (Alex Garcia)                   │
  │ ☐ char_miguel (Miguel Jhonson)              │
  │ [+ Create New Character]                    │
  │ [← Back] [Next →]                           │
  └─────────────────────────────────────────────┘

Step 3: Add Scenes
  ┌─────────────────────────────────────────────┐
  │ Select scenes for this mission:              │
  │ ☑ scene_cafe (Old Town Café)               │
  │ ☐ scene_estacion_central                    │
  │ [+ Create New Scene]                        │
  │ [← Back] [Next →]                           │
  └─────────────────────────────────────────────┘

Step 4: Add Dialogues
  ┌─────────────────────────────────────────────┐
  │ Select dialogues for this mission:           │
  │ ☐ dialogue_aisha_al_sayed                  │
  │ [+ Create New Dialogue]                     │
  │ [← Back] [Next →]                           │
  └─────────────────────────────────────────────┘

Step 5: Add Content (Vault + Overlays)
  ┌─────────────────────────────────────────────┐
  │ Vault Items:                                 │
  │ ┌─────────────────────────────────────────┐ │
  │ │ Title: [Evidence Document             ] │ │
  │ │ Type: [clue ▼]                         │ │
  │ │ [+ Add]                                 │ │
  │ └─────────────────────────────────────────┘ │
  │                                              │
  │ Overlays:                                    │
  │ ┌─────────────────────────────────────────┐ │
  │ │ Target Dialogue: [select ▼]             │ │
  │ │ [+ Add Overlay]                         │ │
  │ └─────────────────────────────────────────┘ │
  │ [← Back] [Next →]                           │
  └─────────────────────────────────────────────┘

Step 6: Package as Story
  ┌─────────────────────────────────────────────┐
  │ Story Package:                               │
  │ ┌─────────────────────────────────────────┐ │
  │ │ Title: [The Great Lithium Leak — Full  ] │ │
  │ │ Description: [Complete package for...  ] │ │
  │ │ Lore ref: [stories/lithium_leak.md    ] │ │
  │ │                                          │ │
  │ │ Included in this story:                 │ │
  │ │   Mission: The Great Lithium Leak       │ │
  │ │   Characters: 2 selected                │ │
  │ │   Scenes: 1 selected                    │ │
  │ │   Dialogues: 1 selected                 │ │
  │ │   Overlays: 1 selected                  │ │
  │ │   Vault Items: 1 selected               │ │
  │ │                                          │ │
  │ │ [Skip Story — Generate Mission Only]    │ │
  │ │ [← Back] [Generate Mission]             │ │
  │ └─────────────────────────────────────────┘ │
  └─────────────────────────────────────────────┘
```

**Generate Output:**
After completing the wizard, the server:
1. Creates `content/missions/mission_[slug].yaml` (mission data)
2. Creates `content/stories/story_[slug].yaml` (story package — links mission to all content)
3. Creates or updates `content/characters/char_*.yaml` for new characters
4. Creates or updates `content/scenes/scene_*.yaml` with NPC/dialogue links
5. Creates `content/dialogues/dialogue_*.yaml` for new dialogues
6. Creates `content/vault/vault_*.yaml` for vault items (with `mission_id`)
7. Creates `content/overlays/overlay_*.yaml` for overlays (with `mission_id`)

**Implementation notes:**
- Store wizard state in React (no DB persistence until "Generate")
- On "Generate Mission": server generates all YAML files, validates, reports results
- Each step is a separate component
- Show progress bar at top
- Allow skipping steps (e.g., no vault items, skip story)
- After generation: show link to migrated content
- Step 6 (story packaging) is skippable — authors can create missions without stories

**Verification:**
- [ ] Wizard creates all necessary YAML files
- [ ] Characters are linked to scenes
- [ ] Dialogues are linked to scenes and characters
- [ ] Mission appears in `/missions` list view
- [ ] Vault items are created and linked to mission (`mission_id`)
- [ ] Overlays are created and linked to mission dialogues (`mission_id`)
- [ ] Story YAML is created with correct `mission_id` and content ID arrays
- [ ] `npm run validate:content` passes after generation
- [ ] `npm run migrate` succeeds with new content
- [ ] Story record appears in `stories` DB table

---

## Verification Checklist

- [ ] Mystery → Mission rename complete (schemas, directory, UI)
- [ ] `YAMLMissionSchema` replaces `YAMLMysterySchema` in shared schemas
- [ ] `content/missions/` directory replaces `content/mysteries/`
- [ ] Admin `/missions` page replaces `/mysteries`
- [ ] Overlay/vault YAMLs use `mission_id` field
- [ ] DB references still work (`mysteries` table, `mystery_id` columns unchanged)
- [ ] Stories content type validates and migrates
- [ ] `stories` DB table created via migration
- [ ] `/editor` page allows reading and writing YAML files
- [ ] File validation prevents writing invalid YAML
- [ ] `/content-linker` page allows linking NPCs, dialogues, overlays, vault items, missions, stories
- [ ] Links persist in YAML files
- [ ] `/missions` page lists existing missions
- [ ] Mission wizard creates all required YAML files including story package
- [ ] Generated content validates and migrates successfully
- [ ] `npm run validate:content` passes with all renamed types
- [ ] `npm run lint --workspace=admin` passes
- [ ] `npm run build --workspace=admin` passes
- [ ] `npm run lint --workspace=server` passes
- [ ] `npm run build --workspace=server` passes
