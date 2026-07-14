# Story Builder — Gaps Implementation Complete (Cleanup/Verify Prompt)

> Purpose: This file is a self-contained instruction prompt for an AI coding agent.
> Use it in a new chat to verify, cleanup, and finalize the Story Builder gaps work.
> Do NOT re-implement already-completed gaps unless instructed.

---

## 1. What Was Already Implemented

All gaps from the original STORY_BUILDER_GAPS_PROMPT.md have been implemented on
branch feat/story-builder-gaps, with one final fix applied to ContentPlanService.refinePlan().

### Backend (Server)

| Component | File | Status |
|-----------|------|--------|
| LLMProvider interface with generateLore() | server/src/services/types/LLMTypes.ts | Done |
| buildLorePrompt() function | server/src/services/LLMPrompts.ts | Done |
| callLLMText() private method | server/src/services/LiteLLMProvider.ts | Done |
| LiteLLMProvider.generateLore() | server/src/services/LiteLLMProvider.ts | Done |
| MockProvider.generateLore() | server/src/services/MockProvider.ts | Done |
| LoreGenerator service | server/src/services/LoreGenerator.ts | Done |
| Lore in parseDescription() | server/src/services/ContentPlanService.ts | Done |
| Lore in refinePlan() for new items | server/src/services/ContentPlanService.ts | Done (fixed) |
| Improved buildLoreStub() fallback | server/src/services/StoryBuilderOrchestrator.ts | Done |
| Lore regeneration endpoint | server/src/routes/admin-story-builder-lore.ts | Done |
| Approve endpoint (PUT /plans/:id) | server/src/routes/admin-story-builder-plans.ts | Done |
| Stage status guard | server/src/routes/admin-story-builder-actions.ts | Done (proposed or approved) |

### Frontend (Admin)

| Component | File | Status |
|-----------|------|--------|
| approvePlan() API | admin/src/app/story-builder/hooks/useStoryBuilderApi.ts | Done |
| regenerateLore() API | admin/src/app/story-builder/hooks/useStoryBuilderApi.ts | Done |
| listPlans(), deletePlan(), getPlanVersions() | admin/src/app/story-builder/hooks/useStoryBuilderApi.ts | Done |
| handleApprove callback | admin/src/app/story-builder/hooks/useStoryPlanApi.ts | Done |
| handleRegenerateLore callback | admin/src/app/story-builder/hooks/useStoryPlanApi.ts | Done |
| Updated useStoryBuilder hook | admin/src/app/story-builder/hooks/useStoryBuilder.ts | Done |
| Approve button + My Plans link | admin/src/app/story-builder/StoryBuilder.tsx | Done |
| Regenerate Lore button | admin/src/app/story-builder/components/ContentCard.tsx | Done |
| Plan list page | admin/src/app/story-builder/plans/page.tsx | Done |
| Plans list CSS | admin/src/app/story-builder/plans/plans.module.css | Done |

### Note on Architecture Drift
The original spec expected modifications to `server/src/services/LLMService.ts` directly, but the
implementation refactored LLM providers into a cleaner architecture:
- `LLMService.ts` - Factory function and re-exports
- `types/LLMTypes.ts` - Interface definitions
- `LLMPrompts.ts` - Prompt building functions
- `LiteLLMProvider.ts` - LiteLLM implementation
- `MockProvider.ts` - Mock implementation

Routes were also split for better organization:
- `admin-story-builder.ts` - Main router that mounts sub-routers
- `admin-story-builder-plans.ts` - Plan CRUD operations
- `admin-story-builder-actions.ts` - Action endpoints (plan, refine, preview, stage, migrate, retry)
- `admin-story-builder-lore.ts` - Lore regeneration
- `admin-story-builder-meta.ts` - Templates, execute, version history

### Tests

| Test File | Status |
|-----------|--------|
| server/tests/integration/story-builder-plans.test.ts | Approve test added |
| server/tests/integration/story-builder-stage-migrate.test.ts | Draft rejection test added |
| server/tests/integration/adminStoryBuilder.test.ts | Lore regeneration tests added |
| admin/src/app/story-builder/__tests__/ContentCard.test.tsx | Regenerate button tests added |
| admin/src/app/story-builder/plans/__tests__/plansPage.test.tsx | New test file added |

---

## 2. Your Mission (Cleanup + Verify)

You are in plan mode until explicitly switched to act mode.

### Step 1: Verify current state

Run these commands:
- git branch --show-current (should be feat/story-builder-gaps)
- git log --oneline -10
- git status --short

### Step 2: Run the verification checklist

Run these and note any failures:
- npm run lint --workspace=server
- npm run build --workspace=server
- npm run test --workspace=server -- story-builder
- npm run test --workspace=admin -- story-builder
- npm run build --workspace=admin

### Step 3: Decision tree

A) If all checks pass: The gaps are closed. The final fix (refinePlan lore generation
   for new items) was applied to ContentPlanService.ts. Prepare a summary for PR creation.
   Optionally squash commits.

B) If server/TypeScript build fails:
- Read the error carefully.
- Verify all imports from LoreGenerator.ts are correct.
- Check generateLore method signature matches the interface.
- Do NOT change the LLMProvider interface shape.
- Rebuild and verify before proceeding.

C) If tests fail:
- Run specific failing test to see details.
- Check if mocks need updating (mock provider must have generateLore).
- Run admin tests separately.
- Do NOT "fix" by deleting tests.

D) If lint warnings appear:
- Line length warnings: informational, do NOT break build.
- Unused vars: prefix with _ (e.g., _label).
- No any types should be added.

### Step 4: Optional cleanup (only if explicitly asked)

1. Squash commits into logical groups (7 commits matching the 7 gaps + 1 fix commit).
2. Update STORY_BUILDER_GAPS_PROMPT.md to mark document as complete.
3. Update ADMIN_ARCHITECTURE.md if new endpoints/pages were added.
4. This cleanup prompt (STORY_BUILDER_GAPS_CLEANUP_PROMPT.md) has been updated to
   reflect actual implementation status and architecture drift.

### Step 5: Do NOT touch

- Do NOT modify STORY_BUILDER_GAPS_PROMPT.md unless explicitly asked.
- Do NOT run docker compose commands unless explicitly asked.
- Do NOT merge the branch unless explicitly asked.
- Do NOT modify files outside the story-builder scope unless a bug is found.

---

## 3. Known Patterns to Follow

- All lore generation is non-fatal: wrapped in .catch() with warning log.
- Mock provider lore output uses switch(item.type) with template literals.
- Path safety: path.resolve() + startsWith(loreRoot + path.sep).
- API response wrapper: { success, data, timestamp }.
- Frontend hooks: useStoryBuilder is main hook, uses useStoryPlanApi for callbacks.
- CSS modules for all story-builder components.
- Vitest (not Jest) for admin tests.

---

## 4. If Switch to Act Mode

Before making ANY changes:
1. Read this entire document.
2. Verify the current git state.
3. Run the verification checklist.
4. State what you intend to fix.
5. Wait for explicit approval if touching anything beyond "fix build errors".
