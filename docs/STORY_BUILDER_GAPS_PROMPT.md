# Story Builder — Close the Gaps (Implementation Prompt)

> **Purpose:** This file is a self-contained instruction prompt for an AI coding agent.
> Paste it into a new chat to continue the work of closing the gaps in the Story Builder
> draft → AI analysis → proposal → approve → YAML flow.
>
> **Prerequisite:** Read `AGENTS.md` in the repo root for hard constraints (DB patterns,
> verification checklist, Docker gotchas) before starting.

---

## 1. Context — What Already Exists

The Las Flores 2077 admin panel has a **Story Builder** feature at `/story-builder`
that lets admins describe content in natural language, AI-generates a structured
`ContentPlan`, the user reviews/refines it, then stages YAML files and migrates
them to the database. The flow is **mostly built** — the gaps are listed in §2.

### Current architecture (do NOT rebuild these — extend them)

| Layer | Files | What it does |
|-------|-------|--------------|
| **DB table** | `server/src/database/migrations/047_content_plans.sql`, `048_content_plans_versioning.sql` | `content_plans` table: `id`, `description`, `plan_json` (JSONB), `status` (CHECK: `draft → proposed → approved → staged → migrated → failed`), `feedback_log` (JSONB), `parent_plan_id` (version chain), `created_by`, timestamps |
| **Shared schema** | `shared/src/schemas/story-builder.ts` | Zod schemas: `ContentPlanSchema`, `ContentPlanItemSchema`, `ContentLinkSchema`, `AssetNeedSchema`, `FeedbackLogEntrySchema`. Types exported from `shared/src/index.ts` |
| **LLM service** | `server/src/services/LLMService.ts` (319 lines) | `LLMProvider` interface with `parseDescription()` and `refinePlan()`. `MockProvider` + `LiteLLMProvider` implementations. `buildSystemPrompt()` / `buildRefinementPrompt()` produce the system prompts. **Only outputs JSON `ContentPlan` — does NOT generate lore markdown** |
| **Plan service** | `server/src/services/ContentPlanService.ts` (104 lines) | `parseDescription()` (LLM + context + Zod + asset needs), `refinePlan()` (loads existing, LLM refines, creates new versioned row with feedback log) |
| **Orchestrator** | `server/src/services/StoryBuilderOrchestrator.ts` (402 lines) | `previewPlan()` (dry-run), `stagePlan()` (write YAML + validate + lore stubs + prompt files + rollback), `migrateStagedPlan()` (DB upsert). **Lore stubs are TODO placeholders, not AI-generated** |
| **Lore stub generator** | `StoryBuilderOrchestrator.ts:79-144` (`generateLoreStubs` + `buildLoreStub`) | Writes placeholder `.md` files at `lore_path`/`narrative_path` during **staging only** (step 3), not during review |
| **YAML skeleton generator** | `server/src/services/ContentSkeletonGenerator.ts` | `generateYaml(item)` — templates for all 12 content types; `resolveFilePath(item)` — maps type+slug to file path |
| **File writer** | `server/src/services/StoryBuilderFileWriter.ts` | `writePlanItems()`, `atomicWriteYaml()`, `rollbackFiles()`, `topologicalSort()`, `applyLink()` |
| **Prompt file generator** | `server/src/services/PromptFileGenerator.ts` | Generates `.prompt.md` files for the asset pipeline |
| **Plan templates** | `server/src/services/PlanTemplates.ts` | 3 quick-start templates (Add Mystery, Add Shopkeeper, Add Location) |
| **Endpoints (14 routes)** | `server/src/routes/admin-story-builder.ts` (389 lines) + `admin-story-builder-meta.ts` (167 lines) | All admin-gated. Registered at `server/src/index.ts:142` as `app.use('/admin/story-builder', adminStoryBuilderRouter)` |
| **Lore file endpoints** | `server/src/routes/admin-lore.ts:328-470` | `GET /admin/lore/file?path=<rel>` (read, returns `exists: false` if ENOENT), `POST /admin/lore/file` (write, body: `{path, content}`). Path-validated via `resolveLoreAbsolutePath()` |
| **Admin wizard UI** | `admin/src/app/story-builder/` | 5-step wizard: Describe → Review → Stage → Migrate → Assets. `StoryBuilder.tsx`, `useStoryBuilder.ts`, `useStoryPlanApi.ts`, `useStoryBuilderApi.ts`, `useStoryBuilderMutations.ts` |
| **Lore viewer** | `admin/src/app/story-builder/components/LoreViewer.tsx` | Modal that fetches/edits lore markdown via `/admin/lore/file`. Already integrated into `ContentCard.tsx` via "Lore" / "Narrative" buttons |
| **Admin nav** | `admin/src/components/AdminNav.tsx` | "Story Builder" link under Tools section (line 23) |

