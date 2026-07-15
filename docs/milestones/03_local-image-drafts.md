# Milestone 03 — Local image drafts

## Goal

Add local-draft image generation: when the user clicks "Generate Drafts",
new PNGs are written **flat** into the per-entity `assets/` folder (e.g.
`assets/<slug>__<ISO-timestamp>.png` (the in-app generator uses this convention)), with **no MinIO upload**
and **no `asset_bases` row insertion**. The user picks one of the drafts
(or keeps the pre-existing `<slug>__default.png`); only the chosen one is
later uploaded to MinIO in Milestone 04.

**The `assets/` folder is a flat bag of candidates.** Anything inside
is fair game, as long as it is a **valid asset file** (image for now:
`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`; video in the future: `.mp4`,
`.webm`). The admin selector reads the directory and shows every valid
file as a thumbnail, regardless of name. The user can:

- Drop their own drafts from external generators (MidJourney, DALL-E,
  ComfyUI, Flux) into the `assets/` folder via the OS file manager.
- Click "Generate Drafts" in admin to invoke the in-app generator,
  which writes files using a **convention** (slug + ISO timestamp) so
  the in-app generator's output is predictable and sortable.

The selection is recorded in the YAML's `asset_paths.<field>` field,
not in the filename. The pre-existing `<slug>__default.png` (moved by
M01) is treated as the **default chosen** draft on intake (the user
explicitly requested: *"we can have a default selected (the first found)
but we allow users to edit"*). If the user keeps it, no new generation
is required.

**Naming convention used by the in-app generator** (a proposal; tweak
as needed): `<slug>__<ISO-timestamp>.<ext>`, e.g.
`aisha_al_sayed__2026-07-15T01-30-12.png`. Using ISO-style timestamp
(in colons replaced with dashes for filesystem safety) makes the files
sortable by generation time, gives every output a unique name without
needing a counter, and is easy to filter (`ls assets/ | grep 2026-07`).
The convention is only used by **our** generator script — files placed
in `assets/` by hand (via the OS file manager) can have any name.

This is the heart of the user's flow:
> "the idea intake would create a first plan and create drafts for images (not
> saved to minio). then we iterate with user, and at some point the user
> approves... the asset is saved."

Before this milestone, `POST /assets/generate-bases` always uploads to MinIO
and creates a DB row. After this milestone, generation goes to local files
first (flat, in the per-entity `assets/` folder), and the user has a real
choice between the pre-existing default and newly generated drafts.

## Pre-requisites

- Milestone 01 (per-folder layout is in place — each entity has its own
  flat `assets/` folder with at least the pre-existing `<slug>__default.png`).
- Milestone 02 (the `AssetNeed.status` enum has `pending` and `drafted`).

## Files to change

### New routes

- `server/src/routes/admin-story-builder-drafts.ts` — new file with two routes:
  - `POST /admin/story-builder/plans/:id/generate-drafts` — for each
    `AssetNeed` with `status='pending'`, call `AssetGenerationService` and
    write the resulting PNG to `content/<type>/<slug>/assets/<slug>__v<n>.png`
    (flat in the per-entity `assets/` folder, alongside `<slug>__default.png`).
    Set `AssetNeed.status='drafted'`. **No MinIO upload. No `asset_bases` row.**
  - `DELETE /admin/story-builder/plans/:id/drafts/:assetNeedId` — remove a
    specific draft (revert to `pending`).
  - `GET /admin/story-builder/plans/:id/drafts` — list the local drafts for
    the plan (file paths + sizes + previews).

### Modified routes

- `server/src/routes/assets.generation.handlers.ts` — extract a reusable
  `generateOneImage(prompt, dims, assetType, negative)` function that
  returns a `Buffer` (no upload). The existing `handleGenerateBases` and
  the new `handleGenerateDrafts` both call it; the former uploads to MinIO
  and inserts the row, the latter writes to disk and updates the
  `AssetNeed.status`.

### Modified services

