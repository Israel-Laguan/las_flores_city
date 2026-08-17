-- Las Flores 2077 - Backfill run_token for legacy job_runs (Issue #5 fix)
--
-- Pre-existing rows (before the column existed) have NULL run_token. This
-- backfill assigns each a token so a cache-miss resume can still recover the
-- CAS ownership token instead of silently bypassing the protection the column
-- exists to provide.
--
-- Runs as NONTRANSACTIONAL (autocommit) so it does not sit inside the startup
-- migration transaction. Idempotent: only NULL rows are touched, so a partial
-- run resumes cleanly.
--
-- NOTE: This file is executed by migrate.ts as a SINGLE multi-statement query
-- in autocommit mode. A PL/pgSQL procedure that issues its own COMMIT inside
-- that implicit transaction raises `invalid transaction termination`, so we do
-- not use a procedure with COMMIT here. A single bounded UPDATE is sufficient
-- for a one-time backfill of legacy NULL tokens.

UPDATE job_runs SET run_token = gen_random_uuid() WHERE run_token IS NULL;
