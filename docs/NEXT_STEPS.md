# Next Steps

> Open action items only. Completed work and key learnings have been moved to `docs/STORY_BUILDER_DESIGN.md`.

## Remaining Action Items

### 1. Fix `.md` files being overwritten with TODO stubs (CRITICAL)

**Problem**: The scaffold step in `admin-story-builder-generate.ts:72-76` unconditionally writes `TODO: Add lore content.` to `.md` and `.prompt.md` files *after* the async fill job (`PlanGenerationJob.ts:121-135`) has already written real LLM-generated content. This race condition clobbers all lore/prompt prose.

**Fix**: Remove lines 72-76 in `admin-story-builder-generate.ts` so the fill job is the sole writer of `.md`/`.prompt.md` files. The fill job already calls `generateForItem()` and `generatePromptForItem()`.

**Files**: `server/src/routes/admin-story-builder-generate.ts:72-76`

---

### 2. Fix content directory path resolution in LoreGenerator and PromptFileGenerator (MEDIUM)

**Problem**: `StoryBuilderLore.ts` was fixed to use `__dirname` + `../../../content`, but `LoreGenerator.ts` and `PromptFileGenerator.ts` still use `path.resolve(process.cwd(), 'content')`, which resolves to `/app/server/content` instead of `/app/content` when running from the server directory.

**Fix**: Update all occurrences to import and use `resolveContentDir()` from `StoryBuilderLore.ts`:
- `server/src/services/LoreGenerator.ts:30,98`
- `server/src/services/PromptFileGenerator.ts:33,105`

**Files**: `server/src/services/LoreGenerator.ts`, `server/src/services/PromptFileGenerator.ts`

---

### 3. Expand `FILL_TARGETS` in ContentFillService (MEDIUM)

**Problem**: `FILL_TARGETS` only covers `description`, `metadata.personality`, and `title`. Fields like `faction` remain as `TODO: Add faction` in YAML metadata. Additionally, `description` is missing for the `story` type, so story descriptions are never filled.

**Fix**: Expand `FILL_TARGETS` to include all fillable metadata fields, and add `description` to the `story` array.

**Files**: `server/src/services/ContentFillService.ts:6-16`

---

### 4. Clean up stray `server/content/` directory

**Problem**: Due to the path resolution bug (#2), running scripts from the `server/` directory may have created a stray `server/content/` directory.

**Fix**: Verify and remove `server/content/` if it exists.
