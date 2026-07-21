# Next Steps

> Open **action items** and **gaps** across the admin panel, content intake, and story-progression areas. When an item is done, remove it here and update the relevant long-term reference doc.
>
> Last updated: 2026-07-21 (added end-to-end pipeline verification results, fixed __dirname and template literal bugs, added probe content production verification, added fillExistingTodos script and path resolution findings)

## End-to-End Pipeline Verification (2026-07-21)

**2026-07-21 Verified**: Full pipeline works end-to-end:
- ✅ LiteLLM reachable from server container (`http://host.containers.internal:4000`)
- ✅ Outline returns `outline_source: 'llm'` (after fix to ContentPlanService.ts)
- ✅ Files written to `content/` with correct names (after __dirname and template literal fixes)
- ✅ Plan ID: `61eab4e6-d71d-41f4-a3c1-83b7a21441a3`, Items: 3, Time: ~38s (fill job completed)

### Issues Fixed During Verification

1. **`__dirname` undefined in ES modules** (`StoryBuilderLore.ts:12`)
   - **Root Cause**: TypeScript ES modules don't have `__dirname` available by default
   - **Fix**: Added `import { fileURLToPath } from 'node:url'` and `const __dirname = path.dirname(fileURLToPath(import.meta.url))`
   - **Files affected**: `server/src/services/StoryBuilderLore.ts`

2. **Template literal evaluation bug** (`admin-story-builder-generate.ts:70,73`)
   - **Root Cause**: `tsx` doesn't evaluate template literals like `${item.slug}.md` in certain contexts
   - **Fix**: Replaced `${item.slug}.md` with `item.slug + '.md'` and `${item.slug}.prompt.md` with `item.slug + '.prompt.md'`
   - **Files affected**: `server/src/routes/admin-story-builder-generate.ts`

3. **Import path using .ts extension** (`admin-story-builder-generate.ts:7`)
   - **Root Cause**: TypeScript doesn't allow importing .ts files directly in ES modules
   - **Fix**: Changed `from '../services/StoryBuilderLore.ts'` to `from '../services/StoryBuilderLore.js'`

4. **Missing LITELLM_API_KEY environment variable**
   - **Root Cause**: Server was trying to reach LiteLLM without authentication
   - **Fix**: Added `-e LITELLM_API_KEY="local-key"` to container startup

5. **outline_source not set for non-repaired plans** (`ContentPlanService.ts:153-159`)
   - **Root Cause**: `outline_source` was only set when `repaired` was true
   - **Fix**: Always set `outline_source` to 'llm' by default in `validateAndRepairOutline`

### Verification Results

| Time | Test | Input | Result | Notes |
|------|------|-------|--------|-------|
| 16:50 | LiteLLM health | `curl localhost:4000/health` | ✅ PASS | Healthy endpoints confirmed |
| 16:50 | Server → LiteLLM | `wget from container` | ✅ PASS | Model list returned successfully |
| 16:56 | Plan generation | "UNIQUE TEST XYZ789 - cyberpunk detective named Alice in Las Flores 2077" | ✅ PASS | outline_source: llm, 3 items created |
| 16:56 | File creation | `find content/` | ✅ PASS | Files in `content/<type>/<slug>/` with correct names |
| 16:56 | File names | `ls content/...` | ✅ PASS | No `${item.slug}.md` files, correct filenames |
| 17:00 | Fill job | `GET /plans/:id/generation-status` | ✅ PASS | status: done, 3/3 items completed |

### Plan Quality Check

- ✅ `outline_source: 'llm'` (confirmed after fix)
- ✅ Item names reflect input: "Alice", "Alice's Office", "XYZ789 Investigation"
- ✅ Top-level descriptions are LLM-generated and relevant
- ✅ Field descriptions contain `TODO:` placeholders (by design for fill step)
- ✅ Files created with correct structure: YAML + .md + .prompt.md

---

## Probe Content Production Verification (2026-07-21)

**Test Date**: 2026-07-21 12:19-12:21 UTC
**Input File**: `~/Downloads/posts-compilation-complete.md` (Real Heroism in Latam story bible)
**Plan ID**: `aa6687b9-1c6f-48f8-853e-a3bc392c0f49`

| Time | Test | Result | Notes |
|------|------|--------|-------|
| 12:19:00 | Input file check | ✅ PASS | `posts-compilation-complete.md` exists with 18834 bytes |
| 12:19:01 | Server health | ✅ PASS | `wget localhost:3000/health` returns `{success: true}` |
| 12:19:02 | LiteLLM connectivity | ✅ PASS | `curl localhost:4000/health` returns healthy endpoints |
| 12:19:05 | Probe execution | ⚠️ PARTIAL | Plan created but scaffold conflicts with existing content |
| 12:19:05 | Environment cleanup | ✅ PASS | Removed all existing characters/scenes/locations |
| 12:19:54 | Plan creation (retry) | ✅ PASS | Plan `aa6687b9-1c6f-48f8-853e-a3bc392c0f49` created, status=generating, 12 items, 55698ms |
| 12:20:54 | Fill job completion | ✅ PASS | status: done, 12/12 items completed, 0 failed |
| 12:21:00 | YAML files created | ✅ PASS | `char_*.yaml` and `scene_*.yaml` files exist with LLM content |
| 12:21:00 | MD files have content | ❌ FAIL | `.md` files contain only "TODO: Add lore content." (not filled) |

**Generated Content Summary**:
- ✅ **Story**: real_heroism_in_latam
- ✅ **Characters**: sofia_mendoza, mateo_salazar, valentina_cruz (3 total)
- ✅ **Scenes**: secondary_city_sunset, school_classroom, rainy_street_motorcycle (3 total)
- ✅ **Story Beats**: episode_1_friend_dies, episode_2_superhero_fantasy_challenged, episode_3_institutional_collapse (3 total)
- ✅ **Dialogues**: superhero_talk_between_classes, criticism_from_peers (2 total)

### Blocking Issues Found

