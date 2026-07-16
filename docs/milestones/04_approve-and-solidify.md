# Milestone 04 — Single-click Approve & Solidify

## Goal

Collapse the current 5-step wizard (Describe → Review → Stage → Migrate →
Results) into a 2-step flow for the happy path (Describe → Approve). The
intermediate stages (`staged`, `migrated`, `verified`) become audit trail,
not user-facing buttons.

When the user clicks **Approve**:

1. The plan transitions to `status='approved'` (locked from refinement).
2. The orchestrator writes the YAML + lore `.md` + prompt `.md` to disk
   (`status='staged'`).
3. The orchestrator uploads the chosen draft for each `AssetNeed` to
   MinIO at `las-flores/<assetType>/<filename>` (the local filename is
   preserved as the object key — no `.dev` suffix) and appends a
   `portrait_urls` entry tagged `label: 'dev'`. The YAML's `asset_paths.<field>`
   keeps the local filename (`AssetNeed.status='published'`).
4. The orchestrator runs the migration (`status='migrated'`).
5. The orchestrator runs the cross-reference verification
   (`status='verified'` or `status='failed'`).
6. The wizard jumps to a final "Results" page that shows the
   verification report.

The user sees a single click. The audit trail is on the `content_plans`
row.

## Implementation status

> **Status: CODE-COMPLETE for the happy path; verification is a stub (see
> Milestone 05).**

The orchestrator, publish service, and route described below are **already
implemented** on the main branch. The original pseudocode in this document
drifted from the implementation; the deviations that matter:

- `approveAndSolidifyPlan(planId)` lives in
  `server/src/services/StoryBuilderOrchestrator.ts` and chains
  lock → `stagePlan()` → `publishChosenDrafts()` → `migrateStagedPlan()` →
  `verifyPlan()`, flipping `content_plans.status` at each step and recording
  `failed` (with partial state) on any error.
- Entrance condition is **`proposed` OR `approved`** (not `proposed` only as
  the pseudocode implies).
- The chosen-draft URL is written as a `label: 'dev'` entry into the **YAML**
  `portrait_urls` array by `publishChosenDrafts`, then carried into the DB by
  the subsequent migration (`processContentFile` → `upsertCharacter` reads
  `data.portrait_urls`). It is **not** written straight into the DB JSONB by a
  `setItemAssetUrl` helper (that function does not exist). So the
  Validation-gate assertions about the DB `portrait_urls` JSONB only hold when
  the full solidify sequence (publish **+ migrate**) runs.
- `AssetNeed` ends at `published` (the actual code calls `markPublished`);
  it does **not** additionally transition to `assigned`.
- `verifyPlan()` is currently a **stub** that returns
  `{ success: true, checks: [] }`, so `status='verified'` is set without any
  real cross-reference checks. Real verification is Milestone 05 (pending).
- The integration test (`server/tests/integration/approve-and-solidify.test.ts`)
  exists but **mocks the orchestrator**; it only asserts route status codes,
  not the 10-step end-to-end flow in "Tests to add or update" below.

## Pre-requisites

- Milestone 01 (per-folder layout).
- Milestone 02 (state machine supports `approved → staged → migrated → verified`).
- Milestone 03 (local drafts exist; the user has chosen one per asset need).

## Files to change

### Orchestrator method — **DONE**

- `server/src/services/StoryBuilderOrchestrator.ts` — `approveAndSolidifyPlan(planId: string): Promise<SolidifyResult>` already exists. It calls `stagePlan()` + `publishChosenDrafts()` +
  `migrateStagedPlan()` + `verifyPlan()` in sequence, transitioning the
  status at each step. (See "Implementation status" for deviations from the
  pseudocode below.)

### Publish service — **DONE** (`AssetPublishService.ts` exists)

- `server/src/services/AssetPublishService.ts` — already implemented. Handles
  "publish the chosen draft" per asset need:
  - For each `AssetNeed` with `status='chosen'`, read the YAML's
    `asset_paths.<field>` field to find the local filename (e.g.
    `<slug>__default.png` (the historical default) or any other file the user picked).
  - Read the bytes from `assets/<filename>` in the per-entity folder.
  - Upload the bytes to MinIO at `las-flores/<assetType>/<filename>` —
    **the local filename is preserved in the MinIO key** (no `.dev`
    suffix; the cascade is recorded as a `label: 'dev'` entry in the
    `portrait_urls` JSONB array, not in the key).
  - Read the public URL from MinIO.
  - Write the URL into the DB `portrait_urls` JSONB array as a
    `label: 'dev'` entry (the canonical / dev-stage URL).
  - Set `AssetNeed.status='published'`.

  See Milestone 06 for the `promoteToStaging` / `promoteToProduction`
  methods that append `label: 'staging'` / `label: 'production'` entries
  to the `portrait_urls` JSONB array.

