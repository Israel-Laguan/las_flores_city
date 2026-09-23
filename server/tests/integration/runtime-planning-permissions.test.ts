/**
 * SC-106 — Negative permission test.
 *
 * Proves the `runtime` LOGIN role (SC-103) cannot USAGE / SELECT / INSERT /
 * UPDATE the `planning` schema. Lives in the with-migrations integration
 * suite; uses raw `pg` clients + RUNTIME_DATABASE_URL / PLANNING_DATABASE_URL
 * (no runtimePool).
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';

const { Client } = pg;

const FIXTURE_TABLE = 'planning._sc106_probe';
const FIXTURE_REGCLASS = 'planning._sc106_probe';

const DEFAULT_PLANNING_URL =
  'postgresql://planning:dev_planning@localhost:5434/las_flores';
const DEFAULT_RUNTIME_URL =
  'postgresql://runtime:dev_runtime@localhost:5434/las_flores';
const DEFAULT_OWNER_URL =
  'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores';

function requireEnv(name: string, fallback: string): string {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(
      `SC-106: ${name} is required — roles/grants from SC-103 must be available (CI with-migrations sets this).`,
    );
  }
  return value;
}

function isPgError(err: unknown): err is pg.DatabaseError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

async function expectPermissionDenied(
  action: string,
  query: () => Promise<unknown>,
): Promise<string> {
  try {
    await query();
    throw new Error(
      `SC-106: expected permission denied for ${action}, but the query succeeded — runtime grants on planning may have regressed.`,
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('SC-106: expected permission denied')) {
      throw err;
    }
    if (!isPgError(err)) {
      throw err;
    }
    // 42P01 = undefined_table — must NOT count as a pass
    if (err.code === '42P01') {
      throw new Error(
        `SC-106: ${action} failed with undefined_table (42P01) instead of permission denied (42501) — fixture ${FIXTURE_TABLE} is missing.`,
      );
    }
    if (err.code !== '42501') {
      throw new Error(
        `SC-106: ${action} failed with SQLSTATE ${err.code ?? 'unknown'} (${err.message}), expected 42501 permission denied.`,
      );
    }
    expect(err.message.toLowerCase()).toMatch(/permission denied/);
    return err.code;
  }
}

describe('SC-106 runtime cannot access planning schema', () => {
  let planningClient: pg.Client;
  let runtimeClient: pg.Client;
  let ownerClient: pg.Client;
  let fixtureOid: string | null = null;

  beforeAll(async () => {
    const planningUrl = requireEnv('PLANNING_DATABASE_URL', DEFAULT_PLANNING_URL);
    const runtimeUrl = requireEnv('RUNTIME_DATABASE_URL', DEFAULT_RUNTIME_URL);
    const ownerUrl = requireEnv('DATABASE_URL', DEFAULT_OWNER_URL);

    planningClient = new Client({
      connectionString: planningUrl,
      connectionTimeoutMillis: 5000,
    });
    runtimeClient = new Client({
      connectionString: runtimeUrl,
      connectionTimeoutMillis: 5000,
    });
    ownerClient = new Client({
      connectionString: ownerUrl,
      connectionTimeoutMillis: 5000,
    });

    await planningClient.connect();
    await runtimeClient.connect();
    await ownerClient.connect();

    // Fail loudly if SC-103 roles/schemas are missing (no silent skip).
    const roleCheck = await ownerClient.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname IN ('planning', 'runtime') ORDER BY rolname`,
    );
    expect(roleCheck.rows.map((r) => r.rolname)).toEqual(['planning', 'runtime']);

    const schemaCheck = await ownerClient.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname = 'planning'`,
    );
    expect(schemaCheck.rowCount).toBe(1);

    // Provision known planning fixture via planning role (schema owner).
    await planningClient.query(`
      CREATE TABLE IF NOT EXISTS ${FIXTURE_TABLE} (
        id integer PRIMARY KEY,
        note text NOT NULL DEFAULT 'sc106'
      )
    `);
    await planningClient.query(
      `INSERT INTO ${FIXTURE_TABLE} (id, note) VALUES (1, 'sc106-probe')
       ON CONFLICT (id) DO UPDATE SET note = EXCLUDED.note`,
    );
    // Explicit grant matching SC-103 default-privs intent for the fixture.
    await planningClient.query(
      `GRANT ALL ON TABLE ${FIXTURE_TABLE} TO planning`,
    );

    const reg = await planningClient.query<{ oid: string | null }>(
      `SELECT to_regclass($1)::oid::text AS oid`,
      [FIXTURE_REGCLASS],
    );
    expect(reg.rows[0]?.oid).toBeTruthy();
    fixtureOid = reg.rows[0].oid;
  }, 30_000);

  afterAll(async () => {
    try {
      if (planningClient) {
        await planningClient.query(`DROP TABLE IF EXISTS ${FIXTURE_TABLE}`);
      }
    } catch {
      // best-effort cleanup
    }
    await Promise.allSettled([
      planningClient?.end(),
      runtimeClient?.end(),
      ownerClient?.end(),
    ]);
  });

  test('planning schema exists and fixture table is present before denial checks', async () => {
    const schema = await ownerClient.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'planning'`,
    );
    expect(schema.rowCount).toBe(1);

    const present = await planningClient.query<{ present: boolean }>(
      `SELECT to_regclass($1) IS NOT NULL AS present`,
      [FIXTURE_REGCLASS],
    );
    expect(present.rows[0].present).toBe(true);
    expect(fixtureOid).toBeTruthy();
  });

  test('runtime lacks USAGE on planning schema', async () => {
    const result = await ownerClient.query<{ has: boolean }>(
      `SELECT has_schema_privilege('runtime', 'planning', 'USAGE') AS has`,
    );
    expect(result.rows[0].has).toBe(false);
  });

  test('runtime SELECT on planning fixture is permission denied (42501)', async () => {
    const sqlstate = await expectPermissionDenied(
      'SELECT on planning._sc106_probe as runtime',
      () => runtimeClient.query(`SELECT id, note FROM ${FIXTURE_TABLE} WHERE id = 1`),
    );
    // Auditable proof on success
    // eslint-disable-next-line no-console
    console.log(
      `SC-106 proof: fixture OID=${fixtureOid}, SELECT denied with SQLSTATE=${sqlstate}`,
    );
    expect(sqlstate).toBe('42501');
  });

  test('runtime INSERT on planning fixture is permission denied (42501)', async () => {
    const sqlstate = await expectPermissionDenied(
      'INSERT on planning._sc106_probe as runtime',
      () =>
        runtimeClient.query(
          `INSERT INTO ${FIXTURE_TABLE} (id, note) VALUES (2, 'should-fail')`,
        ),
    );
    // eslint-disable-next-line no-console
    console.log(
      `SC-106 proof: fixture OID=${fixtureOid}, INSERT denied with SQLSTATE=${sqlstate}`,
    );
    expect(sqlstate).toBe('42501');
  });

  test('runtime UPDATE on planning fixture is permission denied (42501)', async () => {
    const sqlstate = await expectPermissionDenied(
      'UPDATE on planning._sc106_probe as runtime',
      () =>
        runtimeClient.query(
          `UPDATE ${FIXTURE_TABLE} SET note = 'should-fail' WHERE id = 1`,
        ),
    );
    // eslint-disable-next-line no-console
    console.log(
      `SC-106 proof: fixture OID=${fixtureOid}, UPDATE denied with SQLSTATE=${sqlstate}`,
    );
    expect(sqlstate).toBe('42501');
  });
});
