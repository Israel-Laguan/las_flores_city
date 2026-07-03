# Continue Admin Panel Enhancements — Next Chat Prompt

## Context
The admin asset generation pipeline is built and working. The user can now:
- View a catalog of 51 assets across 3 categories
- Generate 4 base proposals per asset
- Approve one base
- Generate variants via i2i from the chosen base
- Publish assets to MinIO

## Feedback Received
The current implementation only shows newly generated bases in the current session. The user wants:

1. **History/Previous Generations**: See all previously generated bases (from past sessions) for each asset
2. **Select Old Bases**: Ability to choose a previously generated base instead of generating new ones
3. **Grid View**: Display all historical bases in a grid for easy comparison
4. **Delete Functionality**: Remove bases/variants that aren't good quality
5. **Persistence**: All data is already in the database, but the UI doesn't show it properly

## Goal for Next Chat
Enhance the admin UI to support a full asset management workflow with history, selection, and deletion.

## What to Preserve
- `docs/lore/assets/ADMIN_ASSET_GENERATION.md` — usage guide
- `docs/lore/assets/QA_TESTING_PROMPT.md` — QA test cases
- `server/src/routes/assets.ts` — all existing endpoints
- `server/src/services/AssetGenerationService.ts` — generation logic
- `shared/src/schemas/assets.ts` — type definitions
- `admin/src/app/assets/page.tsx` — current UI implementation

## Proposed Enhancements

### 1. Load Historical Bases on Entry
When user clicks an asset in the catalog, load ALL existing bases from the database (not just show empty state).

**Current behavior**: Shows empty grid until new bases are generated  
**Desired behavior**: Shows all historical bases immediately

### 2. Visual Distinction for Historical Bases
Add visual indicators to show which bases are:
- Newly generated in this session
- Previously generated (historical)
- Currently chosen/approved

