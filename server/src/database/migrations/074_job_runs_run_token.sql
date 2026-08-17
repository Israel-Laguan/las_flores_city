-- Las Flores 2077 - Add run_token to job_runs (Issue #5 fix)
--
-- Adds a run_token column to store the CAS token persistently, so that
-- resumed jobs can retrieve their ownership token even when the Redis
-- cache is evicted.

BEGIN;

ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS run_token UUID;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_job_runs_run_token ON job_runs(run_token);

COMMIT;
