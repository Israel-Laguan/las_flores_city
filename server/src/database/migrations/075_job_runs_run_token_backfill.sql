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
-- This backfill is batched: each batch updates a limited number of NULL rows
-- and COMMITs before the next, so a large legacy `job_runs` history cannot be
-- locked-and-rewritten in a single statement (which would spike WAL/IO and
-- risk delaying or timing out intake-worker startup). Because this file is run
-- by migrate.ts in autocommit mode (no surrounding BEGIN), the explicit COMMIT
-- inside the procedure is legal and does NOT raise `invalid transaction
-- termination`.

CREATE OR REPLACE PROCEDURE backfill_job_runs_run_token()
LANGUAGE plpgsql
AS $$
DECLARE
  batch_size INT := 1000;
  updated INT;
BEGIN
  LOOP
    WITH batch AS (
      SELECT ctid FROM job_runs WHERE run_token IS NULL LIMIT batch_size
    )
    UPDATE job_runs
    SET run_token = gen_random_uuid()
    FROM batch
    WHERE job_runs.ctid = batch.ctid;

    GET DIAGNOSTICS updated = ROW_COUNT;
    COMMIT;
    EXIT WHEN updated = 0;
  END LOOP;
END;
$$;

CALL backfill_job_runs_run_token();
DROP PROCEDURE IF EXISTS backfill_job_runs_run_token();