### The 5-step wizard flow (current)

```
Step 1: Describe     → POST /admin/story-builder/plan (LLM generates ContentPlan JSON)
Step 2: Review       → Edit items, refine with AI (POST /plans/:id/refine → new versioned row)
Step 3: Stage        → POST /plans/:id/stage (write YAML + validate + lore TODO stubs)
Step 4: Migrate      → POST /plans/:id/migrate (DB upsert)
Step 5: Assets       → Links to /assets page
```

### Lore markdown examples (the target quality)

The lore files in `docs/lore/` are rich narrative documents. Examples to match:

- **Character lore** (`docs/lore/figures/diego_huaman/diego_huaman.md`): H1 title, title fields, age/origin/occupation, multi-paragraph description (physical, personality, challenges, vision), "Key Relationships" table, "Known Habit" section.
- **Story lore** (`docs/lore/stories/the_forgotten_miner/the_forgotten_miner.md`): H1 title, tags block (`> Tags:`), location/period metadata, "## Overview" with narrative paragraphs, section headers for story beats, "## Related Lore" with relative markdown links.

The current `buildLoreStub()` produces only TODO placeholders — it must be replaced
with AI-generated content matching this quality.

---

## 2. Gaps to Close

There are **3 gaps** to implement. Tackle them in order — Gap 1 is the largest.

### Gap 1: AI-Generated Lore Markdown (the "initial proposal" documents)

**Problem:** The `LLMService` only outputs a `ContentPlan` JSON object. It does NOT
generate narrative markdown for each item's `lore_path` / `narrative_path`. The
current `generateLoreStubs()` in `StoryBuilderOrchestrator.ts:79-144` writes TODO
placeholder stubs during **staging** (step 3). Users cannot read or refine the
narrative lore during the **review** step (step 2) because the files don't exist yet.

**Goal:** When a plan is generated or refined, the AI should also produce rich
narrative markdown for each item that has a `lore_path` or `narrative_path`. These
files should be written to `docs/lore/` immediately so the user can read/edit them
in the Review step's LoreViewer modal **before** approving.

#### Implementation steps

**Step 1a: Add lore generation to the LLM provider interface**

File: `server/src/services/LLMService.ts`

1. Add a new method to the `LLMProvider` interface (after `refinePlan`, ~line 15):
   ```typescript
   generateLore(item: ContentPlanItem, context: ExistingContentContext): Promise<string>;
   ```
   This method returns markdown string content for a single plan item's lore/narrative file.

2. Add a `buildLorePrompt()` function (alongside `buildSystemPrompt` / `buildRefinementPrompt`).
   It should:
   - Take a `ContentPlanItem` and `ExistingContentContext`
   - Produce a system prompt that instructs the LLM to write rich narrative markdown
   - Reference the Las Flores 2077 cyberpunk setting
   - Specify the expected structure based on `item.type`:
     - **character**: H1 name, title fields, age/origin/occupation, physical description,
       personality, challenges, vision, "Key Relationships" table, "Known Habit" section
       (mirror `docs/lore/figures/diego_huaman/diego_huaman.md`)
     - **scene/location**: H1 name, tags block, district metadata, "## Overview" narrative,
       atmosphere, notable features, "## Related Lore" links
       (mirror `docs/lore/city_overview.md` style)
     - **mission/story**: H1 title, tags block, location/period, "## Overview" narrative,
       story beats as section headers, "## Related Lore" links
       (mirror `docs/lore/stories/the_forgotten_miner/the_forgotten_miner.md`)
     - **dialogue/overlay/vault/gig/shop_item**: H1 name, description, narrative context
   - Tell the LLM to output ONLY the markdown content, no JSON, no code fences

3. Implement `generateLore()` in `LiteLLMProvider` (after `refinePlan`, ~line 209):
   - Call `this.callLLM(buildLorePrompt(item, context), item.fields.description || item.name)`
   - BUT — `callLLM` currently uses `response_format: { type: 'json_object' }` which
     forces JSON output. You need a separate method `callLLMText()` (or add a param)
     that does NOT set `response_format` (or sets it to `{ type: 'text' }`) since we
     want raw markdown, not JSON.
   - Return the raw text content (strip any accidental code fences).