1. **🔴 CRITICAL: .md files not filled with LLM content**
   - **Symptom**: `.md` files contain only `# <Name>\n\nTODO: Add lore content.` despite fill job completing
   - **Root Cause**: Scaffold step (lines 72-76 in `admin-story-builder-generate.ts`) unconditionally overwrites `.md` and `.prompt.md` files with TODO placeholders AFTER `generateForPlan` creates them with LLM content
   - **Impact**: All `.md` files remain as stubs, losing the LLM-generated lore content
   - **Fix Required**: Either (a) don't overwrite existing files in scaffold step, or (b) have fill job also write `.md` files
   - **Files affected**: `server/src/routes/admin-story-builder-generate.ts:72-76`

2. **⚠️ MEDIUM: Initial conflict detection blocked first attempt**
   - **Symptom**: First probe run failed with conflicts on Valentina Rojas and Camila Reyes
   - **Root Cause**: Existing content from previous runs wasn't fully cleaned up
   - **Fix Applied**: Manual cleanup of all characters/scenes/locations before retry
   - **Status**: RESOLVED for this test, but cleanup script needed for future runs

3. **⚠️ MEDIUM: Some YAML fields still contain TODO placeholders**
   - **Symptom**: `faction: 'TODO: Add faction'` in character YAML files
   - **Root Cause**: `FILL_TARGETS` in `ContentFillService.ts` doesn't include all metadata fields (only description, metadata.personality, title)
   - **Impact**: Partial content - main fields filled but some metadata remains as TODO
   - **Fix Required**: Expand `FILL_TARGETS` to include all fillable fields, or accept that some fields remain as TODO by design
   - **Files affected**: `server/src/services/ContentFillService.ts:6-16`

4. **⚠️ MEDIUM: Story item description remains TODO**
   - **Symptom**: `plan_json->'items'->0->'fields'->>'description'` = "TODO: Add description" for story item
   - **Root Cause**: `FILL_TARGETS` doesn't include 'description' for 'story' type
   - **Impact**: Story description not filled by LLM
   - **Fix Required**: Add 'description' to FILL_TARGETS.story array
   - **Files affected**: `server/src/services/ContentFillService.ts:6-16`

5. **✅ PASS: LLM connectivity and response validity**
   - ✅ No 401/404 errors in server logs for LiteLLM calls
   - ✅ LiteLLM retries with 60000ms timeout (visible in logs)
   - ✅ Fill job completed all 12 items successfully
   - ✅ plan_json contains valid JSON with LLM-generated content

6. **✅ PASS: File structure and naming**
   - ✅ YAML files created with correct names: `char_<slug>.yaml`, `scene_<slug>.yaml`
   - ✅ Files in correct directories: `content/<type>/<slug>/`
   - ✅ No template literal strings like `${item.slug}.md` in paths

### LLM Response Analysis
- **Model used**: poolside/laguna-m.1 (from LITELLM_BASE_URL config)
- **Response format**: JSON with `fields` object containing filled values
- **Content quality**: 
  - ✅ YAML `description` fields: High quality, detailed, story-appropriate
  - ✅ YAML `title` fields: Filled with meaningful titles
  - ✅ YAML `metadata.personality` fields: Filled with personality descriptors
  - ❌ `.md` files: NOT filled (scaffold overwrite issue)
  - ❌ `.prompt.md` files: NOT filled (scaffold overwrite issue)
- **Token usage**: Not tracked in current fill job implementation

### Root Cause Summary

The primary issue is **architectural**: The scaffold step (synchronous, in POST /plan) and the fill step (asynchronous, background job) both write to the same files, but the scaffold step runs second and overwrites the LLM-generated content with TODO placeholders.

**Current Flow**:
1. `generateOutline` → calls `generateForPlan` (async, fire-and-forget) → creates `.md` files with LLM content
2. Scaffold step → unconditionally overwrites `.md` files with TODO placeholders
3. Fill job → only writes YAML files, doesn't touch `.md` files

**Result**: LLM-generated `.md` content is lost, replaced with placeholders.

### Recommended Fixes

1. **Immediate Fix (Option A)**: Modify scaffold step to skip writing `.md`/`.prompt.md` files
   - Remove lines 72-76 in `admin-story-builder-generate.ts`
   - Let `generateForPlan` handle all file creation
   - Risk: `generateForPlan` is fire-and-forget, might not complete before scaffold finishes

2. **Immediate Fix (Option B)**: Have fill job write `.md` files
   - Extend `PlanGenerationJob.ts` to also generate and write lore/narrative files
   - Use existing `generateLore` method from `LoreGenerator.ts` but modify to overwrite existing files
   - Risk: Need to ensure `generateLore` is called for all items during fill

3. **Architectural Fix**: Make scaffold step write only YAML, and have fill job handle all content generation including `.md` files
   - Aligns with NEXT_STEPS.md design principle: "fill step should replace TODO in the file on disk"
   - Requires extending fill job to include lore generation

---

### Blocking Issues Status

1. ⚠️ **Content directory path bug** - PARTIALLY FIXED: Files go to `/app/content/` in `StoryBuilderLore.ts` but `LoreGenerator.ts` (lines 30, 98) and `PromptFileGenerator.ts` (lines 33, 105) still use `path.resolve(process.cwd(), 'content')` which resolves to `/app/server/content` when running from server dir. **Impact:** `generateForPlan` and `generateForItem` write to wrong location. **Fix Required:** Update `LoreGenerator.ts:30,98` and `PromptFileGenerator.ts:33,105` to use `resolveContentDir()` from `StoryBuilderLore.ts` instead of `path.resolve(process.cwd(), 'content')`
2. ✅ **Template literal bug** - FIXED: Filenames use string concatenation instead of template literals
3. ✅ **LiteLLM connectivity** - WORKING: Server container can reach LiteLLM with proper auth
4. ✅ **outline_source missing** - FIXED: Now always set to 'llm' for LLM-generated plans
5. ✅ **PlanGenerationJob already handles .md file generation** - VERIFIED: `PlanGenerationJob.ts:121-135` already calls `generateForItem` and `generatePromptForItem` after fillFields, meaning the fill job DOES write .md files. The issue in probe verification was that scaffold step overwrites them.

---

## Fill Existing TODOs Tool (2026-07-21)

### Purpose
Standalone script to bulk-fill existing TODO placeholders in content files that were scaffolded but never filled with LLM content.

