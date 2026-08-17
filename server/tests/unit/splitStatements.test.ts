/**
 * Unit tests for splitStatements in the migration runner.
 *
 * Regression coverage for the 075_job_runs_run_token_backfill failure: a
 * nontransactional migration that issues COMMIT inside a PL/pgSQL body must be
 * split into separate autocommit statements. node-postgres wraps a single
 * multi-statement query in an implicit transaction block, which makes the
 * in-body COMMIT illegal (2D000 invalid transaction termination).
 */
import { describe, test, expect } from '@jest/globals';
import { splitStatements } from '../../src/database/migrateUtils.js';

describe('splitStatements', () => {
  test('keeps a CREATE PROCEDURE $$ body with internal semicolons intact', () => {
    const sql = `CREATE OR REPLACE PROCEDURE backfill_job_runs_run_token()
LANGUAGE plpgsql
AS $$
DECLARE
  batch_size INT := 1000;
  updated INT;
BEGIN
  LOOP
    UPDATE job_runs SET run_token = gen_random_uuid();
    GET DIAGNOSTICS updated = ROW_COUNT;
    COMMIT;
    EXIT WHEN updated = 0;
  END LOOP;
END;
$$;
CALL backfill_job_runs_run_token();
DROP PROCEDURE IF EXISTS backfill_job_runs_run_token();`;

    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(3);
    expect(stmts[0]).toContain('CREATE OR REPLACE PROCEDURE backfill_job_runs_run_token()');
    expect(stmts[0]).toContain('END;');
    expect(stmts[0]).toContain('COMMIT;');
    expect(stmts[1]).toBe('CALL backfill_job_runs_run_token();');
    expect(stmts[2]).toContain('DROP PROCEDURE');
  });

  test('does not split on semicolons inside a $$ body', () => {
    const sql = `CREATE OR REPLACE FUNCTION bar() RETURNS INT AS $$
DECLARE x INT; -- inline comment
BEGIN
  x := 1;
  RETURN x;
END;
$$ LANGUAGE plpgsql;`;
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain('RETURN x;');
    expect(stmts[0]).toContain('$$ LANGUAGE plpgsql;');
  });

  test('splits ordinary statements separated by semicolons', () => {
    const sql = `CREATE TABLE foo (a INT);
CREATE INDEX CONCURRENTLY idx_foo ON foo(a);
SELECT 1;`;
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(3);
    expect(stmts[0]).toBe('CREATE TABLE foo (a INT);');
    expect(stmts[1]).toBe('CREATE INDEX CONCURRENTLY idx_foo ON foo(a);');
    expect(stmts[2]).toBe('SELECT 1;');
  });

  test('handles a comment-only leading block before a procedure', () => {
    const sql = `-- leading comment
-- another line
CREATE OR REPLACE PROCEDURE p() AS $$
BEGIN
  NULL;
END;
$$;`;
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain('-- leading comment');
    expect(stmts[0]).toContain('CREATE OR REPLACE PROCEDURE p()');
  });

  test('ignores empty input', () => {
    expect(splitStatements('')).toEqual([]);
    expect(splitStatements('   \n  \n')).toEqual([]);
  });
});