### Route — **DONE**

- `server/src/routes/admin-story-builder-actions.ts` — `POST /plans/:id/approve-and-solidify` already exists. It calls
  `approveAndSolidifyPlan(planId)` and returns the full `SolidifyResult`
  (`status`, `stage`, `publish`, `migration`, `verificationReport`, `error`).

### Admin UI changes

| File | Change |
|---|---|
| `admin/src/app/story-builder/StoryBuilder.tsx` | Remove the "Stage" and "Migrate" steps from the wizard. Keep "Describe" and "Results". The Approve button now calls `/approve-and-solidify` instead of `/approve` + `/stage` + `/migrate`. |
| `admin/src/app/story-builder/components/StepIndicator.tsx` | Update to show 2 steps (Describe, Results) instead of 5. |
| `admin/src/app/story-builder/hooks/useStoryBuilderApi.ts` | Replace the 3 calls (approve, stage, migrate) with a single `approveAndSolidify(planId)` call. |
| `admin/src/app/story-builder/ResultsStep.tsx` | Update to display the verification report prominently. Show per-item verification status. |

## Implementation outline

### Step 1: The orchestrator

```ts
// server/src/services/StoryBuilderOrchestrator.ts
export async function approveAndSolidifyPlan(planId: string): Promise<SolidifyResult> {
  const plan = await loadPlan(planId);
  if (plan.status !== 'proposed') {
    throw new Error(`Plan must be proposed to approve. Current: ${plan.status}`);
  }

  // 1. Lock the plan
  await setStatus(planId, 'approved');

  // 2. Write files to disk
  const stageResult = await stagePlan(planId);
  if (!stageResult.success) {
    await setStatus(planId, 'failed');
    return { success: false, error: 'Staging failed', stageResult };
  }
  await setStatus(planId, 'staged');

  // 3. Publish chosen drafts to MinIO
  const publishResult = await publishChosenDrafts(planId);
  if (!publishResult.success) {
    await setStatus(planId, 'failed');
    return { success: false, error: 'Publish failed', publishResult };
  }
  // AssetNeed.status='published' for each.

  // 4. Migrate to DB
  const migrationResult = await migrateStagedPlan(planId);
  if (!migrationResult.success) {
    await setStatus(planId, 'failed');
    return { success: false, error: 'Migration failed', migrationResult };
  }
  await setStatus(planId, 'migrated');

  // 5. Verify
  const verificationReport = await verifyPlan(planId);
  if (verificationReport.errors.length > 0) {
    await setStatus(planId, 'failed');
    return { success: false, error: 'Verification failed', verificationReport };
  }
  await setStatus(planId, 'verified');
  await saveVerificationReport(planId, verificationReport);

  return { success: true, status: 'verified', verificationReport };
}
```

### Step 2: The publish service