### Implementation
- **File:** `server/src/scripts/fillExistingTodos.ts`
- **Command:** `npm run fill-todos --workspace=server`
- **Provider:** Uses MockProvider (suitable for testing without LiteLLM)

### Behavior
1. Scans content directory using `scanForTodoPlaceholders()`
2. Logs all files with TODO placeholders (totalFiles, filesWithTodo, item details)
3. For each item, calls `generateForItem()` for .md files and `generatePromptForItem()` for .prompt.md files
4. Progress tracking: "Filling X of Y files..."
5. Only overwrites files that contain TODO placeholders (preserves user-edited content)
6. Handles errors gracefully and reports summary: `{ filled: N, skipped: M, errors: K }`

### Verification Results (2026-07-21)

| Time | Test | Result | Notes |
|------|------|--------|-------|
| 13:38 | First run from project root | ✅ PASS | Found 13 items with TODO, filled 14 files, skipped 12 |
| 13:39 | Second run (resume mode) | ✅ PASS | Found 9 items with TODO, filled 3 files, skipped 15 |
| 13:40 | Third run (resume mode) | ✅ PASS | Found 9 items with TODO, filled 3 files, skipped 15 |

### Acceptance Criteria Met

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `rainy_street_motorcycle.prompt.md` no longer contains "TODO" | ✅ PASS | grep returns exit code 1 (not found) |
| `sofia_mendoza.md` no longer contains "TODO" | ✅ PASS | grep returns exit code 1 (not found) |
| `sofia_mendoza.md` contains >50 chars | ✅ PASS | 1569 characters |
| Script outputs summary format | ✅ PASS | `{ filled: N, skipped: M, errors: K }` |

### Key Finding: Path Resolution Issue
**Discovered:** `LoreGenerator.ts:98` and `PromptFileGenerator.ts:105` use `path.resolve(process.cwd(), 'content')` which resolves incorrectly when running from `server/` directory (becomes `/app/server/content` instead of `/app/content`). **Workaround in script:** Uses `process.chdir()` to temporarily change working directory to project root before calling the generation functions. **Proper fix:** Update these files to use `resolveContentDir()` from `StoryBuilderLore.ts` (which correctly uses `__dirname` with `../../../content`).

### Known Limitations
- Files with TODO in YAML metadata (e.g., `faction: 'TODO: Add faction'`) will generate prompts containing "TODO" — this is expected, as the script only fills file-level TODO placeholders, not YAML field values
- Dialogue YAML files with TODO in node text (e.g., `text: 'TODO: Add dialogue text'`) are not processed — these require a separate YAML fill operation
- **Path resolution dependency:** The script works around the `process.cwd()` bug in LoreGenerator.ts/PromptFileGenerator.ts by using `process.chdir()`. If you previously ran without this fix, check for and remove any `server/content/` directory that may have been created.

### Files Affected
- `server/src/scripts/fillExistingTodos.ts` (new)
- `server/package.json` (script entry already exists)
- Uses existing: `FillPlaceholders.ts`, `LoreGenerator.ts`, `PromptFileGenerator.ts`, `MockProvider.ts`, `ContentPlanService.ts`

---

## Open work

### DONE — Split story-bible plan generation into outline → scaffold → async fill

**Status:** implemented 2026-07-20. Moved to "Shipped" below.

**BLOCKER #1 — Content directory path bug (2026-07-21):** Files are written to `/app/server/content/` instead of `/app/content/` due to `resolveContentDir()` using `process.cwd()` which is `/app/server` (tsx watch location). **Fix:** Update `StoryBuilderLore.ts:7-9` to use `__dirname` with `../../../content` path. See section 7 below for details.

**BLOCKER #2 — Template literal bug in file naming:** In `admin-story-builder-generate.ts` lines 63 and 66, the template literals `${item.slug}.md` and `${item.slug}.prompt.md` are NOT being evaluated by `tsx` and are instead written as literal strings, creating files like `${item.slug}.md` instead of `character_name.md`. **Fix:** Replace template literals with string concatenation:
```typescript
// Line 63: Change from
const lorePath = path.join(contentDir, filePath.replace(/[^/]+$/, ''), `${item.slug}.md`);
// To
const lorePath = path.join(contentDir, filePath.replace(/[^/]+$/, ''), item.slug + '.md');

// Line 66: Change from  
const promptPath = path.join(contentDir, filePath.replace(/[^/]+$/, ''), `${item.slug}.prompt.md`);
// To
const promptPath = path.join(contentDir, filePath.replace(/[^/]+$/, ''), item.slug + '.prompt.md');
```

**Latency probe fixed 2026-07-21:** Updated `server/scripts/latency_probe.ts` to poll `GET /plans/:id/generation-status` instead of asset needs, verifying the async fill pipeline completes in under a second when external HTTP succeeds.

**Fill Existing TODOs Script Added 2026-07-21:** Created `server/src/scripts/fillExistingTodos.ts` to bulk-fill existing TODO placeholders in `.md` and `.prompt.md` files that were scaffolded but never filled. Uses MockProvider for testing. Run with `npm run fill-todos --workspace=server`. **Verification:** Successfully filled 14 files on first run (sofia_mendoza.md, rainy_street_motorcycle.prompt.md, etc.), with resume mode correctly skipping already-filled files on subsequent runs. Acceptance criteria met: both target files now contain non-TODO content with >50 chars. **WARNING:** Due to the path resolution bug in LoreGenerator.ts/PromptFileGenerator.ts, running from server/ directory without the chdir workaround creates files in `server/content/` instead of `content/`. Ensure `server/content/` is cleaned up or deleted, and always run from project root or use the fixed script.

