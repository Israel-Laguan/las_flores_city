/**
 * SC-402 / D2 — permission test for the `publish` seam schema (migration 104).
 *
 * SC-106 style, with raw `pg` clients logged in as the real roles (no runtimePool):
 *   - planning WRITES (INSERT) and reads, but cannot UPDATE or DELETE (artifacts are immutable);
 *   - runtime has SELECT only: INSERT / UPDATE / DELETE are permission denied (42501);
 *   - nobody else has any access: the table ACL names only planning and runtime.
 *
 * Collision avoidance: every fixture artifact's name starts with `sc402_perm`, which no other
 * suite uses; rows are removed in afterAll by that prefix (through the owner connection,
 * since planning itself may not DELETE).
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { withSchemaLock } from '../helpers/schemaLock.js';
import { fixtureRecord } from '../helpers/artifactStoreContract.js';

const { Client } = pg;
const PREFIX = 'sc402_perm';
const MIGRATION = '104_publish_artifacts.sql';

const PLANNING_URL = process.env.PLANNING_DATABASE_URL || 'postgresql://planning:dev_planning@localhost:5434/las_flores';
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL || 'postgresql://runtime:dev_runtime@localhost:5434/las_flores';
const OWNER_URL = process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores';

async function sqlstate(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('publish.artifacts grants (D2)', () => {
  let planning: pg.Client;
  let runtime: pg.Client;
  let owner: pg.Client;
  const record = fixtureRecord(`${PREFIX}_a`);
  const id = record.artifact.artifact_id;

  const cleanup = () => owner.query('DELETE FROM publish.artifacts WHERE name LIKE $1', [`${PREFIX}\\_%`]);

  beforeAll(async () => {
    owner = new Client({ connectionString: OWNER_URL, connectionTimeoutMillis: 5000 });
    planning = new Client({ connectionString: PLANNING_URL, connectionTimeoutMillis: 5000 });
    runtime = new Client({ connectionString: RUNTIME_URL, connectionTimeoutMillis: 5000 });
    await Promise.all([owner.connect(), planning.connect(), runtime.connect()]);
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'src/database/migrations', MIGRATION), 'utf-8');
    await withSchemaLock(async (client) => {
      await client.query(sql);
    });
    await cleanup();
  }, 30_000);

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await Promise.allSettled([owner?.end(), planning?.end(), runtime?.end()]);
    }
  });

  test('migration 104 is idempotent', async () => {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'src/database/migrations', MIGRATION), 'utf-8');
    await withSchemaLock(async (client) => {
      await client.query(sql);
      await client.query(sql);
    });
  });

  test('planning can INSERT an artifact and read it back', async () => {
    await planning.query(
      `INSERT INTO publish.artifacts (artifact_id, artifact_type, name, manifest_version, payload, size_bytes, created_at)
       VALUES ($1, 'scene', $2, 1, $3, $4, $5)`,
      [id, record.artifact.name, record.payload, record.artifact.size_bytes, record.artifact.created_at],
    );
    const r = await planning.query('SELECT payload FROM publish.artifacts WHERE artifact_id = $1', [id]);
    expect(r.rows[0].payload).toBe(record.payload);
  });

  test('runtime can SELECT the same artifact, byte for byte (the seam works)', async () => {
    const r = await runtime.query('SELECT payload, artifact_type FROM publish.artifacts WHERE artifact_id = $1', [id]);
    expect(r.rows[0].payload).toBe(record.payload);
    expect(r.rows[0].artifact_type).toBe('scene');
  });

  test('runtime INSERT is permission denied (42501)', async () => {
    const other = fixtureRecord(`${PREFIX}_b`);
    expect(
      await sqlstate(() =>
        runtime.query(
          `INSERT INTO publish.artifacts (artifact_id, artifact_type, name, manifest_version, payload, size_bytes)
           VALUES ($1, 'scene', $2, 1, $3, $4)`,
          [other.artifact.artifact_id, other.artifact.name, other.payload, other.artifact.size_bytes],
        ),
      ),
    ).toBe('42501');
    const check = await owner.query('SELECT 1 FROM publish.artifacts WHERE artifact_id = $1', [other.artifact.artifact_id]);
    expect(check.rowCount).toBe(0);
  });

  test.each([
    ['UPDATE', `UPDATE publish.artifacts SET name = name WHERE false`],
    ['DELETE', `DELETE FROM publish.artifacts WHERE false`],
    ['TRUNCATE', `TRUNCATE publish.artifacts`],
  ])('runtime %s is permission denied (42501)', async (_op, query) => {
    expect(await sqlstate(() => runtime.query(query))).toBe('42501');
  });

  test.each([
    ['UPDATE', `UPDATE publish.artifacts SET name = name WHERE false`],
    ['DELETE', `DELETE FROM publish.artifacts WHERE false`],
    ['TRUNCATE', `TRUNCATE publish.artifacts`],
  ])('planning %s is permission denied too: artifacts are immutable (42501)', async (_op, query) => {
    expect(await sqlstate(() => planning.query(query))).toBe('42501');
  });

  test('the immutable row is still there after the denied attempts', async () => {
    const r = await owner.query('SELECT 1 FROM publish.artifacts WHERE artifact_id = $1', [id]);
    expect(r.rowCount).toBe(1);
  });

  test('runtime still cannot reach planning canon through the seam (SC-106 intact)', async () => {
    expect(await sqlstate(() => runtime.query('SELECT 1 FROM planning.scene_defs LIMIT 0'))).toBe('42501');
  });

  test('the table ACL names only planning and runtime: nothing for PUBLIC, the app role, or anyone else', async () => {
    const r = await owner.query<{ grantee: string; privilege_type: string }>(
      `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
         FROM pg_class c, LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
        WHERE c.oid = 'publish.artifacts'::regclass`,
    );
    const by = new Map<string, string[]>();
    for (const row of r.rows) by.set(row.grantee, [...(by.get(row.grantee) ?? []), row.privilege_type].sort());
    expect([...by.keys()].sort()).toEqual(['planning', 'runtime']);
    expect(by.get('planning')).toEqual(['INSERT', 'SELECT']);
    expect(by.get('runtime')).toEqual(['SELECT']);
  });

  test('the schema grants USAGE to planning and runtime only (besides its owner); nothing for PUBLIC', async () => {
    const r = await owner.query<{ grantee: string }>(
      `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee
         FROM pg_namespace n, LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
        WHERE n.nspname = 'publish' AND a.grantee <> n.nspowner`,
    );
    expect([...new Set(r.rows.map((x) => x.grantee))].sort()).toEqual(['planning', 'runtime']);
  });

  test('an unrelated role has no access: a fresh role cannot see the schema', async () => {
    const role = `sc402_nobody_${process.pid}`;
    await owner.query(`CREATE ROLE ${role} NOLOGIN`);
    try {
      const r = await owner.query<{ usage: boolean; sel: boolean }>(
        `SELECT has_schema_privilege($1, 'publish', 'USAGE') AS usage,
                has_table_privilege($1, 'publish.artifacts', 'SELECT') AS sel`,
        [role],
      );
      expect(r.rows[0]).toEqual({ usage: false, sel: false });
    } finally {
      await owner.query(`DROP ROLE ${role}`);
    }
  });
});