| File | Change |
|---|---|
| `server/src/services/AssetGenerationService.ts` | Add a `generateImageBuffer(prompt, dims, assetType, negative)` function that returns the raw image buffer. Existing `generateBaseImage()` and `generateVariantImage()` call the network API and upload to MinIO; the new function does the network call only. |
| `server/src/services/AssetNeedsService.ts` | Add `markDrafted(need)`, `markChosen(need)`, `markPublished(need)`. Each calls `transitionAssetNeed(need, nextStatus)` (from Milestone 02). |
| `server/src/services/ContentPlanService.ts` | In `parseDescription()`, generate the plan and then call `generate-drafts` for each `pending` `AssetNeed`. The first draft is **auto-chosen** so the user can see it in the wizard without clicking. |

### Modified admin UI

| File | Change |
|---|---|
| `admin/src/app/story-builder/components/ContentCard.tsx` | In the `AssetNeedsSection`, when the plan status is `proposed` (not yet approved), show a "Generate Drafts" button per `pending` need and a grid of draft thumbnails for `drafted` needs. The user can click a thumbnail to mark it `chosen`. The chosen one gets a checkmark overlay. |
| `admin/src/app/story-builder/hooks/useStoryBuilderApi.ts` | Add `generateDrafts(planId)`, `listDrafts(planId)`, `chooseDraft(planId, assetNeedId, filename)` API calls. |
| `admin/src/app/story-builder/components/FieldDefinitions.ts` | No change. |

## Implementation outline

### Step 1: Extract the image-generation primitive

```ts
// server/src/services/AssetGenerationService.ts
export async function generateImageBuffer(params: {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  assetType: string;
  seed?: number;
}): Promise<Buffer> {
  // Existing logic from generateBaseImage(), but stop before uploadToMinio().
  // Returns the raw image bytes.
}
```

### Step 2: Add the draft-writing helper

```ts
// server/src/services/LocalDraftService.ts (new)
import path from 'node:path';
import fs from 'node:fs/promises';
import { generateImageBuffer } from './AssetGenerationService.js';

/**
 * Valid asset extensions. The admin selector shows every file in `assets/`
 * that has one of these extensions, regardless of name. Files with any
 * other extension (e.g. `.txt`, `.json`, `.DS_Store`) are ignored.
 */
export const VALID_ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

export function isValidAssetFilename(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return VALID_ASSET_EXTENSIONS.includes(ext);
}

/**
 * Build a filename for a newly generated draft.
 * Convention: <slug>__<ISO-timestamp>.<ext>
 * The timestamp is in the format YYYY-MM-DDTHH-MM-SS (colons replaced with
 * dashes for filesystem safety). This makes generated files sortable by
 * time, gives every output a unique name without a counter, and is easy
 * to filter.
 *
 * NOTE: this convention is only used by the in-app generator. Files
 * placed in `assets/` by hand (via the OS file manager) can have any
 * name. The selector does not care.
 */
export function buildGeneratedAssetFilename(slug: string, ext: string = '.png'): string {
  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  // .replace(/\..+/, '') strips the milliseconds suffix ".123Z"
  return `${slug}__${ts}${ext}`;
}

export async function generateLocalDrafts(
  item: ContentPlanItem,
  entityRootDir: string,  // e.g. 'content/characters/aisha_al_sayed'
  count: number = 3,
): Promise<string[]> {
  // All assets land FLAT in <entityRootDir>/assets/, alongside any pre-existing
  // <slug>__default.png and any files the user dropped in by hand.
  const assetsDir = path.join(entityRootDir, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });

  const promptFile = path.join(entityRootDir, `${item.slug}.prompt.md`);
  const { prompt, negativePrompt, width, height } = await parsePromptFile(promptFile);

  const written: string[] = [];
  for (let i = 0; i < count; i++) {
    const buf = await generateImageBuffer({
      prompt,
      negativePrompt,
      width,
      height,
      assetType: item.assetNeeds[0]?.promptType ?? 'portrait',
      seed: Math.floor(Math.random() * 2147483647),
    });
    const filename = buildGeneratedAssetFilename(item.slug, '.png');
    const fullPath = path.join(assetsDir, filename);
    await fs.writeFile(fullPath, buf);
    written.push(filename);
  }
  return written;
}

/**
 * List every valid asset file in the per-entity assets/ folder.
 * Used by the admin selector and by the validator. Returns an array of
 * {filename, fullPath, sizeBytes, mtime} for each file.
 */
export async function listLocalAssets(entityRootDir: string): Promise<Array<{
  filename: string;
  fullPath: string;
  sizeBytes: number;
  mtime: Date;
}>> {
  const assetsDir = path.join(entityRootDir, 'assets');
  try {
    const entries = await fs.readdir(assetsDir, { withFileTypes: true });
    const out: Array<{ filename: string; fullPath: string; sizeBytes: number; mtime: Date }> = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!isValidAssetFilename(entry.name)) continue;
      const fullPath = path.join(assetsDir, entry.name);
      const stat = await fs.stat(fullPath);
      out.push({
        filename: entry.name,
        fullPath,
        sizeBytes: stat.size,
        mtime: stat.mtime,
      });
    }
    // Sort: pre-existing __default first, then by mtime (newest first).
    out.sort((a, b) => {
      if (a.filename.endsWith('__default.png')) return -1;
      if (b.filename.endsWith('__default.png')) return 1;
      return b.mtime.getTime() - a.mtime.getTime();
    });
    return out;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
}

export async function chooseDraft(
  item: ContentPlanItem,
  entityRootDir: string,
  draftFilename: string,
): Promise<void> {
  // The selection is recorded in the YAML's asset_paths.<field> field.
  // No file is copied or renamed — the chosen file stays where it is.
  // Milestone 04's publish step reads the chosen file from its current
  // location and uploads it to MinIO.
  const assetsDir = path.join(entityRootDir, 'assets');
  const source = path.join(assetsDir, draftFilename);
  // Sanity check: the file must exist.
  await fs.access(source);
}
```