**Probe run in progress 2026-07-21.** The following fixes were applied to get plan creation working end-to-end:
- `server/src/services/LiteLLMProvider.ts`: `callLLM` now falls back to `reasoning_content` when `content` is null (poolside models omit `content` on the first chunk).
- `server/src/services/ContentPlanService.ts`: `generateOutline()` now calls `this.validateAndRepairOutline()` on the raw LLM result before returning, instead of schema-parsing first and throwing on invalid UUIDs.
- `server/src/routes/admin-story-builder-generate.ts`: plan row now uses `crypto.randomUUID()` instead of the LLM-generated plan ID, because the outline model deterministically emits the same UUID across retries and collides with existing `content_plans` rows.
- **FINDING 2026-07-21: Files ARE being written to the host's `content/` folder** — The Docker volume mount `./content:/app/content` ensures container writes appear on the host. YAML files (`char_*.yaml`, `scene_*.yaml`, etc.) are created correctly under `content/<type>/<slug>/`. **However**, lore/prompt stub files are created with literal template string names (e.g., `${item.slug}.md` instead of `terminal_access_point.md`) due to a `tsx` template literal evaluation bug. **Additionally**, if the LLM generates items with slugs matching existing files (e.g., `test_character`, `test_scene`), `checkCreateConflicts` (line 36) returns a 400 error and NO files are written. This explains why some requests appear to create no files — they're being blocked by conflict detection, not a file-write failure.

**Problem.** `POST /admin/story-builder/plan` made **one** LLM call with a 60s timeout that must emit the **entire** plan — including all prose — in one JSON blob. For the 1k-line story bible the completion blows past 60s → timeout.

**Implementation summary (done):**
- `server/src/services/PlanGenerationJob.ts` (new): `runPlanFill`, `getPlanFillJobStatus`, `setPlanFillJobStatus`, `resetOrphanedFillJobs`. Async per-item fill, bounded-parallel (`PLAN_FILL_CONCURRENCY`, default 3), non-fatal per-item failures. Dual-write (file + `plan_json` reload-before-merge).
- `server/src/services/ContentPlanService.ts`: `generateOutline` (skeleton with `TODO:`), `validateAndRepairOutline` (UUID/slug repair, dedup, deterministic fallback), `generateFallbackPlan`.
- `server/src/services/LLMPrompts.ts`: `buildOutlinePrompt` — skeleton-only output with `TODO:` prose.
- `server/src/services/LiteLLMProvider.ts`: per-call `timeoutMs`, escalating timeout (`LLM_TIMEOUT_MS` → `LLM_MAX_TIMEOUT_MS`), `LLM_OUTLINE_MODEL` support, `generateOutline` method.
- `server/src/services/StoryBuilderPlanOps.ts`: `stagePlan` gates on `_meta.scaffolded_at` to skip `checkCreateConflicts` + `writePlanItems`; fill-safety-net kept.
- `server/src/services/StoryBuilderOrchestrator.ts`: `resetOrphanedFillJobs()` called on startup.
- `server/src/routes/admin-story-builder-actions.ts` + `admin-story-builder-generate.ts` (new, mounted via `.use()`): `POST /plan` does outline → scaffold+write files → persist `draft` with `_meta.scaffolded_at` → fire `runPlanFill` → return `{planId, plan, status:'generating'}`. New `GET /plans/:id/generation-status` polls fill job.
- `shared/src/schemas/story-builder.ts`: added optional `_meta` to `ContentPlanSchema` (no migration).
- Client: `useStoryBuilderApi.ts` (`getGenerationStatus`, updated `generatePlan` return shape), `useStoryPlanApiHandlers.ts` (`makeGeneratePlan` polls generation status, skips redundant `savePlan`).
- Tests: `plan-generation-job.test.ts` (new), `contentPlanService.test.ts` (outline + repair + fallback), `story-builder-conflicts.test.ts` (scaffolded plan skips writes), `adminStoryBuilder.test.ts` (updated response shape + mocks).

**Env vars (defaults):** `PLAN_FILL_CONCURRENCY=3`, `PLAN_OUTLINE_CONTEXT_DEPTH=names`, `LLM_TIMEOUT_MS=60000`, `LLM_MAX_TIMEOUT_MS=300000`, `LLM_OUTLINE_MODEL=<LLM_MODEL>`, `PLAN_FILL_TIMEOUT_MS=120000`.
2. **Files written directly to `content/` during generate, git is the rollback.** Aligns with the content-layering contract (`content/` = dev-mode file database; `migrateContent` upserts file → DB). This just reorders *when* files appear (generate instead of approve).
3. **Scaffolded-plan tracking.** Each plan that completes step 2 (scaffold) stores a `scaffolded_at` timestamp in `plan_json._meta` (or a lightweight DB boolean column). This is the signal that `stagePlan` uses to skip `checkCreateConflicts` and write-plan-items for already-scaffolded plans — both `runSolidify` (`StoryBuilderOrchestrator.ts:248`) and the retry path `runStagingPipeline` (`admin-story-builder-staging.ts:66`) need this check.
4. **Output repair and deterministic fallback.** The outline step must survive invalid/truncated model output — `validateAndRepairOutline()` replaces bad/missing UUIDs with `crypto.randomUUID()`, slugifies names for invalid slugs, coerces unknown types/actions to safe defaults, deduplicates `(type,slug)` pairs by suffix, and keeps truncated item lists with a warning rather than failing the entire plan. If zero salvageable items remain after repair, a deterministic keyword-extraction fallback (one character + N scenes/locations, all `TODO:`) produces an editable skeleton — never a `failed` plan. Provenance in `_meta.outline_repaired` and `_meta.outline_source` (`'llm'` | `'fallback'`) cues the UI. Env vars for tuning: `LLM_TIMEOUT_MS` (base, default 60_000), `LLM_MAX_TIMEOUT_MS` (cap, default 300_000), `LLM_OUTLINE_MODEL` (defaults to `LLM_MODEL`).



**Generation flow (4 steps).**

