-- Las Flores 2077 - Add run_token to job_runs (Issue #5 fix)
--
-- Adds a run_token column to store the CAS token persistently, so that
-- resumed jobs can retrieve their ownership token even when the Redis
-- cache is evicted.
--
-- The legacy-row backfill (assigning a token to pre-existing NULL rows)
-- lives in 075_job_runs_run_token_backfill.sql, run as a NONTRANSACTIONAL
-- migration: it commits the rewrite in bounded batches so a large
-- job_runs history cannot hold row locks / keep the startup migration
-- transaction open and time out intake-worker startup.

ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS run_token UUID;
