-- Las Flores 2077 - Backfill run_token for legacy job_runs (Issue #5 fix)
--
-- Pre-existing rows (before the column existed) have NULL run_token. This
-- backfill assigns each a token so a cache-miss resume can still recover the
-- CAS ownership token instead of silently bypassing the protection the column
-- exists to provide.
--
-- Runs as NONTRANSACTIONAL (autocommit) so each bounded batch commits
-- independently: an unbounded `UPDATE ... WHERE run_token IS NULL` would
-- rewrite and row-lock every legacy run inside the startup migration
-- transaction and could time out intake-worker startup on a large history.
-- Idempotent: only NULL rows are touched, so a partial run resumes cleanly.

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
    UPDATE job_runs SET run_token = gen_random_uuid()
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
