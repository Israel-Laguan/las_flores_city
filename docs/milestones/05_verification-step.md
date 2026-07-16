# Milestone 05 — Verification step (cross-reference checks)

## Goal

After the migration runs, run a comprehensive cross-reference check on the
newly-migrated rows. Save the report on the `content_plans.verification_report`
JSONB column. Set `status='verified'` if all checks pass, `status='failed'`
if any errors.

This is the "checked/verified" stage the user requested. It catches the
silent drift the current pipeline allows (broken `lore_path` references,
broken asset URLs, missing FKs).

## Status

> **Status: COMPLETE — all server-side checks, route, orchestrator, and admin
> UI are implemented and wired in.**

- `content_plans.verification_report` JSONB column and the `verified` status
  value exist (Milestone 02 done).
- `server/src/services/PlanVerificationService.ts` is **fully implemented**
  (335 lines). It exports `verifyPlanCrossReferences(plan, contentDir)` which
  runs all 7 checks and returns a `VerificationReport`.
- `verifyPlan(planId)` in `server/src/services/StoryBuilderOrchestrator.ts:198`
  is **real**: it loads the plan, requires status `migrated`, and delegates to
  `verifyPlanCrossReferences`. It does NOT persist itself — persistence happens
  in `approveAndSolidifyPlan()` (success and failure branches).
- `approveAndSolidifyPlan()` (`StoryBuilderOrchestrator.ts:160`) runs
  verification after migration and takes either the `verified` or `failed`
  branch based on `report.passed`.
- `GET /plans/:id/verification` (`admin-story-builder-actions.ts:337`) returns
  the saved `verification_report` from the `content_plans` row.
- `POST /plans/:id/verify` (`admin-story-builder-actions.ts:303`) runs
  verification on demand and persists the report.

### Check-name reconciliation (doc vs. implementation)

The original outline listed 7 checks with snake_case names. The shipped
implementation uses kebab-case names and reordered/split two checks. The table
below is the **authoritative** list:

| # | Implemented name | Severity | Covers |
|---|------------------|----------|--------|
| 1 | `lore-path-resolution` | fail | `item.fields.lore_path` file exists on disk |
| 2 | `narrative-path-resolution` | fail | `item.fields.narrative_path` file exists on disk |
| 3 | `asset-path-resolution` | **warn** | referenced files exist under `assets/` (disk check, NOT an HTTP HEAD fetch) |
| 4 | `fk-integrity` | fail | batch FK checks against `dialogue_trees`, `characters`, `mysteries`, `scenes` (this subsumes the originally-planned `checkMysteryReferences`) |
| 5 | `story-beat-references` | fail | `story` item `beats` slugs exist in `story_beats` |
| 6 | `cross-plan-consistency` | fail | `dependsOn` and `links` reference items that exist **within the same plan** |
| 7 | `asset-need-status` | fail on `failed`, else **warn** | `assetNeeds[].status` is not `failed`/`pending` |

> **Doc drift notes (resolved 2026-07-16):**
> - The original `checkAssetUrls` (HTTP HEAD against DB URLs) was replaced by a
>   disk-based `asset-path-resolution` check that is `warn`-level. There is no
>   network reachability check today; revisit if live-URL validation is needed.
> - The original `checkMysteryReferences` was folded into `fk-integrity` (it
>   checks `mysteries` ids for `overlay`/`vault`/`story` items).
> - Check 6 in the original outline (`checkStoryBeatReferences`) is check 5 here;
>   the old check 6/7 were replaced by `cross-plan-consistency` and the existing
>   `asset-need-status`.

## Pre-requisites

- Milestone 02 (`verification_report` column exists, `verified` is a valid
  `content_plans.status` value).

## Files changed

### Service — **DONE**

- `server/src/services/PlanVerificationService.ts` — implements
  `verifyPlanCrossReferences(plan, contentDir): Promise<VerificationReport>`
  with the 7 checks in the table above. `VerificationReport` / `CheckResult`
  types live in `shared/src/schemas/verification.ts`.

### Route — **DONE**

- `server/src/routes/admin-story-builder-actions.ts`:
  - `POST /plans/:id/verify` runs verification on demand and persists the
    report.
  - `GET /plans/:id/verification` returns the saved `verification_report`.