### Step 3: Wire up the new route

```ts
// server/src/routes/admin-story-builder-drafts.ts
adminStoryBuilderDraftsRouter.post('/plans/:id/generate-drafts', async (req, res) => {
  const { id } = req.params;
  const plan = await loadPlan(id);
  if (plan.status !== 'proposed' && plan.status !== 'approved') {
    return res.status(400).json({ success: false, error: 'Plan must be proposed to generate drafts' });
  }
  for (const item of plan.items) {
    if (item.assetNeeds.length === 0) continue;
    const entityRoot = resolveEntityRoot(item); // e.g. 'content/characters/aisha_al_sayed'
    await generateLocalDrafts(item, entityRoot, 4);
    for (const need of item.assetNeeds) {
      transitionAssetNeed(need, 'drafted');
    }
  }
  await savePlan(plan);
  res.json({ success: true, data: { itemCount: plan.items.length } });
});
```

### Step 4: Update the admin wizard

The "Review" step in the Story Builder wizard gets a new section per
item called "Image drafts". The section calls
`LocalDraftService.listLocalAssets()` to get **every valid asset file**
in the per-entity `assets/` folder, regardless of name, and renders them
as a grid of thumbnails. The user clicks one to mark it `chosen`, which
writes the filename into the YAML's `asset_paths.<promptType>` field
(replacing any previous selection).

The selector logic is the same for files generated by the in-app
generator, files dropped in by hand via the OS file manager, and the
pre-existing `<slug>__default.png` from M01. The selector does not
care where the file came from — it only checks the file extension
against `VALID_ASSET_EXTENSIONS` and renders a thumbnail.

The selection flow is:
- On intake, the wizard calls `listLocalAssets()` and shows all files.
  If `assets/<slug>__default.png` exists, it is pre-selected (it is the
  first item in the sorted list). The YAML's `asset_paths.<promptType>`
  is pre-populated with `<slug>__default.png` and the corresponding
  `AssetNeed.status` is auto-set to `chosen`. No generation needed.
