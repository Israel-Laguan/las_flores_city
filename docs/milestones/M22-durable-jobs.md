# M22 — Durable, Resumable, Idempotent Job Runtime

> **Status:** Implemented · **Branch:** `main` · **PR size target:** ~25 files
> **Phase:** 3 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §15.7

## Goal

Make the intake-worker's jobs survive failures and resume from persisted partial state,
with idempotent commits. This is the "demo → production" gap for the worker from M21.

## Scope

| Item | Detail |
|---|---|
| **`job_runs` tracking** | `attempt`, `max_attempts`, partial-result snapshot, `idempotency_key` on commit |
| **Resume logic** | `runSolidify` + `PlanGenerationJob` restart from the last persisted stage, not from scratch |
| **Idempotent commit** | `migrateContent` / `applyLink` / `publishChosenDrafts` guard against double-apply |
| **Retry/backoff** | harness for LLM/asset failures consistent with `AssetGenerationService` |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| Migration | `server/src/database/migrations/062_job_runs.sql` |
| Shared schema | `shared/src/schemas/job-run.ts` |
| New service | `server/src/services/JobRunService.ts`, `server/src/utils/retryBackoff.ts` |
| Workers | `server/src/services/StoryBuilderOrchestrator.ts`, `PlanGenerationJob.ts`, `ContentAssetWorker.ts`, `AssetGenerationService.ts` |
| Content engine | `server/src/content/migrate.ts`, `server/src/services/StoryBuilderFileWriter.ts`, `AssetPublishService.ts` |
| Startup wiring | `server/src/intake.ts` |
| Tests | `server/tests/unit/JobRunService.test.ts`, `server/tests/integration/job-runs.resume.test.ts` |

## Risks & verification

- **Risk:** Medium. Resume logic can double-apply if idempotency keys are wrong; the
  advisory-lock migration flow must stay single-writer.
- **Verify:** kill a running solidify job mid-stage, restart, confirm it resumes from the
  last persisted stage; re-run a commit and confirm no duplicate rows/links.
- **Accept:** a job that dies mid-way resumes correctly; no double-apply on retry.

## Definition of Done

- [x] `job_runs` table + tracking populated for solidify/fill/asset jobs
- [x] Resume from partial state works (kill/restart test)
- [x] Commits are idempotent (re-run produces no duplicates)
- [x] Retry/backoff consistent with existing asset generation