-- Las Flores 2077 - Durable, resumable, idempotent job runtime (M22)
--
-- Tracks background intake-worker jobs (solidify / plan_fill / asset_generation)
-- with an attempt budget, a last-persisted stage, and a committed-stage set that
-- acts as the idempotency guard for commit primitives (migrateContent / applyLink
-- / publishChosenDrafts). This is the "demo -> production" durability gap from the
-- M21 worker.
--
-- Design notes:
-- * `committed_stages` is a JSONB array of stages whose commit has already been
--   persisted. A resumed run consults it (via JobRunService.hasCommittedStage) so
--   it never re-enters an already-committed stage -> no double-apply on retry.
-- * A unique (plan_id, job_type) key is NOT used because a plan legitimately runs a
--   job multiple times across attempts; attempts are tracked by incrementing
--   `attempt` on the same `job_runs` row (see `nextAttempt` in JobRunService).
-- * `attempt` / `max_attempts` / `next_retry_at` implement the retry/backoff budget
--   consistent with AssetGenerationService's exponential policy.

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES content_plans(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL
    CHECK (job_type IN ('solidify', 'plan_fill', 'asset_generation')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'resumable', 'succeeded', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  stage TEXT,
  committed_stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  partial_result JSONB,
  error TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_plan ON job_runs(plan_id, job_type);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);
CREATE INDEX IF NOT EXISTS idx_job_runs_next_retry ON job_runs(next_retry_at);
