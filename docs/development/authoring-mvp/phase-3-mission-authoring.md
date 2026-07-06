# Phase 3: Mission Authoring

> **Goal:** Allow authors to create and edit content YAML files directly from the admin UI, link content types together (characters ↔ scenes ↔ dialogues), and create missions/stories as grouped content collections.
>
> **Dependencies:** None for base (textarea editor). Optional: `@monaco-editor/react` for syntax highlighting.
>
> **Prerequisites:** Phase 0 complete (server file read/write endpoints working)
>
> **Status:** 🔲 Planned

---

## Tasks

### 3A — YAML Content Editor (`/editor`)

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
│ ├── mysteries│ portrait_urls:               │
│ └── ...      │   - url: "..."              │
│              │     label: "Standard"        │
│              │     expression: "neutral"    │
│              │                              │
│ Line: 42  Col: 15                    UTF-8  │
└──────────┴──────────────────────────────────┘
```

**Left panel (file tree):**
- Directory tree of `content/` (fetched from `GET /admin/content/tree`)
- Grouped by content type (characters, scenes, dialogues, etc.)
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

---

### 3B — Content Linker

**Files to create:**
- `admin/src/app/content-linker/page.tsx` — content linker UI
- `admin/src/app/api/admin/story-arc/link/route.ts` — Next.js API proxy

**Files to modify:**
- `admin/src/app/components/AdminNav.tsx` — add `/content-linker` link

**Server endpoints:**
- Add to `admin-content.ts`:
  - `POST /admin/content/link-npc` — add NPC to scene's `metadata.npcs`
  - `POST /admin/content/link-dialogue` — add dialogue to scene's `available_dialogues`
  - `POST /admin/content/link-character` — add character field to dialogue node's `speaker_id`

**Purpose:** Provide UI for linking content types together — the connections that make the game world coherent.

**Link Types:**

| Link | Source Field | Target | Update Method |
|------|-------------|--------|---------------|
| NPC → Scene | `scene.metadata.npcs[]` | `character.id` | YAML field update |
| Dialogue → Scene | `scene.available_dialogues[]` | `dialogue.id` | YAML field update |
| Character → Dialogue | `dialogue.nodes[].speaker_id` | `character.id` | YAML field update |
| Mystery → Overlay | `overlay.mystery_id` | `mystery.id` | YAML field update |
| Mystery → Vault | `vault_item.mystery_id` | `mystery.id` | YAML field update |

**UI Layout (Scene Linker as example):**

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
- [ ] Changes persist in YAML file
- [ ] Validation passes after changes

---

### 3C — Mission Wizard

**Files to create:**
- `admin/src/app/missions/new/page.tsx` — mission creation wizard
- `admin/src/app/missions/page.tsx` — mission list view
- `admin/src/app/missions/[id]/page.tsx` — mission detail view
- `admin/src/app/api/admin/missions/route.ts` — Next.js API proxy

**Files to modify:**
- `admin/src/app/components/AdminNav.tsx` — add `/missions` link

**Purpose:** Guide authors through creating a new mission (mystery) with all its associated content (characters, scenes, dialogues, vault items, overlays).

**Wizard Steps:**

```
Step 1: Define Mystery
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
  │ [← Back] [Generate Mission]                 │
  └─────────────────────────────────────────────┘
```

**Generate Output:**
After completing the wizard, the server:
1. Creates `content/mysteries/mystery_[slug].yaml` (mystery data)
2. Creates or updates `content/characters/char_*.yaml` for new characters
3. Creates or updates `content/scenes/scene_*.yaml` with NPC/dialogue links
4. Creates `content/dialogues/dialogue_*.yaml` for new dialogues
5. Creates `content/vault/vault_*.yaml` for vault items
6. Creates `content/overlays/overlay_*.yaml` for overlays
7. Optionally creates a `content/stories/story_*.yaml` story container

**Implementation notes:**
- Store wizard state in React (no DB persistence until "Generate")
- On "Generate Mission": server generates all YAML files, validates, reports results
- Each step is a separate component
- Show progress bar at top
- Allow skipping steps (e.g., no vault items)
- After generation: show link to migrated content

**Verification:**
- [ ] Wizard creates all necessary YAML files
- [ ] Characters are linked to scenes
- [ ] Dialogues are linked to scenes and characters
- [ ] Mystery appears in `/mysteries` list view
- [ ] Vault items are created and linked to mystery
- [ ] Overlays are created and linked to mystery dialogues
- [ ] `npm run validate:content` passes after generation
- [ ] `npm run migrate` succeeds with new content

---

## Verification Checklist

- [ ] `/editor` page allows reading and writing YAML files
- [ ] File validation prevents writing invalid YAML
- [ ] `/content-linker` page allows linking NPCs, dialogues to scenes
- [ ] Links persist in YAML files
- [ ] `/missions` page lists existing missions
- [ ] Mission wizard creates all required YAML files
- [ ] Generated content validates and migrates successfully
- [ ] `npm run lint --workspace=admin` passes
- [ ] `npm run build --workspace=admin` passes
- [ ] `npm run lint --workspace=server` passes
- [ ] `npm run build --workspace=server` passes