```ts
// server/src/services/AssetPublishService.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadToMinio } from './StorageService.js';
import { transitionAssetNeed } from './AssetNeedsService.js';
import { loadPlan, setItemAssetPath } from './ContentPlanService.js';

export async function publishChosenDrafts(planId: string): Promise<PublishResult> {
  const plan = await loadPlan(planId);
  const published: Array<{ itemId: string; needId: string; url: string }> = [];
  const errors: string[] = [];

  for (const item of plan.items) {
    const entityRoot = resolveEntityRoot(item);
    for (const need of item.assetNeeds) {
      if (need.status !== 'chosen') continue;
      // The YAML's asset_paths.<promptType> field is the local filename
      // of the chosen draft (e.g. '<slug>__default.png' or '<slug>__<timestamp>.png').
      const localFilename = item.fields.asset_paths?.[need.promptType];
      if (!localFilename) {
        errors.push(`${item.name} / ${need.promptType}: no asset_paths value`);
        continue;
      }
      const localPath = path.join(entityRoot, 'assets', localFilename);
      try {
        const buf = await fs.readFile(localPath);
        const assetType = need.promptType; // 'portrait', 'background', etc.
        // MinIO key preserves the local filename — no .dev/.staging suffix.
        // The cascade lives in the DB columns, not the object key.
        const objectKey = `las-flores/${assetType}/${localFilename}`;
        const url = await uploadToMinio(buf, objectKey, 'image/png');

        // Write the URL into the DB `portrait_urls` JSONB array (label: 'dev').
        // The YAML's asset_paths.<field> keeps the local filename.
        await setItemAssetUrl(item, need.promptType, url);

        transitionAssetNeed(need, 'published');
        transitionAssetNeed(need, 'assigned'); // one-shot transition
        published.push({ itemId: item.id, needId: need.promptType, url });
      } catch (err: any) {
        errors.push(`${item.name} / ${need.promptType}: ${err.message}`);
      }
    }
  }

  return { success: errors.length === 0, published, errors };
}

> **Note — actual `publishChosenDrafts` differs from the snippet above.**
> The real implementation (a) reads the staged YAML via
> `resolveEntityRootDir` + `resolveFilePath` (there is no `resolveEntityRoot`
> helper), (b) uses `uploadToMinio` and `markPublished` from
> `AssetNeedsService` (not `transitionAssetNeed` twice), (c) appends the
> `label: 'dev'` entry to the **YAML** `portrait_urls` array and writes the
> YAML back to disk, then persists the updated `plan_json` (asset-need
> statuses) — there is **no** `setItemAssetUrl` / `setItemAssetPath` DB
> helper, and (d) leaves `AssetNeed` at `published` (it does not additionally
> transition to `assigned`).

### Step 3: The wizard UX

The "Describe" step has the free-text input as today, plus a "Review plan"
button. The "Review" step is **still there** — the user can still see and
edit the plan, refine it, and choose drafts. The new button is at the
bottom of the Review step: **"Approve & Ship"**. It calls the single
endpoint and shows a progress spinner for the duration of the
approve-and-solidify operation (typically 10-30 seconds for a small plan,
up to a few minutes for a plan with many asset needs).

The "Results" step now shows:
- A green checkmark if `status='verified'`.
- The verification report (per-item pass/fail).
- Links to the live content (character page, scene page, etc.).
- A "View in DB" link for debugging.

## Tests to add or update

> **Current state:** `server/tests/integration/approve-and-solidify.test.ts`
> exists but **mocks the orchestrator** (`jest.mock('.../StoryBuilderOrchestrator.js')`)
> and only asserts route status codes (200/422/404/400/500). The real
> end-to-end test described below is **still TODO**.

- `server/tests/integration/approve-and-solidify.test.ts` — new file (currently
  a mocked route-contract test; extend to a real end-to-end test):
  End-to-end test:
  1. Create a plan via `POST /plan`.
  2. Refine it once.
  3. Generate drafts (`POST /generate-drafts`).
  4. Choose one draft.
  5. Call `POST /approve-and-solidify`.
  6. Verify the plan status is `verified`.
  7. Verify the YAML on disk keeps `asset_paths.<field>` as the local filename and `portrait_urls` has a `label:'dev'` entry with the MinIO URL.
  8. Verify the MinIO bucket has the chosen local PNG (with the
     original filename, no `.dev` suffix).
  9. Verify the DB row has the dev URL.
  10. Verify the verification report is saved on the `content_plans` row.
- `admin/src/app/story-builder/__tests__/StoryBuilder.test.tsx` — update
  to match the new 2-step wizard.

## Validation gate

1. A new plan created via the admin UI can be approved in one click.
2. The approve operation:
   - Writes the YAML, lore, and prompt files to disk.
   - Uploads chosen drafts to MinIO at the local filename (no suffix) and tags the `portrait_urls` entry `label:'dev'`.
   - Migrates the DB.
   - Runs verification.
   - Sets `status='verified'` on success.
3. The verification report is visible on the `/story-builder/plans` page.
4. The MinIO bucket has one object per published asset (local filename preserved, no suffix) and `portrait_urls` has a `label:'dev'` entry for each.
5. The DB `characters.portrait_urls` JSONB has a `label:'dev'` entry with the MinIO URL.
6. `npm run lint --workspace=server` → 0 errors.
7. `npm run test --workspace=server` → all green.
8. `npm run build --workspace=server` → passes.
9. `docker compose build server && docker compose up -d server` succeeds.
10. `docker exec las-flores-server wget -qO- http://localhost:3000/health`
    returns `{"success":true}`.

## Rollback plan

The new route is additive. The new orchestrator method is additive. The
wizard UI changes are reversible by reverting the commits that touch
`StoryBuilder.tsx` and `StepIndicator.tsx`. The previous 5-step wizard can
be restored by leaving the old routes (`/approve`, `/stage`, `/migrate`)
intact — they still work, the new endpoint just calls them all in
sequence.

If the new endpoint fails partway through, the orchestrator sets
`status='failed'` and saves the partial state. The user can manually
re-trigger the next step (call `/stage` or `/migrate` directly) once the
underlying issue is fixed.