### Orchestrator method — **DONE**

- `server/src/services/StoryBuilderOrchestrator.ts` — `verifyPlan(planId)`
  loads the plan, asserts `status='migrated'`, and delegates to
  `verifyPlanCrossReferences`. `approveAndSolidifyPlan()` calls it after
  `migrateStagedPlan()` and persists the report on both branches.

### Admin UI — **DONE**

- `admin/src/app/story-builder/components/VerificationReport.tsx` — new
  component. Renders a banner (passed/failed), pass/warn/fail counts, the
  error/warning lists, and a collapsible list of checks each with a
  pass/fail/warn icon. Wired into the "Results" step of the wizard
  (`ResultsStep.tsx`) replacing the raw `JsonViewer`.

## Implementation outline (as shipped)

### Entry point

```ts
// server/src/services/PlanVerificationService.ts
export async function verifyPlanCrossReferences(
  plan: ContentPlan,
  contentDir: string,
): Promise<VerificationReport> {
  const checks: CheckResult[] = [];

  checks.push(await checkLorePaths(plan.items, contentDir));
  checks.push(await checkNarrativePaths(plan.items, contentDir));
  checks.push(await checkAssetPaths(plan.items, contentDir)); // warn-level
  checks.push(await checkForeignKeyIntegrity(plan.items));      // batch DB FKs, incl. mysteries
  checks.push(await checkStoryBeatReferences(plan.items));
  checks.push(checkCrossPlanConsistency(plan));                // dependsOn / links
  checks.push(checkAssetNeedStatus(plan.items));               // fail on 'failed'

  const errors = checks.filter(c => c.status === 'fail').flatMap(c => c.details ?? [`${c.name}: failed`]);
  const warnings = checks.filter(c => c.status === 'warn').flatMap(c => c.details ?? [`${c.name}: warning`]);

  return { planId: plan.id, checkedAt: new Date().toISOString(), passed: errors.length === 0, checks, errors, warnings };
}
```

### Persisting the report

`verifyPlan()` itself does NOT write. Persistence is in
`approveAndSolidifyPlan()` (and `POST /verify` route):

```ts
// server/src/services/StoryBuilderOrchestrator.ts (inside approveAndSolidifyPlan)
await queryOLTP(
  'UPDATE content_plans SET verification_report = $1, updated_at = NOW() WHERE id = $2',
  [JSON.stringify(verificationReport), planId]
);
```

## Tests

- `server/tests/unit/planVerificationService.test.ts` — unit tests per check.
- `server/tests/integration/verify-plan.test.ts` — end-to-end: migrate a plan
  with a broken `lore_path`, then assert `passed: false` and a `fail` check.
- `admin/src/app/story-builder/__tests__/VerificationReport.test.tsx` — renders
  a sample report and asserts the banner, counts, error list, and check names.

## Validation gate

1. A plan with a broken `lore_path` produces a verification report with
   `passed: false` and a `fail` check for `lore-path-resolution`. ✅
2. A plan with all references intact produces `passed: true` and all
   `pass` checks. ✅
3. The verification report is persisted on the `content_plans` row and
   visible in the wizard "Results" step via `VerificationReport`. (The
   dedicated `/story-builder/plans/<id>` detail page is not a separate route —
   the plans list links to the wizard via `?planId=`; the `GET
   /plans/:id/verification` API exposes the saved report for any future
   detail view.) ✅ (wizard) / ⚠ (standalone detail page N/A).
4. The verification runs in under 30 seconds for a typical plan. ✅ (batch
   `ANY($1::uuid[])` FK queries).
5. `npm run lint --workspace=server` → 0 errors.
6. `npm run test --workspace=server` → all green.
7. `npm run build --workspace=server` → passes.
8. `npm run lint --workspace=admin` and `npm run build --workspace=admin` → pass.

## Rollback plan

The service, route, and component are additive. The `verification_report`
column is nullable, so existing plans are unaffected. To revert to
"migration = terminal", remove the `verifyPlan()` call from
`approveAndSolidifyPlan()` (Milestone 04).
