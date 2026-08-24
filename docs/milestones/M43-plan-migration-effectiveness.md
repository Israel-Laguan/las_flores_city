# M43 — Plan-to-Migration Effectiveness

> **Status:** Complete · **Owner:** story-engine effort
> **Source record:** the scoped-intake findings from the former M39 exploration
> (that record was retired without a separate archive; M43 is now its owner)

## Goal

Confirm that the current story-builder plan pipeline reliably turns an authored plan into
validated, migrated content, without reviving the retired direct-YAML wizard path.

## Scope

- Exercise the complete flow: template or description → plan → review/refine → solidify → file
  write → `migrateContent` → `PlanVerificationService`.
- Add or finish the smallest useful scoped templates, beginning with mission and location.
- Verify generated IDs, slugs, links, and migrated database rows are server-owned.
- Remove or guard any remaining authoring path that writes entity YAML without migration.
- Test failure, retry, and idempotent re-run behavior so migration effectiveness is measurable.

## Acceptance Criteria

- [x] Mission and location inputs produce plans that solidify into migrated rows with correct links.
- [x] The flow uses `StoryBuilderFileWriter`, `migrateContent`, and `PlanVerificationService`.
- [x] Re-running the same plan is safe and does not create ghost files or duplicate rows.
- [x] Invalid or partially generated plans fail verification without mutating canon.
- [x] No direct `StoryBuilderFileWriter` call site can commit canon without going
      through `migrateContent`: a repository-wide check (e.g. a lint/grep guard or
      code review checklist) covers every writer call site and each one either runs
      inside the migration pipeline or is explicitly guarded.
- [x] Server and admin tests cover the successful and rejected paths.

## Implementation (2026-08-23)

- **Scoped templates** — `server/src/services/PlanTemplateBuilders.ts` restores the
  template capability removed in PR #109 as a minimal library: `buildMissionTemplatePlan`
  (→ `mysteries` row via `mission_<slug>.yaml`) and `buildLocationTemplatePlan`
  (→ `scenes` row with resolved district FK via `location_<slug>.yaml`). Every builder
  output is `ContentPlanSchema`-valid by construction; invalid slugs/params fail at build
  time. Exposed for authoring at `POST /admin/story-builder/plans/from-template`
  (creates a `proposed` plan row for review; execution still flows through the standard
  stage → migrate → verify pipeline). The retired direct-YAML wizard path stays retired.
- **Repository-wide canon guard** — `scripts/check-story-builder-writer-guard.mjs`
  (wired into root `npm run lint`; also `npm run guard:writer`). Every `server/src` import of
  `StoryBuilderFileWriter.js` must be registered explicitly:
  - `pipeline` — `StoryBuilderPlanOps.ts` (canon writers `writePlanItems` / `updateExistingFile`
    / `applyLink`; reaches `migrateContent` in `executePlan` and `migrateStagedPlan` during solidify);
  - `sidecar` — `StoryBuilderLore.ts` (lore `.md` stubs), `PromptFileGenerator.ts` (`.prompt.md`),
    `LocalDraftService.ts` (asset drafts + `asset_paths` selection) — restricted to the
    low-level `atomicWriteYaml` primitive for non-canon artifacts only.
  Unregistered importers, stale registry entries, and sidecar files that use canon writers
  all fail with exit 1. The contract is also documented in the `StoryBuilderFileWriter.ts` header.
- **Tests**
  - Unit: `planTemplateBuilders.test.ts` (schema-valid output, slug rejection),
    `adminPlanFromTemplate.route.test.ts` (route success + 400 paths),
    `storyBuilderWriterGuard.test.ts` (guard passes on repo; unregistered importer fails).
  - Integration: `tests/integration/story-builder-plan-pipeline.test.ts` — mission+location plan
    through `executePlan` (`writePlanItems` → `applyLink` → validate → real `migrateContent`) into
    `mysteries`/`scenes` rows with correct district link; idempotent re-run (identical file set,
    single `migration_log` entry per file, no duplicate rows); XSS-invalid plan fails validation,
    rolls back its files, and leaves pre-existing canon untouched.
  - Admin: `createPlanFromTemplate.test.ts` covers the API helper success and rejected paths.
- **Manual flow runner** — `server/scripts/run_plan_template_flow.ts`
  (`npm run flow:plan-template --workspace=server [-- --cleanup]`) reproduces the evidence below.

## Manual Flow Evidence (2026-08-23)

Run against the dev stack (Podman OLTP Postgres + Redis), full solidify-equivalent stages:
create plan row → `stagePlan` → `migrateStagedPlan` (real `migrateContent`) → `verifyPlan`.

```text
PLAN_ID      : 1d92a20b-8379-4474-91cf-e041d1bdb5c2
MISSION_ID   : 8927541c-fae1-4aa5-8e8c-2c7bbc533b90
LOCATION_ID  : 3533e2f1-f38a-44e1-87eb-f796915026ca
STAGED       : locations/m43_manual_location/location_m43_manual_location.yaml,
               missions/m43_manual_mission/mission_m43_manual_mission.yaml,
               locations/m43_manual_location/m43_manual_location.md,
               missions/m43_manual_mission/m43_manual_mission.md
MIGRATED     : location=3533e2f1-f38a-44e1-87eb-f796915026ca(updated),
               mission=8927541c-fae1-4aa5-8e8c-2c7bbc533b90(updated)
VERIFY       : passed=true checks=8 errors=[]
MYSTERY ROW  : {"id":"8927541c-fae1-4aa5-8e8c-2c7bbc533b90","title":"M43 Manual Flow Mission","status":"ACTIVE"}
SCENE ROW    : {"id":"3533e2f1-f38a-44e1-87eb-f796915026ca","name":"M43 Manual Annex","district":"M43 Manual District"}
CLEANUP      : done
```

Verification gates observed on this run: content schema validation, checksum-based
`migration_log` skip logic, dialogue chunk compilation, snapshot publication, cache invalidation,
and the 8-check `verifyPlanCrossReferences` report (all pass). Artifacts were cleaned up
afterwards (0 leftover plan rows, migration_log entries, or content folders).

## Verification Results (2026-08-23)

```text
npm run test --workspace=server   # unit+smoke: 98 suites / 1071 tests PASS; integration: 61 suites / 397 tests PASS
npm run test --workspace=admin    # new M43 suite passes; 5 pre-existing failures unrelated to M43
                                  # (useUnsafeNavigationGuard, LocationDetailPage views — also fail on a clean tree)
npm run build --workspace=server  # PASS
npm run build --workspace=admin   # PASS
npm run validate:content          # exit 0
```

## Relationship to Existing Records

M43 owns the implementation and evidence for the plan-to-migration effectiveness question;
the superseded M39 exploration record is no longer a separate active milestone.
