# Milestone 02 — State machine refactor

> **Status: IMPLEMENTED.** Migrations 049 + 050 applied. Zod schema updated.
> `VALID_TRANSITIONS` guard in `AssetNeedsService.ts` matches this spec exactly.

## Goal

Extend the `ContentPlan.status` and `AssetNeed.status` enums to model the full
lifecycle from idea intake to verified delivery. The current 6-state enum
(`draft | proposed | approved | staged | migrated | failed`) is a starting
point, not the destination.

After this milestone:

- `ContentPlan.status` has 7 values:
  - `draft` — LLM produced a plan, not yet reviewed by the user.
  - `proposed` — user has reviewed the plan (and optionally refined it),
    not yet approved.
  - `approved` — user clicked Approve; locked from further refinement.
  - `staged` — YAML + lore + prompt files written to disk and validated.
  - `migrated` — DB rows upserted.
  - `verified` — cross-reference checks all pass.
  - `failed` — terminal failure at any step; the user must restart.

- `AssetNeed.status` has 6 values (in-memory, inside `plan_json` JSONB —
  not a DB column with its own CHECK constraint):
  - `pending` — no local draft yet.
  - `drafted` — local PNG exists in `content/.../assets/<slug>__v<n>.png`
    (flat, no sub-folder), not in MinIO.
  - `chosen` — user selected this draft as the canonical one.
  - `published` — chosen draft uploaded to MinIO at the local filename (no suffix); a `label: 'dev'` entry is appended to `portrait_urls`.
  - `assigned` — published URL is wired into the YAML's `asset_paths.<field>`.
  - `failed` — generation or upload failed; user can retry.

## Pre-requisites

- Milestone 01 (per-folder layout is in place; the per-asset paths are now
  deterministic).

## Files to change

### Schema

- `shared/src/schemas/story-builder.ts` — extend the `status` enum in
  `ContentPlanSchema` and the `status` enum in `AssetNeedSchema`.
- `server/src/database/migrations/047_content_plans.sql` — the CHECK
  constraint on `status` is too narrow. We need a new migration to
  drop and re-add it with the new values.

```sql
-- server/src/database/migrations/049_content_plans_verified.sql
ALTER TABLE content_plans DROP CONSTRAINT IF EXISTS content_plans_status_check;
ALTER TABLE content_plans ADD CONSTRAINT content_plans_status_check
  CHECK (status IN ('draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed'));
```

### New columns on `content_plans`

- `verification_report JSONB DEFAULT NULL` — stores the result of
  `PlanVerificationService.verifyPlan(planId)`. Set when `status='verified'`
  or `status='failed'` after the verification step.

```sql
-- 050_content_plans_verification.sql
ALTER TABLE content_plans ADD COLUMN IF NOT EXISTS verification_report JSONB DEFAULT NULL;
```

### Code references to update

| File | Change |
|---|---|
| `shared/src/schemas/story-builder.ts` | Update the two enums. |
| `server/src/routes/admin-story-builder-plans.ts` | Update the `validStatuses` array on line 129. |
| `server/src/routes/admin-story-builder-actions.ts` | Update the `staged` / `migrated` status transitions. Add a new `/plans/:id/verify` route. |
| `server/src/services/ContentPlanService.ts` | Add a `setStatus(planId, status)` helper that uses the new CHECK constraint values. |
| `server/src/services/StoryBuilderOrchestrator.ts` | Add a `verifyPlan(planId)` function. Update `migrateStagedPlan()` to set `status='migrated'` (not 'verified' yet) and call `verifyPlan()` next. |
| `server/src/services/AssetNeedsService.ts` | Add status transition methods: `markDrafted()`, `markChosen()`, `markPublished()`, `markAssigned()`. Each method validates the prior state. |
| `admin/src/app/story-builder/hooks/useStoryBuilderApi.ts` | Add a `verifyPlan(planId)` API call. |

### Dashboard UI

- `admin/src/app/story-builder/plans/page.tsx` — add a `verified` status color
  in the `STATUS_COLORS` map (currently has `proposed` as the fallback).

## Implementation outline

### Step 1: Update the shared schema

