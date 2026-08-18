# M22 — Durable, Resumable, Idempotent Job Runtime

> **Status:** Implemented · **Branch:** `main` · **PR size target:** ~25 files
> **Phase:** 3 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §15.7

## Goal

Make the intake-worker's jobs survive failures and resume from persisted partial state,
with idempotent commits. This is the "demo → production" gap for the worker from M21.

## Scope

| Item | Detail |
|---|---|
| **`job_runs` tracking** | `attempt`, `max_attempts`, partial-result snapshot, `committed_stages` JSONB set on commit |
| **Resume logic** | `runSolidify` + `PlanGenerationJob` restart from the last persisted stage, not from scratch |
| **Idempotent commit** | `migrateContent` / `applyLink` / `publishChosenDrafts` guard against double-apply |
| **Retry/backoff** | harness for LLM/asset failures consistent with `AssetGenerationService` |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| Migration | `server/src/database/migrations/062_job_runs.sql` |
| Shared schema | `shared/src/schemas/job-run.ts` |
| New service | `server/src/services/JobRunService.ts`, `server/src/utils/retryBackoff.ts` |
| Workers | `server/src/services/StoryBuilderOrchestrator.ts` (`runSolidify`/`resumeSolidify`), `PlanGenerationJob.ts` (`resumePlanFill`/`resetOrphanedFillJobs`), `server/src/workers/ContentAssetWorker.ts` (`reclaimStalledNeeds` + `asset_generation` job runs) |
| Content engine | `server/src/content/migrate.ts` (checksum `migration_log` skip), `AssetPublishService.ts` (`publishChosenDrafts` in-place update) |
| Startup wiring | `server/src/intake.ts` (`markOrphanedResumable` → `resumeSolidify` / `resetOrphanedFillJobs`) |
| Tests | `server/tests/unit/JobRunService.test.ts`, `server/tests/integration/job-runs.resume.test.ts` |

## Design

### `job_runs` table (`062_job_runs.sql`)
- One row per background job keyed by `(plan_id, job_type)`, **not** `(plan_id, job_type, attempt)` — a plan legitimately re-runs the same job across attempts, so attempts are tracked by *incrementing* `attempt` on the same row (`nextAttempt`), not by inserting new rows.
- Columns: `status` (`running`/`resumable`/`succeeded`/`failed`), `attempt`/`max_attempts`/`next_retry_at` (retry/backoff budget), `stage` (last persisted stage), `committed_stages` JSONB (idempotency guard), `partial_result` JSONB (resume checkpoint), `error`.
- Indexes on `(plan_id, job_type)`, `status`, and `next_retry_at`.

### Resume model
- A job that dies mid-stage is left `running`. On startup `markOrphanedResumable()` flips every `running` row to `resumable`; `intake.ts` then dispatches `resumeSolidify` / `resumePlanFill`, which consume one attempt (`nextAttempt`, exponential backoff) and re-enter the core routine.
- `runSolidify` resumes from `content_plans.status` rather than scratch, reconstructing `stageResult`/`publishResult` from `job_runs.partial_result` (falling back to the Redis `solidify:` cache). `plan_fill` resumes by skipping items whose `filled_fields` already exist (persisted incrementally per batch), and `asset_generation` skips needs whose drafts already exist on disk.
- `ContentAssetWorker.reclaimStalledNeeds()` resets `generating` needs stuck >5 min back to `pending` so the next tick retries them.

### Idempotent commit
- **`committed_stages`** is the single idempotency guard. `commitStage` appends a stage only if absent (`committed_stages @> …` CASE), so a resumed run never re-enters an already-committed stage. `runSolidify` consults `hasCommittedStageById` to skip `publish` and rewinds `migrating`/`verifying` runs to `staged`/`migrated` so they re-complete with no double-apply.
- `migrateContent` is independently idempotent via the checksum `migration_log` (re-skip already-migrated files; reprocess only on drift); it also holds the single-writer `content_migration` advisory lock, which stays exclusive to the intake-worker.
- `publishChosenDrafts` is idempotent: it only processes needs still `chosen`/`pending` and updates the existing `dev`-label URL entry **in place** rather than appending, so a re-run cannot duplicate rows/links.

### Retry / backoff (`retryBackoff.ts`)
- `backoffDelayMs(attempt)` uses the same exponential curve as `AssetGenerationService` (`60s × 1.5^(n-1)`, capped at `300s`, equal jitter), guaranteeing consistency by construction. Per-request retries inside `AssetGenerationService` use `RETRY_MAX_ATTEMPTS = 6`; the tighter **job** budget is `max_attempts = 3` (each attempt re-runs the whole pipeline, so the job budget is deliberately smaller than the per-call retry cap).

## Risks & verification

- **Risk:** Medium. Resume logic can double-apply if idempotency keys are wrong or
  `content_plans.status` drifts from `job_runs.committed_stages`. Mitigated by three
  independent guards — `committed_stages` set, checksum `migration_log`, and
  in-place `dev`-label URL updates — plus the single-writer `content_migration`
  advisory lock (intake-worker only).
- **Verify:**
  - `server/tests/integration/job-runs.resume.test.ts`: `commitStage` guards
    double-apply, `hasCommittedStage` truthiness, `nextAttempt` increments attempt +
    backoff and exhausts at `max_attempts`, `markOrphanedResumable` flips `running`
    → `resumable` and returns the orphaned runs.
  - `server/tests/unit/JobRunService.test.ts`: in-memory mock of `queryOLTP`
    exercising start/update/commit/next-attempt/orphan paths without a live DB.
  - Manual: kill a running solidify/plan-fill job mid-stage, restart the
    intake-worker, confirm `markOrphanedResumable` + `resumeSolidify`/`resumePlanFill`
    resume from the last persisted stage; re-run a commit and confirm no duplicate
    rows/links in `migration_log` / MinIO `dev` entries.
- **Accept:** a job that dies mid-way resumes correctly; no double-apply on retry.

## Definition of Done

- [x] `job_runs` table (`062_job_runs.sql`) + tracking populated for `solidify` / `plan_fill` / `asset_generation` jobs
- [x] Resume from partial state works (`runSolidify`/`resumeSolidify`, `resumePlanFill`, `ContentAssetWorker` reclaim) — kill/restart verified via startup dispatch in `intake.ts`
- [x] Commits are idempotent (`committed_stages` guard + `migration_log` checksum + in-place `publishChosenDrafts`) — re-run produces no duplicates
- [x] Retry/backoff consistent with existing asset generation (`retryBackoff.ts` shared by `AssetGenerationService`)