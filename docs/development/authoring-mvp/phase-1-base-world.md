# Phase 1: Base World & Player UX

> **Goal:** Build admin UI for browsing lore markdown, viewing content coverage, linking generated assets to content YAMLs, and expanding the base world content.
>
> **Dependencies:** `react-markdown` + `remark-gfm` (Phase 1B)
>
> **Prerequisites:** Phase 0 complete (all server endpoints working)
>
> **Status:** 🔲 Planned

---

## Tasks

### 1A — Add react-markdown dependency

**Command:**
```bash
npm install react-markdown remark-gfm --workspace=admin
```

**Purpose:** Render lore markdown files with proper formatting (headings, bold, links, images, tables) instead of raw `<pre>` text.

**Verification:**
- [ ] `npm run build --workspace=admin` passes after install
- [ ] Can import `react-markdown` in admin components

---

### 1B — Lore Browser page (`/lore`)

**Files to create:**
- `admin/src/app/lore/page.tsx` — main lore browser page
- `admin/src/app/lore/[path]/page.tsx` — lore file viewer
- `admin/src/app/api/admin/lore/tree/route.ts` — Next.js API proxy
- `admin/src/app/api/admin/lore/file/route.ts` — Next.js API proxy

**Files to modify:**
- `admin/src/app/components/AdminNav.tsx` — add `/lore` link to nav

**UI Layout:**

```
┌─────────────────────────────────────────────┐
│ Lore Browser       [🔍 Search...]           │
├──────────┬──────────────────────────────────┤
│ Figures  │ # Ana Kim                        │
│   ana_kim│                                  │
│   alex   │ > Tags: `#figure` `#2077`       │
│   ...    │                                  │
│ Districts│ Ana Kim is the **honest mirror** │
│   south  │ of Alex's investigation group... │
│   city   │                                  │
│ Stories  │ ## Background                    │
│   ...    │ ...                              │
└──────────┴──────────────────────────────────┘
```

**Left panel (tree):**
- File tree grouped by category (Figures, Districts, Landmarks, Stories, etc.)
- Click a file to select it
- Search/filter input at top
- Badge showing file count per category

**Right panel (viewer):**
- Renders markdown content using `react-markdown` with `remark-gfm`
- Shows frontmatter tags in a styled box (if parseable)
- Back/forward navigation between viewed files
- "Open in external editor" link (copies file path)

**Implementation notes:**
- Fetch file tree from `GET /admin/lore/tree`
- Fetch file content from `GET /admin/lore/file?path={path}`
- Use URL search params for current file: `/lore?path=figures/ana_kim.md`
- Lazy-load markdown content (only fetch when file is selected)
- Cache file tree in React state (doesn't change often)

**Verification:**
- [ ] `/lore` page shows file tree grouped by category
- [ ] Clicking a file renders its markdown content
- [ ] Markdown renders with proper formatting (headings, bold, links)
- [ ] Tags from markdown frontmatter are displayed
- [ ] Search filters file tree in real-time
- [ ] Navigation works (back/forward)
- [ ] Lore link appears in admin nav

---

### 1C — Content Coverage Dashboard (`/coverage`)

**Files to create:**
- `admin/src/app/coverage/page.tsx` — coverage dashboard
- `admin/src/app/api/admin/coverage/route.ts` — Next.js API proxy

**Files to modify:**
- `admin/src/app/components/AdminNav.tsx` — add `/coverage` link

**UI Layout:**

```
┌─────────────────────────────────────────────┐
│ Content Coverage                            │
├─────────────────────────────────────────────┤
│ ┌──────────┬──────┬──────┬──────┬─────────┐│
│ │ Type     │ Total│ Has  │ Needs│ Missing ││
│ │          │      │ YAML │ Asset│ Coverage││
│ ├──────────┼──────┼──────┼──────┼─────────┤│
│ │ Figures  │ 128  │ 160  │ 120  │ 28      ││
│ │ Districts│ 11   │ 5    │ 6    │ 6       ││
│ │ Landmarks│ 70   │ 1    │ 69   │ 69      ││
│ │ Stories  │ 40   │ 1    │ 39   │ 39      ││
│ └──────────┴──────┴──────┴──────┴─────────┘│
│                                              │
│ Details: Figures                             │
│ ┌───────────────────────────────────────┐   │
│ │ Figure   │ Char YAML │ Portrait │ Gap │   │
│ │──────────│───────────│──────────│─────│   │
│ │ Ana Kim  │ ✅        │ ✅       │  ✅ │   │
│ │ Alex     │ ✅        │ ❌       │ ❌ │   │
│ │ ...      │           │          │     │   │
│ └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Implementation notes:**
- Fetch data from `GET /admin/coverage`
- Show summary cards per type (figures, districts, landmarks, stories)
- Click a type to expand the detail table
- Color coding: green (has YAML), yellow (has YAML but missing assets), red (no YAML)
- Show percentage bar: "Figures: 128 lore → 160 char YAMLs → 40 with portraits → 8 with dialogues"

**Verification:**
- [ ] `/coverage` page shows summary cards for all lore types
- [ ] Clicking a type shows detail table
- [ ] Color coding is correct
- [ ] Percentages and counts match expected values
- [ ] Coverage link appears in admin nav

---

### 1D — Asset Coverage page (`/asset-coverage`)