```ts
// shared/src/schemas/story-builder.ts
export const AssetNeedSchema = z.object({
  promptType: z.string(),
  targetField: z.string(),
  status: z.enum(['pending', 'drafted', 'chosen', 'published', 'assigned', 'failed']).default('pending'),
});

export const ContentPlanSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  items: z.array(ContentPlanItemSchema),
  links: z.array(ContentLinkSchema).default([]),
  status: z.enum(['draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed']).default('draft'),
});
```

### Step 2: Write the migration

```sql
-- server/src/database/migrations/049_content_plans_verified.sql
DROP TRIGGER IF EXISTS trigger_content_plans_updated_at ON content_plans;
ALTER TABLE content_plans DROP CONSTRAINT IF EXISTS content_plans_status_check;
ALTER TABLE content_plans ADD CONSTRAINT content_plans_status_check
  CHECK (status IN ('draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed'));
-- Re-add the trigger if it existed
-- (check existing migrations to see if there's an updated_at trigger)
```

And the new column:

```sql
-- 050_content_plans_verification.sql
ALTER TABLE content_plans ADD COLUMN IF NOT EXISTS verification_report JSONB DEFAULT NULL;
```

### Step 3: Add the state-transition guards

In `AssetNeedsService`, add explicit guards:

```ts
const VALID_TRANSITIONS: Record<AssetNeedStatus, AssetNeedStatus[]> = {
  // pending: can either be marked drafted (after local generation) or chosen
  // directly (when the user keeps the pre-existing default <slug>__default.png
  // without generating new variants — the "first found" semantic the user asked for).
  pending:  ['drafted', 'chosen', 'failed'],
  // drafted: user picks one of the new drafts OR falls back to the default.
  drafted:  ['chosen', 'failed', 'pending'],  // pending = discarded, re-generate
  // chosen: can be replaced (back to drafted) or finalized (published).
  chosen:   ['published', 'failed', 'drafted'], // drafted = user changed their mind
  published: ['assigned', 'failed'],
  assigned: ['failed'], // assigned is the terminal state for a single asset
  failed:   ['pending'], // retry
};

export function transitionAssetNeed(need: AssetNeed, next: AssetNeedStatus): void {
  if (!VALID_TRANSITIONS[need.status].includes(next)) {
    throw new Error(`Invalid asset need transition: ${need.status} → ${next}`);
  }
  need.status = next;
}
```

Same pattern for `ContentPlan.status`:

```ts
const VALID_PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  draft:     ['proposed', 'failed'],
  proposed:  ['approved', 'draft', 'failed'],  // draft = refine loop
  approved:  ['staged', 'failed'],
  staged:    ['migrated', 'failed'],
  migrated:  ['verified', 'failed'],
  verified:  ['failed'],  // re-verify on demand
  failed:    ['draft'],  // restart
};
```

## Tests to add or update

- `server/tests/unit/story-builder-state-machine.test.ts` — new file.
  Tests the `VALID_TRANSITIONS` tables and the guard functions.
- `server/tests/integration/story-builder-plans.test.ts` — add a test
  that rejects an invalid transition (e.g. `draft → migrated`).
- `server/tests/integration/story-builder-stage-migrate.test.ts` —
  update the test for `rejects staging a draft plan` to also reject
  `rejects migrating a non-staged plan` and `rejects verifying a non-migrated plan`.

## Validation gate

1. The new migration applies cleanly on a fresh DB.
2. The new migration applies cleanly on a DB that has the old CHECK constraint.
3. `npm run validate:content` passes.
4. `npm run lint --workspace=server` → 0 errors.
5. `npm run test --workspace=server` → all green, including the new state-machine tests.
6. `npm run build --workspace=server` → passes.
7. The dashboard `/story-builder/plans` page renders the `verified` status badge
   with the new color.

## Rollback plan

The new migration is additive (new CHECK values, new nullable column).
Down-migration: drop the `verification_report` column, re-add the old CHECK
constraint with the original 6 values, revert the Zod schema. Each step is a
separate commit. The `failed` status is new but only reachable from
non-terminal states, so existing plans in `migrated` are unaffected.