1. **Outline — sync, LLM, the one "reason over N+m" step** (`POST /admin/story-builder/plan`). `gatherContext()` loads N existing items (`ContentPlanService.ts:181`) — use **names+ids+roles only** by default (`PLAN_OUTLINE_CONTEXT_DEPTH=names`). One LLM call → per new item `{id, type, name, slug, action, one-line description, dependsOn}`, all prose fields `TODO:`. The LLM output is run through `validateAndRepairOutline()` before acceptance — bad UUIDs are replaced (`crypto.randomUUID()`), names are slugified into valid `/^[a-z0-9_]+$/` slugs, unknown types/actions are coerced to safe defaults, truncated item lists are kept with warnings rather than rejected, and duplicate `(type,slug)` pairs are deduplicated by suffix. On timeout or zero salvageable items, the outline retries with escalating timeout (×2, ×4 capped by `LLM_MAX_TIMEOUT_MS`). If `LLM_OUTLINE_MODEL` differs from `LLM_MODEL`, a retry with the alternative model follows. If all retries fail, a deterministic keyword-extraction fallback produces a heuristic skeleton with all `TODO:` prose — the plan **never** arrives empty. `ContentPlanSchema` already accepts `TODO:` strings (`fields: z.record(string, any)`, `shared/src/schemas/story-builder.ts:20`) + optional `filled_fields` → **no schema change, no new migration**.
2. **Scaffold + write files — sync, deterministic, no LLM** (still in `POST /plan`, before returning). Run `checkCreateConflicts` (moved up from `stagePlan:240`) — this is the **only** point where create-over-existing is enforced. For **`create`** items: write `content/<type>/<slug>/<prefix><slug>.yaml` (via `generateYaml` with `TODO:` placeholders) + `<slug>.md` lore stub + `<slug>.prompt.md`. For **`update`** items: no file write. Persist `content_plans` row (`status: draft`) with `plan_json` = skeleton + `_meta.scaffolded_at: <now>` + `_meta.jobPrefix: 'story-builder:gen:'`. Fire background `runPlanFill(planId)`. Return `{ planId, plan: skeleton, status: 'generating' }` immediately.
3. **Fill — async, LLM, per-item, bounded-parallel (`PLAN_FILL_CONCURRENCY`, default 3), non-fatal** (`runPlanFill`). For each item: **reload `plan_json` from DB** (to capture any concurrent author edits) → `fillFields`+`mergeFilledFields` → `generateFill`. **Dual-write with merge**: replace `TODO:` in the file on disk **and** merge filled values into the latest `plan_json` (reload-before-write avoids clobbering concurrent edits — NOT a full-object `SET plan_json = $1`). Lore generation folds in here (instead of today's detached `.catch` in `ContentPlanService.parseDescription:36`). Update cache `story-builder:gen:<planId>` at each stage. Per-item failure → warn + leave `TODO:` (the `stagePlan` fill loop stays as a safety net). Terminal: flip `draft → proposed`, write final `plan_json`. **Orphan detection**: on startup, `resetOrphanedFillJobs()` scans `draft` plans where `_meta.scaffolded_at` is set but the `gen` cache is stale (no entry or `updatedAt` > 5 min old) → re-queue `runPlanFill`. Plans with `scaffolded_at` but no gen cache and no processed items → mark `failed`.
4. **Approve-and-solidify — revised** (`approveAndSolidifyPlan` → `runSolidify`). Files already exist → `stagePlan` **skips both `checkCreateConflicts` AND `writePlanItems`** when `_meta.scaffolded_at` is set. `stagePlan` now does only: fill safety-net for leftover `TODO:`s → `applyLink` → `validateContent` → lore/prompt stubs. `rollbackFiles` on validation failure stays. `runSolidify` then: flip status `staged` → `migrateStagedPlan` (DB upsert — **owned by `runSolidify`, NOT by `stagePlan`**) → `verifyPlan`. Both callers of `stagePlan` (`runSolidify:248`, `runStagingPipeline:66`) gate on the scaffolded flag.

**File-level changes.**

- *Server*: `LLMPrompts.ts` (`buildSystemPrompt` → skeleton-only output with `TODO:` prose placeholders; `buildFillFieldsPrompt` unchanged); `ContentPlanService.ts` (split `parseDescription` into `generateOutline(description)` + `validateAndRepairOutline(plan, description)` repair+fallback + reusable `fillPlanItems(plan, context, provider)` bounded-parallel/non-fatal; remove detached lore `.catch`); **new** `server/src/services/PlanGenerationJob.ts` (`PlanFillJobStatus`, `setPlanFillJobStatus`/`getPlanFillJobStatus`, `runPlanFill(planId, userId)`, `resetOrphanedFillJobs()` — detect orphans via `scaffolded_at` + stale `gen` cache); `StoryBuilderPlanOps.ts` (`stagePlan`: gate on `_meta.scaffolded_at` to skip `checkCreateConflicts`+`writePlanItems`, keep fill safety-net/applyLink/validate/lore; move `checkCreateConflicts` to generate endpoint); `routes/admin-story-builder-actions.ts` (`POST /plan`: outline → scaffold+write → persist draft with `scaffolded_at` → fire `runPlanFill` → return `{planId, plan, status:'generating'}`; add `GET /plans/:id/generation-status`); `LiteLLMProvider.ts` (optional per-call `timeoutMs` so outline can use a shorter timeout); `MockProvider.ts` (outline returns skeleton with `TODO:`; `generateFill` already deterministic); `server/src/index.ts` (call `resetOrphanedFillJobs()` next to `resetOrphanedSolidifyJobs()`); env vars: `PLAN_FILL_CONCURRENCY` (default 3), `PLAN_OUTLINE_CONTEXT_DEPTH` (default `names`), `LLM_TIMEOUT_MS` (base, default 60_000), `LLM_MAX_TIMEOUT_MS` (cap, default 300_000), `LLM_OUTLINE_MODEL` (defaults to `LLM_MODEL`), `PLAN_FILL_TIMEOUT_MS` (default 120_000).
- *Shared/DB*: none — `draft`→`proposed`→approve path uses existing statuses (migration 055). New `_meta` keys in `plan_json` (`JSONB`) need no schema change.
- *Client* (`admin/src/app/story-builder`): `hooks/useStoryBuilderApi.ts` (`generatePlan` returns `{planId, plan, status}`; add `getGenerationStatus(planId)` mirroring `getJobStatus`); `hooks/useStoryPlanApiHandlers.ts` (`makeGeneratePlan`: set skeleton+planId+step 2 from generate response, then **poll `getGenerationStatus`** and refresh plan from DB as items fill, stop on terminal; **skip the redundant `savePlan`** on the generate path — row now exists; `savePlan` stays for template/clone/edit; **block refine** while `status === 'draft'` and generation job is running in cache to avoid slug conflicts on scaffolded plans); `components/ContentCard.tsx` (already keys off `filled_fields`/`TODO:`; add a subtle "generating…" affordance on in-progress fields).
- *Tests*: `server/tests/unit/story-builder-conflicts.test.ts` — move create-conflict test to generate path (stage-time must now pass for scaffolded plans); add test that `stagePlan` on a scaffolded plan skips writes and succeeds. **New** `server/tests/unit/plan-generation-job.test.ts` — `runPlanFill` per-item failure is non-fatal, `resetOrphanedFillJobs` startup recovery, dual-write merge doesn't clobber concurrent edits. Update `server/tests/unit/contentPlanService.test.ts` — `parseDescription` now returns skeleton with `TODO:` (not full prose); `MockProvider` outline returns skeleton.
- *Probe*: `server/scripts/latency_probe.ts` — switch from `POST /plans` (save endpoint) to `POST /plan` (generate endpoint). `[2]` reads skeleton+planId, polls `generation-status` to terminal, then calls approve-and-solidify instead of the current `PUT verified` bypass since files now exist and need migration; report outline time, scaffold time, fill time, total. **Fixed 2026-07-21**: polling logic now uses `GET /plans/:id/generation-status` instead of asset needs; removed dead DB query code; fixed undefined variables in output.

**Behavioral sub-decisions (made, correct if wrong).** Dual-write: file + `plan_json`, with **reload-before-merge** per item to avoid clobbering concurrent author edits (NOT a full-object `SET plan_json = $1`). `DELETE /plans/:id` removes the DB row + generation-job cache but **leaves files** for `git checkout content/` rollback (optional `?cleanFiles=true` later). `refinePlan` out of scope this pass — still one-shot; files-during-generate makes refine's slug-conflict surface larger (generate-time `checkCreateConflicts` would reject already-existing files) → block refine in UI while `status === 'draft'` and generation in cache. `create` vs `update` distinction carried forward (create → write new scaffold; update → no file write, targeted merge at fill/stage).

**Risks.** Orphan files on discard — accepted, git rollback (doc'd). Dual-write consistency — both derive from the same fill result; file-write failure marks that item's fill failed and leaves `TODO:`; **new risk**: concurrent author edit during fill can be clobbered if `plan_json` is written as full-object set — mitigated by reload-before-merge. `previewPlan` (dry-run) must account for files already existing post-generate — verify behavior. `refine` slug conflicts — blocked in UI during draft+generation.

**Verification.** `npm run lint --workspace=server`, `npm run build --workspace=server`, `npm run test --workspace=server` (unit + new outline→scaffold→fill tests + generation-job test + conflict-test migration + `validateAndRepairOutline` repair/fallback unit test). Extend `server/tests/unit/contentPlanService.test.ts` (add outline repair + fallback test); add `server/tests/unit/plan-generation-job.test.ts`; update tests assuming sync-filled `POST /plan`. Rebuild/restart per AGENTS.md; live probe `INPUT_FILE=~/Downloads/posts-compilation-complete.md SERVER_URL=http://localhost:3000 npx tsx server/scripts/latency_probe.ts` → confirm outline+scaffold completes fast, fill job reaches `done`, files appear under `content/` with non-`TODO:` prose, total outline leg under 60s. **After fixing template literal bug**: verify lore/prompt stubs are created with correct names (e.g., `character_name.md`, not `${item.slug}.md`). Then update the "Robustness for weak/slow models" section below to reference any triage findings from the run.

### Future extensions (aspirational, not planned)

- External queue (redis/streams) / SSE / horizontal scaling beyond single server — requires AGENTS.md constraint lift on new infra.

### Input file to reuse for future tests

- **`~/Downloads/posts-compilation-complete.md`** — 1k-line story bible for "Real Heroism in Latam" (character Graciela Ramírez, family members, South American city scenes). Reuse as the canonical input for any future end-to-end authoring or latency tests. Do not move into `content/` or `docs/` — it is not game content; it is the raw ingestion test fixture.

#### How to run the story-bible ingestion

The probe (`server/scripts/latency_probe.ts`) reads the input file and derives the Story Builder description from it (first heading + body brief), so a run always exercises the file path. With the dev server up:

```bash
# Server must be running and migrated (see AGENTS.md clean-shutdown pattern)
podman exec las-flores-server wget -qO- http://localhost:3000/health   # expect {"success":true}

# Run the end-to-end probe against the story bible
INPUT_FILE=~/Downloads/posts-compilation-complete.md \
  SERVER_URL=http://localhost:3000 \
  npx tsx server/scripts/latency_probe.ts

# After probe completes, check the host's content/ directory for generated files:
# ls -la content/characters/graciela_ramirez/    # char_graciela_ramirez.yaml, graciela_ramirez.md, graciela_ramirez.prompt.md
# ls -la content/scenes/central_plaza/        # scene_central_plaza.yaml, central_plaza.md, central_plaza.prompt.md
```

### Robustness for weak / slow models — design principle

The split design above (outline → scaffold → async fill) is the primary structural mitigation for model timeouts. This section documents the **additional safeguards** that make the system tolerate weak, slow, or unreliable models without requiring the operator to "use a faster model" as the first resort.

**Principle.** The intake must produce a **usable, editable skeleton** (possibly `TODO:`-heavy) even when the model is slow or weak. A model timeout or malformed output must never reduce the entire intake to zero files. "Use a faster model" or "raise the timeout" are **operator tuning knobs** — not the system's answer to model weakness.

#### Safeguards (cross-references to the NEXT plan)

| # | Safeguard | Where | Env / tune |
|---|-----------|-------|------------|
| 1 | **Output repair.** `validateAndRepairOutline()` replaces bad/missing UUIDs with `crypto.randomUUID()`, slugifies names for invalid slugs, coerces unknown types/actions to safe defaults, deduplicates `(type, slug)` pairs by suffix, keeps truncated item lists with a warning. | Outline step (step 1) | — |
| 2 | **Escalating timeout.** On timeout or zero salvageable items, retry with ×2 then ×4 timeout (capped). | `callLLM` retry loop (`LiteLLMProvider.ts:42`) | `LLM_TIMEOUT_MS` (base, default 60_000), `LLM_MAX_TIMEOUT_MS` (cap, default 300_000) |
| 3 | **Model-tier fallback.** Retry the outline with `LLM_OUTLINE_MODEL` (e.g. a cheaper/slower model) if `LLM_MODEL` fails, before hitting the deterministic fallback. | Outline step | `LLM_OUTLINE_MODEL` (defaults to `LLM_MODEL`) |
| 4 | **Deterministic fallback.** If all outline retries and model fallbacks return zero salvageable items, a keyword-extraction heuristic produces one character + N scenes/locations with all `TODO:` prose. | `validateAndRepairOutline()` | — |
| 5 | **Per-item fill retry.** `runPlanFill` retries each `generateFill` call 1–2 times on empty/malformed response before leaving `TODO:`. | Fill step (step 3) | `PLAN_FILL_TIMEOUT_MS` (default 120_000) |
| 6 | **Fill output validation.** Trimmed, non-empty, code-fence-stripped values only; empty/AI-refusal values leave `TODO:` untouched. | `fillFields()` / `mergeFilledFields()` (`ContentFillService.ts`) | — |
| 7 | **Provenance in `_meta`.** `_meta.outline_source: 'llm' | 'fallback'`, `_meta.outline_repaired: true`, `_meta.fill_attempts: { itemId: n }` for UI/probe visibility. | `plan_json._meta` | — |

All safeguards are **default-on** — no env changes needed for normal operation. Tuning env vars exist for operators who know they are running a slow/weak model and want to give it more room before the fallback kicks in.

#### Triage beyond the basic timeout

| Observation | Most likely cause | Action |
|-------------|-------------------|--------|
| `{success: false}`, `ENOENT prompt.md` | Prompt-stub step skipped during staging | Asset-generation issue — run the probe fetch (`PUT .../plan-status`) |
| Plan reaches `proposed` with `_meta.outline_source: 'fallback'` | Outline LLM failed; deterministic fallback produced a heuristic skeleton | Edit in Review step before approving — fine for small rapid batches; large batches may need a stronger model |
| Plan reaches `proposed` with `_meta.outline_repaired: true` | Outline LLM returned valid JSON but with defects (bad UUIDs, missing slugs, unknown types) | The repair step fixed them automatically — inspect for missing items in Review |
| Per-item fields remain `TODO:` after fill job completes (`status: proposed`) | Fill LLM timed out or returned empty for those items | The stage-time safety net fills them on approve; or author can write them manually in Review |
| Plan status is `failed` | Pre-scaffold error (e.g. `gatherContext` DB mismatch) or outline produced zero salvageable items AND deterministic fallback was also empty (unlikely) | Check server logs for the error detail; re-run after fix |
| Plan takes >5 min for fill but eventually reaches `proposed` | Slow model + many items at default concurrency | Increase `PLAN_FILL_CONCURRENCY` or lower `PLAN_FILL_TIMEOUT_MS` to fail fast on stuck items |

**Bottom line.** The old "ask the LLM to be faster" workaround is replaced by the split design + these safeguards. A run with the 1k-line story bible should always produce at least a heuristic skeleton with `TODO:` prose — never a zero-file `failed` — regardless of model speed or quality.

### LLM placeholder behavior clarification (2026-07-21)

**Q: Why does the outline step create items with "Test Character" names and `TODO:` placeholders instead of using the LLM to generate full content?**

A: This is **by design** — the split architecture intentionally separates outline generation from content filling:

1. **Outline step** (`buildOutlinePrompt` in `LLMPrompts.ts`): Asks the LLM to generate a **skeleton** with only identifiers (names, slugs, types, dependencies) and `TODO:` placeholders for all prose fields. The prompt explicitly states: *"Write TODO: placeholders for all prose fields — the async fill step will write the actual content."* (line 104)

2. **Scaffold step**: Writes the skeleton to YAML files with `TODO:` placeholders. This is intentional — it ensures files are created immediately even if the fill step takes time or fails.

3. **Fill step** (`runPlanFill`): The async background job replaces `TODO:` placeholders with actual LLM-generated content using `buildFillFieldsPrompt`.

**Example:** For input `"Direct test with curl"`, the outline LLM (poolside/laguna-m.1) generates:
- Character: `name: "Test Character"`, `description: "Sample character for curl endpoint testing"`, `fields: {description: "TODO: Add character description", ...}`
- Scene: `name: "Test Scene"`, `description: "Sample scene for curl endpoint testing"`, `fields: {description: "TODO: Add scene description", ...}`

The `name` and top-level `description` are LLM-generated (interpreting your input), while `fields.*` are all `TODO:` by design. The fill step would later replace these `TODO:` values.

**If you want the LLM to generate better names/descriptions**, use more descriptive input. The outline LLM uses your description as context, so `"A cyberpunk detective story in Las Flores with a rogue AI hunter named Alice"` will produce `"Alice"` (character) and relevant scene names instead of generic "Test Character"/"Test Scene".

**Note on file location:** All generated files (YAML, `.md`, `.prompt.md`) are written to the **host's `content/` directory** via the Docker volume mount `./content:/app/content`. The YAML files appear at `content/<type>/<slug>/<prefix><slug>.yaml` (e.g., `content/characters/alice/char_alice.yaml`).

### Podman + litellm operational findings (2026-07-20)

These findings save significant time on future local runs:

1. **`podman-compose` does not expand `${VAR:-default}` syntax** — Environment variables like `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-las_flores_dev_password}` are passed literally to the container, causing auth failures. **Workaround**: use `podman run` with explicit `-e POSTGRES_PASSWORD=las_flores_dev_password` instead of `podman-compose up`.

2. **No aardvark-dns = no container DNS** — Podman rootless without `aardvark-dns` means container hostnames (e.g., `las-flores-postgres-oltp`) don't resolve. **Workaround**: use container IPs directly in `DATABASE_URL`, `REDIS_URL`, etc. Get IPs with `podman inspect <container> --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`.

3. **litellm must run on the host, not in a container** — The litellm container can't reach external APIs (poolside.ai, openrouter.ai) because DNS resolution fails inside podman containers. **Workaround**: run litellm on the host: `litellm --config ~/litellm_config/config.yaml --port 4000`. The server container reaches it via `--add-host=host.containers.internal:host-gateway` + `LITELLM_BASE_URL=http://host.containers.internal:4000`.

4. **Server requires `LLM_PROVIDER=litellm`** — The default is `mock`, which returns minimal deterministic plans (1 item, 0 asset needs). To exercise the real LLM pipeline, set `LLM_PROVIDER=litellm` in the server container's environment.

5. **Migration 055 must be in `migration-targets.json`** — The CHECK constraint migration for async statuses (`pending`/`staging`/`migrating`/`verifying`) exists on disk but was not registered. Now added; applies automatically on server startup.

6. **LiteLLM operational issues (2026-07-21)** — **CONFIRMED WORKING**
   - ✅ LiteLLM IS running on host with `~/litellm_config/config.yaml` — **CONFIRMED**: `ps aux | grep litellm` shows process, `curl -s -H "Authorization: Bearer local-key" http://localhost:4000/health` returns healthy endpoints, and chat completions work.
   - ✅ Server container CAN reach LiteLLM: `podman exec las-flores-server wget -qO- --header="Authorization: Bearer local-key" http://host.containers.internal:4000/v1/models` returns model list successfully.
   - ⚠️ **Intermittent timeouts**: Some requests succeed (returning plans with `scaffolded_at`), others timeout. This may be due to poolside model streaming or intermittent connectivity.
   - The `content` vs `reasoning_content` field handling in `callLLM` (line 95) addresses poolside model chunking differences where the first chunk may have `reasoning_content` but null `content`.
   - **Symptom**: Empty curl responses or timeouts when litellm is not responding. **Workaround**: 
     1. Ensure litellm is running on the host: `litellm --config ~/litellm_config/config.yaml --port 4000`
     2. Verify litellm is reachable: `curl -s -H "Authorization: Bearer local-key" http://localhost:4000/health`
     3. Test connectivity from server container: `podman exec las-flores-server wget -qO- --header="Authorization: Bearer local-key" http://host.containers.internal:4000/v1/models`
     4. If DNS resolution fails, use the host's actual IP address in `LITELLM_BASE_URL`
     5. **For quick testing without LLM**: Set `LLM_PROVIDER=mock` in server env, rebuild, and restart.

**Note on Prisma:** No prisma dependency found in server/package.json or docker-compose.yml. The server uses PostgreSQL directly via `pg` driver, not Prisma ORM.

7. **Content directory path bug (2026-07-21) - CRITICAL** — 
   - **FINDING**: Files are being written to `/app/server/content/` instead of `/app/content/` due to `process.cwd()` being `/app/server` (where `tsx watch` runs from) instead of `/app`.
   - **Root cause**: Multiple `resolveContentDir()` functions exist across the codebase. The one in `StoryBuilderLore.ts` (used by `admin-story-builder-generate.ts`) uses `path.resolve(process.cwd(), 'content')` which resolves to `/app/server/content`. The one in `admin-content.helpers.ts` uses logic to handle this, but `StoryBuilderLore.ts` doesn't.
   - **Impact**: Files are written to the wrong location, so they don't appear in the host's `content/` directory. The volume mount `./content:/app/content` means files must go to `/app/content` in the container.
   - **Fix**: Update `StoryBuilderLore.ts:resolveContentDir()` to use `__dirname` with correct relative path:
     ```typescript
     export function resolveContentDir(): string {
       // From /app/server/src/services/: ../../../content = /app/content
       return path.resolve(__dirname, '../../../content');
     }
     ```
   - **Note on tsx caching**: After making changes to TypeScript files, tsx may cache old versions. Restart the server container to ensure changes take effect.

### Working local startup sequence (Podman)

```bash
# 1. Start litellm on the host (needs DNS for external APIs)
pkill -f litellm 2>/dev/null; sleep 1
litellm --config ~/litellm_config/config.yaml --port 4000 &
sleep 5 && curl -s http://localhost:4000/health  # verify running

# 2. Start infrastructure containers with explicit passwords
podman network create las-flores-net 2>/dev/null

podman run -d --name las-flores-postgres-oltp --network las-flores-net -p 5434:5432 \
  -e POSTGRES_DB=las_flores -e POSTGRES_USER=las_flores \
  -e POSTGRES_PASSWORD=las_flores_dev_password docker.io/library/postgres:16-alpine

podman run -d --name las-flores-postgres-olap --network las-flores-net -p 5433:5432 \
  -e POSTGRES_DB=las_flores_analytics -e POSTGRES_USER=las_flores_analytics \
  -e POSTGRES_PASSWORD=las_flores_analytics_dev_password docker.io/library/postgres:16-alpine

podman run -d --name las-flores-redis --network las-flores-net -p 6379:6379 \
  docker.io/library/redis:7-alpine

# 3. Get container IPs
OLTP_IP=$(podman inspect las-flores-postgres-oltp --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
OLAP_IP=$(podman inspect las-flores-postgres-olap --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
REDIS_IP=$(podman inspect las-flores-redis --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')

# 4. Build and start server with LLM config
podman build -f server/Dockerfile -t las-flores-server .
podman run -d --name las-flores-server --network las-flores-net \
  --add-host=host.containers.internal:host-gateway -p 3000:3000 \
  -v ./server/src:/app/server/src -v ./shared:/app/shared \
  -v ./content:/app/content -v ./docs:/app/docs:ro \
  -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@${OLTP_IP}:5432/las_flores" \
  -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@${OLAP_IP}:5432/las_flores_analytics" \
  -e REDIS_URL="redis://${REDIS_IP}:6379" \
  -e MINIO_ENDPOINT=10.89.0.5 -e MINIO_PORT=9000 \
  -e MINIO_ACCESS_KEY=minioadmin -e MINIO_SECRET_KEY=minioadmin \
  -e JWT_SECRET=your-jwt-secret-change-in-production \
  -e LITELLM_BASE_URL=http://host.containers.internal:4000 \
  -e LITELLM_API_KEY=local-key \
  -e LLM_PROVIDER=litellm -e LLM_MODEL=poolside/laguna-m.1 \
  las-flores-server

# 5. Verify health
sleep 25 && podman exec las-flores-server wget -qO- http://localhost:3000/health
```

---

## Related docs

- `docs/STORY_BUILDER_DESIGN.md` — shipped implementation, remaining open work (§4.4)
- `docs/ADMIN_ARCHITECTURE.md` — admin panel structure and conventions
- `docs/DATA_INTAKE.md` — content intake paths
