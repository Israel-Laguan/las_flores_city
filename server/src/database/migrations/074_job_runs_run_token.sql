-- Las Flores 2077 - Add run_token to job_runs (Issue #5 fix)
--
-- Adds a run_token column to store the CAS token persistently, so that
-- resumed jobs can retrieve their ownership token even when the Redis
-- cache is evicted.

BEGIN;

ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS run_token UUID;

-- Backfill a token for pre-existing rows so a cache-miss resume can still
-- retrieve a CAS token instead of silently bypassing the protection this
-- column exists to provide. Idempotent: only NULL rows are touched.
UPDATE job_runs SET run_token = gen_random_uuid() WHERE run_token IS NULL;

COMMIT;