**Files to create:**
- `admin/src/app/asset-coverage/page.tsx` — asset coverage page
- `admin/src/app/api/admin/coverage/route.ts` — reuse existing (or add asset-specific endpoint)

**Files to modify:**
- `admin/src/app/components/AdminNav.tsx` — add `/asset-coverage` link

**Server endpoint:**
- Add to `admin-coverage.ts`: `GET /admin/coverage/assets`

**UI Layout:**

```
┌─────────────────────────────────────────────┐
│ Asset Coverage                              │
├──────────┬──────────┬──────────┬────────────┤
│ Character│ Portrait │ Portrait │ Action     │
│          │ Status   │ Preview  │            │
├──────────┼──────────┼──────────┼────────────┤
│ Ana Kim  │ ✅ Ready │ [img]    │ [Publish]  │
│ Alex     │ ❌ Missing│ —        │ [Generate] │
│ ...      │          │          │            │
├──────────┼──────────┼──────────┼────────────┤
│ Scene    │ Bg Status│ Preview  │ Action     │
│──────────│──────────│──────────│────────────┤
│ Old Town │ ❌ Missing│ —        │ [Generate] │
│ Café     │          │          │            │
└──────────┴──────────┴──────────┴────────────┘
```

**Implementation notes:**
- Query characters table for `portrait_urls` presence
- Query scenes table for `background_url` presence
- Query the asset pipeline tables for generated/published assets
- Show both DONE and MISSING items
- "Generate" button links to `/assets` page with correct prompt_rel pre-selected
- "Publish" button if asset variant exists but not yet published

**Verification:**
- [ ] `/asset-coverage` page shows all characters and their portrait status
- [ ] Shows all scenes and their background status
- [ ] "Generate" button navigates to asset generator
- [ ] Asset coverage link appears in admin nav

---

### 1E — Asset-to-Content Linking

**Files to create:**
- `server/src/services/ContentAssetService.ts` — service for linking assets to content YAMLs

**Files to modify:**
- `server/src/routes/admin-content.ts` — add `POST /admin/content/assign-asset`

**Purpose:** After generating assets in the pipeline, authors can link the published asset URL to a content YAML field.

**Server endpoint:**

#### `POST /admin/content/assign-asset`

**Request:**
```json
{
  "contentPath": "characters/char_ana_kim.yaml",
  "fieldPath": "portrait_urls[0].url",
  "assetUrl": "http://minio:9000/las-flores/portraits/ana_kim/neutral.png"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "characters/char_ana_kim.yaml",
    "fieldPath": "portrait_urls[0].url",
    "oldValue": null,
    "newValue": "http://minio:9000/las-flores/portraits/ana_kim/neutral.png"
  }
}
```

**Implementation notes:**
- Read the YAML file
- Parse with `js-yaml`
- Traverse the object tree to find the field at `fieldPath` (e.g., `portrait_urls[0].url` means `data.portrait_urls[0].url`)
- If the array element doesn't exist, create it
- Update the value
- Write back to file
- Validate the resulting YAML before saving

**Admin UI form:**
- Add to `/asset-coverage` page: for each missing asset, show a dropdown of published MinIO URLs
- Or add to character/scene detail pages: "Link Asset" button

**Verification:**
- [ ] `POST /admin/content/assign-asset` updates YAML field correctly
- [ ] Array elements are created if they don't exist
- [ ] Invalid paths return 400
- [ ] Invalid YAML after update returns 400
- [ ] Linked asset appears in YAML file content

---

### 1F — Expand World Content

**Purpose:** Guided by the coverage dashboard, create missing content YAMLs to fill gaps. This is primarily content authoring work, not code.

**Guided by coverage gaps:**
1. Create scene YAMLs for districts without scenes (at least 1 per district)
2. Create character YAMLs for lore figures without content YAMLs (prioritize "The 2077 Core Group" and story-relevant figures)
3. Create dialogue YAMLs for main characters
4. Add `background_url` to scenes that are missing them
5. Add `portrait_urls` to characters that are missing them

**Content files to create (examples):**
```
content/scenes/scene_district_central.yaml
content/scenes/scene_district_north.yaml
content/scenes/scene_district_port.yaml
...
content/characters/char_[missing_figure].yaml
...
```

**Process:**
1. Check `/coverage` page for gaps
2. For each gap, create YAML file following existing templates in `content/`
3. Optionally generate assets via pipeline
4. Link assets to content via Phase 1E
5. Validate with `npm run validate:content`
6. Migrate with `npm run migrate`

**Verification:**
- [ ] All 11 districts have at least 1 scene YAML
- [ ] All "The 2077 Core Group" characters have character YAMLs
- [ ] All scenes have `background_url` (or marked as needing generation)
- [ ] All key characters have `portrait_urls` (or marked as needing generation)
- [ ] `npm run validate:content` passes
- [ ] `npm run migrate` succeeds

---

## Verification Checklist

- [ ] `react-markdown` + `remark-gfm` installed
- [ ] `/lore` page shows file tree + rendered markdown
- [ ] `/coverage` page shows lore-to-content gaps
- [ ] `/asset-coverage` page shows portrait/background status
- [ ] Asset linking works (POST → YAML update)
- [ ] All 11 districts have scenes
- [ ] Key characters have YAMLs
- [ ] `npm run lint --workspace=admin` passes
- [ ] `npm run build --workspace=admin` passes
- [ ] `npm run lint --workspace=server` passes
- [ ] `npm run build --workspace=server` passes