4. Implement `generateLore()` in `MockProvider` (after `refinePlan`, ~line 302):
   - Return a simple but non-TODO markdown string using the item's fields.
   - This keeps tests working without a real LLM.

**Step 1b: Create a LoreGenerator service**

New file: `server/src/services/LoreGenerator.ts`

This service orchestrates lore generation for all items in a plan. It should:
- Accept a `ContentPlan` and `LLMProvider`
- For each item with a `lore_path` or `narrative_path` field:
  - Call `provider.generateLore(item, context)`
  - Resolve the file path relative to `docs/lore/` (use the same path validation as
    `generateLoreStubs` in `StoryBuilderOrchestrator.ts:93-97` — must be within loreRoot)
  - Check if the file already exists (skip if it does — don't overwrite user edits)
  - Write the markdown using `atomicWriteYaml()` from `StoryBuilderFileWriter.ts`
    (despite the name, it's a general atomic file writer)
  - Track created files for return/rollback
- Return `{ createdFiles: string[], errors: string[] }`
- Use `gatherContext()` logic — either export it from `ContentPlanService` or duplicate
  the context-gathering query (follow the existing `queryOLTP` pattern)

**Step 1c: Call lore generation during plan creation and refinement**

File: `server/src/services/ContentPlanService.ts`

1. In `parseDescription()` (after line 29, after `injectAssetNeeds`):
   - Call `LoreGenerator.generateForPlan(validated, this.provider)`
   - Add the created lore files to the return value (extend the return type or
     attach as a property on the plan object — check how the frontend consumes it)
   - Wrap in try/catch — lore generation failure should NOT block plan creation
     (log a warning, return plan without lore files)

2. In `refinePlan()` (after line 59, after `injectAssetNeeds`):
   - Call `LoreGenerator.generateForPlan(validated, this.provider)` for any NEW items
     (items not in the previous plan version). For existing items, skip — the user
     may have edited the lore.
   - Wrap in try/catch — non-fatal

**Step 1d: Add an endpoint to regenerate lore for a single item**

File: `server/src/routes/admin-story-builder.ts`

Add a new route (after the refine endpoint, ~line 236):
```
POST /admin/story-builder/plans/:id/items/:itemId/lore
```
- Load the plan from DB
- Find the item by `itemId`
- Call `provider.generateLore(item, context)` via `ContentPlanService`
- Write the markdown to the item's `lore_path` (overwrite — this is explicit regeneration)
- Return `{ success: true, data: { lorePath, content } }`
- This lets the user click a "Regenerate Lore" button in the Review step if they
  don't like the AI's first draft

**Step 1e: Surface lore generation results in the frontend**

File: `admin/src/app/story-builder/hooks/useStoryPlanApi.ts`

- After `handleGeneratePlan` succeeds, the response may include `loreFiles` —
  surface this so the user knows lore was generated.
- The `LoreViewer` in `ContentCard.tsx` already fetches lore via `/admin/lore/file`,
  so once the files exist during review, the "Lore" button will work automatically.

File: `admin/src/app/story-builder/components/ContentCard.tsx`

- Add a "Regenerate Lore" button next to the existing "Lore" button (line ~206-213)
  that calls the new `POST /plans/:id/items/:itemId/lore` endpoint, then refreshes
  the LoreViewer content.
- Add the API call to `useStoryBuilderApi.ts`:
  ```typescript
  export async function regenerateLore(planId: string, itemId: string) {
    return postJSON(`/admin/story-builder/plans/${planId}/items/${itemId}/lore`, {});
  }
  ```

**Step 1f: Update the TODO stub generator as fallback**

File: `server/src/services/StoryBuilderOrchestrator.ts`

- The `generateLoreStubs()` function (lines 79-144) and `buildLoreStub()` (lines 119-144)
  are now replaced by AI generation during plan creation.
- In `stagePlan()` (line 322), keep calling `generateLoreStubs()` as a **fallback** —
  if lore files still don't exist (e.g., plan was created before this feature, or
  lore generation failed), write a minimal stub. But update `buildLoreStub()` to
  produce a better placeholder than "TODO: Write background lore" — at minimum,
  include the item description and a note that the user should regenerate.
- Do NOT delete `generateLoreStubs` — it's a safety net.

---

### Gap 2: Explicit "Approve Plan" Step

**Problem:** The "Approve & Stage →" button in `StoryBuilder.tsx:98-106` jumps
directly from step 2 (Review) to step 3 (Stage) without recording an `approved`
status in the database. The `approved` status exists in the enum and is accepted
by `PUT /plans/:id` (line 167) and `migrateStagedPlan()` (line 350), but the
frontend never sets it. There's no recorded approval moment before YAML conversion.

**Goal:** When the user clicks "Approve Plan", persist `status: 'approved'` in
the DB first, then advance to the staging step. This creates a clear audit trail:
`proposed → approved → staged → migrated`.

#### Implementation steps

**Step 2a: Add an approve API call**

File: `admin/src/app/story-builder/hooks/useStoryBuilderApi.ts`

Add:
```typescript
export async function approvePlan(planId: string, plan: ContentPlan) {
  return adminFetch<{ success: boolean; data?: { planId: string; status: string } }>(
    `/admin/story-builder/plans/${planId}`,
    { method: 'PUT', body: JSON.stringify({ plan, status: 'approved' }) },
  );
}
```

**Step 2b: Wire approve into the wizard**

File: `admin/src/app/story-builder/hooks/useStoryPlanApi.ts`

Add a `handleApprove` callback (similar to `handleStage`):
- Calls `api.approvePlan(planId, plan)`
- On success, advances to step 3
- On failure, sets error

File: `admin/src/app/story-builder/hooks/useStoryBuilder.ts`

- Expose `handleApprove` from the hook (add to the returned object, ~line 78-99)
- The `goToStage` callback (line 98) should call `handleApprove` instead of just
  `setStep(3)`

**Step 2c: Update the button label**

File: `admin/src/app/story-builder/StoryBuilder.tsx`

- Line 101: Change button text from "Approve & Stage →" to "Approve Plan →"
  (staging is now a separate explicit action in step 3)
- The button calls `goToStage` which now triggers `handleApprove`

**Step 2d: Backend guard (optional but recommended)**

File: `server/src/routes/admin-story-builder.ts`

In the `POST /plans/:id/stage` handler (~line 275), add a check:
- If `status !== 'approved'` and `status !== 'proposed'`, return 400 with
  "Plan must be approved before staging"
- This enforces the workflow without breaking existing plans in `proposed` status
  (backward compatible)

---

### Gap 3: Plan List Page (`/story-builder/plans`)

**Problem:** The page at `admin/src/app/story-builder/plans/page.tsx` is a 3-line
stub (`<h1>Story Builder Plans</h1>`). The backend `GET /plans` endpoint returns
paginated plans with `id`, `description`, `status`, `item_count`, timestamps — but
there's no UI to browse, resume, or delete saved drafts. Users can only resume a
plan via the `?planId=...` URL parameter.

**Goal:** A functional plan list page that shows all saved plans with their status,
item count, and timestamps. Each row has actions: Resume (opens wizard with
`?planId=...`), Delete, and View Version History.

#### Implementation steps

**Step 3a: Add plan list API calls**

File: `admin/src/app/story-builder/hooks/useStoryBuilderApi.ts`

Add:
```typescript
export async function listPlans(limit = 50, offset = 0) {
  return adminFetch<{ success: boolean; data?: { plans: any[]; total: number } }>(
    `/admin/story-builder/plans?limit=${limit}&offset=${offset}`,
  );
}

export async function deletePlan(planId: string) {
  return adminFetch<{ success: boolean }>(
    `/admin/story-builder/plans/${planId}`,
    { method: 'DELETE' },
  );
}

export async function getPlanVersions(planId: string) {
  return adminFetch<{ success: boolean; data?: any }>(
    `/admin/story-builder/plans/${planId}/versions`,
  );
}
```

**Step 3b: Build the plan list page**

File: `admin/src/app/story-builder/plans/page.tsx`

Replace the stub with a full page that:
- Uses `'use client'` directive
- Fetches plans via `listPlans()` on mount (with loading/error states)
- Renders a table with columns: Description, Status (color-coded badge), Items,
  Created, Updated, Actions
- Status badge colors: `draft`/`proposed` = pending (yellow), `approved` = info
  (blue), `staged` = success (green), `migrated` = success (green), `failed` =
  danger (red)
- Actions per row:
  - **Resume** — `<Link href="/story-builder?planId={id}">` (opens the wizard
    with the plan loaded)
  - **Delete** — calls `deletePlan(id)`, confirms with `window.confirm`, refreshes
    list on success
  - **Versions** — calls `getPlanVersions(id)`, shows a modal/tree with the
    version history (the endpoint returns a nested tree via recursive CTE)
- Pagination controls (Previous/Next) using `limit` and `offset`
- A "New Plan" button linking to `/story-builder`
- Follow existing CSS patterns: import from `@las-flores/ui`, use `cn()` utility,
  use CSS modules (create `plans.module.css` alongside the page)

**Step 3c: Add a link to the plan list in the wizard**

File: `admin/src/app/story-builder/StoryBuilder.tsx`

- Add a "My Plans" link near the heading (line 31) that links to
  `/story-builder/plans`

**Step 3d: Add the plan list to admin nav (optional)**

File: `admin/src/components/AdminNav.tsx`

- The "Story Builder" link (line 23) already exists. Optionally add a sub-link
  or keep it as-is — the plan list is reachable from the wizard.

---

## 3. Patterns to Follow (from AGENTS.md and codebase)

- **Database:** Use `queryOLTP(...)` from `server/src/database/connection.js`.
  Do NOT introduce new pools. Use `withOLTPTransaction` if you need transactions.
- **Cache:** Use `getCache` / `setCache` / `deleteCache` from
  `server/src/database/redis.js`. Do NOT introduce alternate cache layers.
- **Shared schemas:** All Zod schemas live in `shared/src/schemas/` and are
  exported from `shared/src/index.ts`. The admin frontend and server both import
  from `@las-flores/shared`.
- **Admin API calls:** Use `adminFetch` from `admin/src/lib/client-api.ts`
  (client-side) or `admin/src/lib/api.ts` (server-side). Both hit
  `process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'` with
  `credentials: 'include'` for the JWT cookie.
- **Endpoint pattern:** All admin endpoints use `authAndAdminMiddleware` from
  `server/src/middleware/adminAuth.js`. Response shape:
  `{ success: boolean, data?: ..., error?: string, timestamp: string }`.
- **File writes:** Use `atomicWriteYaml()` from `StoryBuilderFileWriter.ts` for
  all file writes (atomic temp-file + rename). Use `rollbackFiles()` with
  `fileSnapshots` Map for rollback on failure.
- **Path safety:** When writing lore files, validate the resolved path is within
  the lore root (see `StoryBuilderOrchestrator.ts:93-97` and
  `resolveLoreAbsolutePath()` in `admin-lore.ts`).
- **LLM provider factory:** `createLLMProvider()` in `LLMService.ts` returns
  Mock or LiteLLM based on `process.env.LLM_PROVIDER`. Default is `'mock'`.
- **CSS:** Import tokens from `@las-flores/ui`. Use CSS modules (`.module.css`).
  Use `cn()` from `@las-flores/ui` for conditional classes. See
  `docs/UI_STYLE_SYSTEM.md` for the full contract.
- **Error handling:** LLM/lore generation failures must be non-fatal — wrap in
  try/catch, log a warning, return the plan without lore. Staging/migration
  failures should roll back file writes.

---

## 4. File Manifest (all files to create or modify)

### New files
| File | Purpose |
|------|---------|
| `server/src/services/LoreGenerator.ts` | Orchestrates AI lore generation for plan items, writes `.md` files to `docs/lore/` |
| `admin/src/app/story-builder/plans/plans.module.css` | Styles for the plan list page |

### Modified files — Server
| File | Changes |
|------|---------|
| `server/src/services/LLMService.ts` | Add `generateLore()` to interface + both providers; add `buildLorePrompt()`; add `callLLMText()` for non-JSON responses |
| `server/src/services/ContentPlanService.ts` | Call `LoreGenerator` in `parseDescription()` and `refinePlan()`; export `gatherContext()` or share it |
| `server/src/services/StoryBuilderOrchestrator.ts` | Update `buildLoreStub()` to better placeholder; keep `generateLoreStubs()` as fallback |
| `server/src/routes/admin-story-builder.ts` | Add `POST /plans/:id/items/:itemId/lore` endpoint; add approve guard in stage handler |

### Modified files — Admin frontend
| File | Changes |
|------|---------|
| `admin/src/app/story-builder/plans/page.tsx` | Replace stub with full plan list UI |
| `admin/src/app/story-builder/hooks/useStoryBuilderApi.ts` | Add `listPlans()`, `deletePlan()`, `getPlanVersions()`, `approvePlan()`, `regenerateLore()` |
| `admin/src/app/story-builder/hooks/useStoryPlanApi.ts` | Add `handleApprove` callback |
| `admin/src/app/story-builder/hooks/useStoryBuilder.ts` | Expose `handleApprove`; wire `goToStage` to call approve first |
| `admin/src/app/story-builder/StoryBuilder.tsx` | Change button label to "Approve Plan →"; add "My Plans" link |
| `admin/src/app/story-builder/components/ContentCard.tsx` | Add "Regenerate Lore" button |

### Modified files — Shared (only if schema changes needed)
| File | Changes |
|------|---------|
| `shared/src/schemas/story-builder.ts` | Only if you need to add `loreFiles` or similar to the plan response type — try to avoid schema changes and return lore info in the API response wrapper instead |

---

## 5. Verification Checklist

After implementing all gaps, run these checks:

### Server
```bash
npm run lint --workspace=server
npm run build --workspace=server
npm run test --workspace=server -- storyBuilder
npm run test --workspace=server -- story-builder
```

Key test files to check/update:
- `server/tests/integration/story-builder-plans.test.ts` — add test for approve status transition
- `server/tests/integration/story-builder-stage-migrate.test.ts` — update if stage guard added
- `server/tests/integration/adminStoryBuilder.test.ts` — add test for lore regeneration endpoint
- `server/tests/unit/storyBuilderOrchestrator.test.ts` — update lore stub expectations

### Admin frontend
```bash
npm run lint --workspace=admin
npm run build --workspace=admin
npm run test --workspace=admin -- story-builder
```

Key test files to check/update:
- `admin/src/app/story-builder/__tests__/ContentCard.test.tsx` — add test for Regenerate Lore button
- `admin/src/app/story-builder/__tests__/PlanSummary.test.tsx` — verify still passing
- Add a new test for the plan list page (`plans/__tests__/plansPage.test.tsx`)

### Docker (if testing end-to-end)
```bash
docker compose build server && docker compose up -d server
docker exec las-flores-server wget -qO- http://localhost:3000/health
# Should return {"success":true,...}
```

### Manual smoke test (with Mock provider — `LLM_PROVIDER=mock`)
1. Go to `/story-builder` → describe something → plan generated
2. Verify lore files appear in `docs/lore/` (check the item's `lore_path`)
3. Click "Lore" button in a content card → verify markdown content is NOT a TODO stub
4. Click "Approve Plan →" → verify DB status is `approved` (check via `GET /plans/:id`)
5. Stage → migrate → verify status is `migrated`
6. Go to `/story-builder/plans` → verify the plan appears in the list with correct status
7. Click "Resume" → verify the wizard loads with the plan
8. Click "Delete" → verify the plan is removed from the list

---

## 6. Hard Constraints (from AGENTS.md — do NOT violate)

- Use existing DB/cache/event patterns: `oltpPool` / `withOLTPTransaction`,
  `getCache` / `setCache` / `deleteCache`, `queryOLAP(...)`. No new pools.
- After server code changes: `docker compose build server && docker compose up -d server`.
  Verify with `docker exec las-flores-server wget -qO- http://localhost:3000/health`
  (NOT curl — the alpine image has no curl, and host-side curl can return exit 56
  due to stale docker-proxy state).
- Test fixtures that create rows must use a dedicated UUID or `gen_random_uuid()`,
  clean up in `afterAll`, and include a collision-avoidance comment.
- If a task spec conflicts with established codebase patterns, follow the
  established pattern and surface the drift before changing behavior.
- Verify alleged missing variables by reading the relevant file end-to-end or
  grepping before scheduling a fix.

---

## 7. Suggested Implementation Order

1. **Gap 1a-1b:** LLM lore generation + `LoreGenerator` service (backend only, testable)
2. **Gap 1c:** Wire into `ContentPlanService` (backend, testable via existing tests)
3. **Gap 1f:** Update `buildLoreStub` fallback (backend)
4. **Gap 1d:** Add lore regeneration endpoint (backend)
5. **Gap 2a-2d:** Approve step (backend guard + frontend wiring)
6. **Gap 1e:** Frontend lore regeneration button (frontend)
7. **Gap 3a-3d:** Plan list page (frontend)
8. Run full verification checklist (§5)

Each step is independently testable. Commit after each gap is closed.