- The user can click "Generate Drafts" to invoke the in-app generator.
  3 new variants are written to `assets/<slug>__<timestamp1>.png`,
  `__<timestamp2>.png`, `__<timestamp3>.png`. The selector refreshes
  (calls `listLocalAssets()` again) and shows the new files alongside
  the existing ones.
- The user clicks one. The YAML's `asset_paths.<promptType>` field is
  updated to the chosen filename. The previous file is **not** deleted
  or renamed — every draft stays on disk, the YAML just records which
  one is the current selection.
- The user can also drop their own files into `assets/` via the OS file
  manager while the admin is open. The selector does not auto-refresh;
  the user clicks a "Refresh" button to re-read the folder. (Or the
  wizard polls every 5 seconds. Either is fine.)
- The original `assets/<slug>__default.png` is **never** modified,
  renamed, or deleted by this flow. It is the historical record.

## Tests to add or update

- `server/tests/unit/LocalDraftService.test.ts` — new file. Tests:
  - `buildGeneratedAssetFilename(slug, ext)` produces a string of the
    form `<slug>__<ISO-timestamp><ext>`.
  - `isValidAssetFilename()` accepts `.png`, `.jpg`, `.jpeg`, `.webp`,
    `.gif` (case-insensitive) and rejects everything else (including
    `.txt`, `.DS_Store`, no extension).
  - `generateLocalDrafts()` writes files to `assets/`, returns the list
    of filenames, and does NOT call `uploadToMinio` (mock it and assert
    it was not called).
  - `listLocalAssets()` returns every valid file in `assets/`, sorted
    with `__default.png` first and the rest by mtime descending.
  - `listLocalAssets()` skips files with non-image extensions and
    sub-directories.
- `server/tests/integration/admin-story-builder-drafts.test.ts` — new file.
  Tests the three routes end-to-end with a hermetic file system.
- `admin/src/app/story-builder/__tests__/ContentCard.test.tsx` — add a test
  that the Asset Needs section shows draft thumbnails when `status='drafted'`.

## Validation gate

1. The new routes are mounted in the server.
2. `POST /plans/:id/generate-drafts` writes 3 new PNGs to
   `assets/<slug>__<ISO-timestamp>.png` (flat in the per-entity
   `assets/` folder, using the timestamp convention from
   `buildGeneratedAssetFilename()`) and does NOT call MinIO (verify
   with `docker logs las-flores-server | grep -c uploadToMinio`
   returning 0 during the test).
3. The `asset_bases` table has 0 new rows after `generate-drafts`.
4. **The selector shows every valid asset file in `assets/`**,
   regardless of name. Verify by:
   a. Copying a file with an unusual name (e.g. `from_midjourney_v3.png`)
      into `assets/` via the OS file manager.
   b. Clicking "Refresh" in the admin selector.
   c. Confirming the new file appears as a thumbnail.
5. The selector **ignores non-asset files**. Verify by dropping a
   `.txt` or `.DS_Store` into `assets/` and confirming it does NOT
   appear as a thumbnail.
6. Clicking a thumbnail updates the YAML's `asset_paths.<field>` to
   point at the chosen filename. No file is moved, copied, or renamed.
7. On intake, the pre-existing `<slug>__default.png` is pre-selected
   (it is the first item in the sorted list returned by
   `listLocalAssets()`). The user can change the selection by clicking
   another thumbnail.
8. The original `<slug>__default.png` is never deleted or renamed by
   the wizard or the generator.
9. The same selector logic works for files dropped in by hand, files
   generated by the in-app script, and the pre-existing default. The
   selector does not care about provenance.
10. `npm run lint --workspace=server` → 0 errors.
11. `npm run test --workspace=server` → all green.
12. `npm run build --workspace=server` → passes.

## Rollback plan

The new routes are additive (new file in `server/src/routes/`). The
`LocalDraftService` is a new file. Deleting both reverts to the previous
behavior. The `AssetNeed.status='drafted'` is a new enum value; if a plan
is in this state and the code is rolled back, the wizard will treat it as
an invalid status — but no data is lost, just inaccessible until the code
is restored. MinIO is untouched.