**Suggested UI**:
- Historical bases: normal border (#444)
- New bases: blue border (#00aaff) with "NEW" badge
- Chosen base: green border (#00ff00) with "✓ Chosen" badge

### 3. Delete Functionality
Add delete buttons to base and variant cards.

**Base delete**:
- Button: "Delete" (red, small)
- Confirmation dialog: "Are you sure? This will also delete all variants."
- Cascade delete variants in database
- Remove from MinIO (optional, can leave drafts)

**Variant delete**:
- Button: "Delete" (red, small)
- Confirmation dialog: "Are you sure?"
- Delete from database and MinIO

### 4. Improved Base Selection Flow
Allow user to:
1. See all historical bases
2. Click "Approve" on any base (old or new)
3. If a new base is approved, it unchoses the previous one
4. If an old base is approved, generate new variants from it

**UI Changes**:
- All bases show "Approve" button (not just new ones)
- When a historical base is approved, load its existing variants
- Show variant generation section for any chosen base

### 5. Variant History
Show existing variants for the chosen base (if any).

**Current behavior**: Only shows newly generated variants  
**Desired behavior**: Shows all variants for the chosen base, including historical ones

### 6. Regenerate Variant
Add ability to regenerate a variant (delete old, create new).

**UI**:
- Each variant card has "Regenerate" button
- Keeps the same variant_name and prompt
- Deletes old variant, creates new one with new i2i_strength

### 7. Batch Operations
Add batch actions for efficiency:

**Generate All Variants**:
- Button: "Generate All Variants"
- Reads all variant prompts from .prompt.md file
- Generates all variants at once
- Shows progress

**Delete All Bases**:
- Button: "Delete All Bases" (with confirmation)
- Deletes all bases and variants for this asset
- Useful for starting fresh

## Suggested UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Asset Generation Pipeline - app_misiones                     │
│ [← Back to Catalog]                                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Step 1: Base Proposals                                      │
│ [Generate 4 Bases] [Delete All Bases]                       │
│                                                              │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│ │ Base #1 │ │ Base #2 │ │ Base #3 │ │ Base #4 │          │
│ │ [img]   │ │ [img]   │ │ [img]   │ │ [img]   │          │
│ │ #1 seed │ │ #2 seed │ │ #3 seed │ │ #4 seed │          │
│ │[Approve]│ │[Approve]│ │[Approve]│ │[Approve]│          │
│ │[Delete] │ │[Delete] │ │[Delete] │ │[Delete] │          │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                              │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│ │ Old #1  │ │ Old #2  │ │ Old #3  │  ← Historical bases   │
│ │ [img]   │ │ [img]   │ │ [img]   │                       │
│ │ #5 seed │ │ #6 seed │ │ #7 seed │                       │
│ │[Approve]│ │[Approve]│ │[Approve]│                       │
│ │[Delete] │ │[Delete] │ │[Delete] │                       │
│ └─────────┘ └─────────┘ └─────────┘                       │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Step 2: Generate Variants (i2i)                             │
│ [Only shown if a base is chosen]                            │
│                                                              │
│ Variant Name: [night          ]                              │
│ Prompt:       [Same icon but...]                             │
│ i2i Strength: [====●=====] 0.70                             │
│ [Generate Variant]                                           │
│                                                              │
│ Generated Variants:                                          │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│ │ night    │ │ rain     │ │ alt_color│ ← Historical vars   │
│ │ [img]    │ │ [img]    │ │ [img]    │                     │
│ │ 0.70     │ │ 0.75     │ │ 0.65     │                     │
│ │[Publish] │ │[Publish] │ │[Publish] │                     │
│ │[Delete]  │ │[Delete]  │ │[Delete]  │                     │
│ └──────────┘ └──────────┘ └──────────┘                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## API Changes Needed

### Add DELETE endpoints

**`DELETE /assets/bases/:id`**
- Deletes a base and all its variants
- Removes images from MinIO
- Returns success/error

**`DELETE /assets/variants/:id`**
- Deletes a variant
- Removes image from MinIO
- Returns success/error

### Modify existing endpoints

**`GET /assets/list?prompt_rel=...`**
- Already returns all bases and variants
- No changes needed, just ensure UI loads them

**`POST /assets/generate-bases`**
- No changes needed
- New bases will have a `is_new` flag in response

## Implementation Steps

### Step 1: Add DELETE routes
Add to `server/src/routes/assets.ts`:
- `DELETE /assets/bases/:id`
- `DELETE /assets/variants/:id`

### Step 2: Update Admin UI
Modify `admin/src/app/assets/page.tsx`:
- Load historical bases on entry (already works, just verify)
- Add visual distinction for new vs historical bases
- Add delete buttons with confirmation
- Show all variants for chosen base (already works, just verify)
- Add "Delete All" button

### Step 3: Add confirmation dialogs
Use browser `confirm()` for simplicity:
```typescript
const handleDeleteBase = async (baseId: string) => {
  if (!confirm('Delete this base and all its variants?')) return;
  // ... delete logic
};
```

### Step 4: Test the flow
1. Generate 4 bases
2. Refresh page
3. Verify bases are still there (historical)
4. Generate 4 more bases
5. Verify both old and new bases show
6. Delete an old base
7. Verify it's gone
8. Approve an old base
9. Generate variants from it

## Files to Modify

1. **`server/src/routes/assets.ts`** — Add DELETE endpoints
2. **`admin/src/app/assets/page.tsx`** — Enhance UI with history, delete, visual distinction
3. **`shared/src/schemas/assets.ts`** — No changes needed (schemas are fine)

## Testing Checklist

- [ ] Historical bases load when entering asset view
- [ ] New bases have visual distinction (blue border + "NEW" badge)
- [ ] Chosen base has green border + "✓ Chosen" badge
- [ ] Delete button appears on all base cards
- [ ] Delete button appears on all variant cards
- [ ] Confirmation dialog shows before delete
- [ ] Deleting a base cascades to variants
- [ ] Deleting a base removes it from UI
- [ ] Can approve a historical base
- [ ] Can generate variants from a historical base
- [ ] Historical variants load when base is chosen
- [ ] "Delete All Bases" button works
- [ ] Page refresh preserves data (database persistence)

## Notes

- All data is already persisted in PostgreSQL (asset_bases and asset_variants tables)
- Images are in MinIO at `drafts/bases/` and `drafts/variants/`
- No schema changes needed, just UI and route enhancements
- Keep the existing 3-step workflow, just enhance the history/delete features

## Prompt for Next Chat

```
I need to enhance the admin asset generation pipeline with history and delete functionality.

## Current State
The admin panel at http://localhost:3001/assets can:
- Show a catalog of 51 assets
- Generate 4 base proposals
- Approve one base
- Generate variants via i2i
- Publish to MinIO

## Problem
When the user refreshes the page or restarts the server, previously generated bases are not visible in the UI (even though they're in the database). The user wants to:
1. See all historical bases (from previous sessions)
2. Select old bases to generate new variants
3. Delete bases/variants that aren't good quality

## What to Build

### 1. Show Historical Bases
When entering an asset view, load ALL bases from the database (not just show empty state). The data is already there, the UI just needs to display it.

### 2. Visual Distinction
- Historical bases: normal border (#444)
- New bases (generated this session): blue border (#00aaff) with "NEW" badge
- Chosen base: green border (#00ff00) with "✓ Chosen" badge

### 3. Delete Functionality
Add delete buttons to base and variant cards:
- Base delete: cascades to delete all variants
- Variant delete: deletes just that variant
- Confirmation dialog before delete
- Remove from database and MinIO

### 4. Improved Selection
Allow approving ANY base (old or new), not just newly generated ones.

## Files to Modify
- `server/src/routes/assets.ts` — Add DELETE /assets/bases/:id and DELETE /assets/variants/:id
- `admin/src/app/assets/page.tsx` — Enhance UI with history, delete buttons, visual distinction

## Key Context
- All data is in PostgreSQL (asset_bases, asset_variants tables)
- Images are in MinIO at drafts/bases/ and drafts/variants/
- The GET /assets/list endpoint already returns all bases/variants
- No schema changes needed

Please implement these enhancements and test the full flow.
```

## Next Steps

1. Copy the prompt above into a new chat
2. The next chat will implement the enhancements
3. After implementation, run the QA tests from `docs/lore/assets/QA_TESTING_PROMPT.md`
4. Then proceed to automated tests