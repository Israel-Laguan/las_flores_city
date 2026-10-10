/**
 * SC-404 / D2 — permission test for the revision tables of the `publish` seam (migration 105).
 *
 * SC-106 style, raw `pg` clients logged in as the real roles (no runtimePool):
 *   - planning writes revisions / entries / flips (INSERT, SELECT; never UPDATE/DELETE) and may
 *     UPDATE the pointer (the one mutable fact) but never DELETE it;
 *   - runtime has SELECT only on revisions, entries and the pointer, and NOTHING on the flip log;
 *   - nobody else has any access: the ACLs name only planning and runtime.
 *
 * Collision avoidance: revision notes and artifact names start with `sc404_perm`, which no other
 * suite uses; rows are removed in afterAll through the owner connection (planning may not DELETE).
 * No test here moves the pointer, so it needs no pointer lock.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { withSchemaLock } from '../helpers/schemaLock.js';
import { deletePrefixedPublishRows } from '../helpers/pointerLock.js';
import { fixtureRecord } from '../helpers/artifactStoreContract.js';
import { manifestFromRecords } from '@las-flores/api-planning';

const { Client } = pg;
const PREFIX = 'sc404_perm';
const MIGRATION = '105_publish_revisions.sql';
const PLANNING_URL = process.env.PLANNING_DATABASE_URL || 'postgresql://planning:dev_planning@localhost:5434/las_flores';
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL || 'postgresql://runtime:dev_runtime@localhost:5434/las_flores';
const OWNER_URL = process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores';

const READABLE_BY_RUNTIME = ['publish.revisions', 'publish.revision_entries', 'publish.active_revision'];
const ALL = [...READABLE_BY_RUNTIME, 'publish.revision_flips'];

/** A column that exists on each table, so UPDATE statements parse and the privilege check is what fails. */
const COLUMN: Record<string, string> = {
  'publish.revisions': 'revision_id',
  'publish.revision_entries': 'revision_id',
  'publish.active_revision': 'revision_id',
  'publish.revision_flips': 'to_revision_id',
};

const sqlstate = async (run: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await run();
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
};

describe('publish revision tables: grants (D2)', () => {
  let planning: pg.Client;
  let runtime: pg.Client;
  let owner: pg.Client;
  let revisionId = '';
  const rec = fixtureRecord(`${PREFIX}_a`);
  const sql = () => fs.readFileSync(path.resolve(process.cwd(), 'src/database/migrations', MIGRATION), 'utf-8');

  beforeAll(async () => {
    owner = new Client({ connectionString: OWNER_URL, connectionTimeoutMillis: 5000 });
    planning = new Client({ connectionString: PLANNING_URL, connectionTimeoutMillis: 5000 });
    runtime = new Client({ connectionString: RUNTIME_URL, connectionTimeoutMillis: 5000 });
    await Promise.all([owner.connect(), planning.connect(), runtime.connect()]);
    await withSchemaLock(async (client) => {
      await client.query(sql());
    });
    await deletePrefixedPublishRows(PREFIX);
  }, 30_000);

  afterAll(async () => {
    try {
      await deletePrefixedPublishRows(PREFIX);
    } finally {
      await Promise.allSettled([owner?.end(), planning?.end(), runtime?.end()]);
    }
  });

  test('migration 105 is idempotent', async () => {
    await withSchemaLock(async (client) => {
      await client.query(sql());
      await client.query(sql());
    });
  });

  test('planning can insert an artifact, a revision and its entry; runtime can read them back', async () => {
    await planning.query(
      `INSERT INTO publish.artifacts (artifact_id, artifact_type, name, manifest_version, payload, size_bytes)
       VALUES ($1, 'scene', $2, 1, $3, $4)`,
      [rec.artifact.artifact_id, rec.artifact.name, rec.payload, rec.artifact.size_bytes],
    );
    const ins = await planning.query<{ revision_id: string }>(
      `INSERT INTO publish.revisions (manifest_hash, note) VALUES ($1, $2) RETURNING revision_id`,
      ['f'.repeat(64), `${PREFIX} rev`],
    );
    revisionId = ins.rows[0].revision_id;
    const entry = manifestFromRecords([rec]).entries[0];
    await planning.query(
      `INSERT INTO publish.revision_entries (revision_id, artifact_type, name, artifact_id) VALUES ($1, $2, $3, $4)`,
      [revisionId, entry.artifact_type, entry.name, entry.artifact_id],
    );
    const r = await runtime.query(
      `SELECT e.name, a.payload FROM publish.revisions v
         JOIN publish.revision_entries e USING (revision_id)
         JOIN publish.artifacts a USING (artifact_id)
        WHERE v.revision_id = $1`,
      [revisionId],
    );
    expect(r.rows).toEqual([{ name: rec.artifact.name, payload: rec.payload }]);
  });

  test.each(READABLE_BY_RUNTIME)('runtime can SELECT %s', async (table) => {
    await expect(runtime.query(`SELECT 1 FROM ${table} LIMIT 0`)).resolves.toBeDefined();
  });

  test('runtime has NOTHING on the flip log: SELECT is permission denied (42501)', async () => {
    expect(await sqlstate(() => runtime.query('SELECT 1 FROM publish.revision_flips LIMIT 0'))).toBe('42501');
  });

  test.each(ALL)('runtime INSERT / UPDATE / DELETE / TRUNCATE on %s are permission denied (42501)', async (table) => {
    const col = COLUMN[table];
    for (const q of [`INSERT INTO ${table} DEFAULT VALUES`, `UPDATE ${table} SET ${col} = ${col} WHERE false`, `DELETE FROM ${table} WHERE false`, `TRUNCATE ${table}`]) {
      expect([q, await sqlstate(() => runtime.query(q))]).toEqual([q, '42501']);
    }
  });

  test('runtime cannot move the pointer: UPDATE active_revision is denied (42501)', async () => {
    expect(await sqlstate(() => runtime.query('UPDATE publish.active_revision SET revision_id = revision_id'))).toBe('42501');
  });

  test.each(['publish.revisions', 'publish.revision_entries', 'publish.revision_flips'])(
    'planning cannot UPDATE / DELETE / TRUNCATE %s: immutable (42501)',
    async (table) => {
      const col = COLUMN[table];
      for (const q of [`UPDATE ${table} SET ${col} = ${col} WHERE false`, `DELETE FROM ${table} WHERE false`, `TRUNCATE ${table}`]) {
        expect([q, await sqlstate(() => planning.query(q))]).toEqual([q, '42501']);
      }
    },
  );

  test('planning may UPDATE the pointer (the one mutable fact) but never DELETE or TRUNCATE it', async () => {
    await expect(planning.query('UPDATE publish.active_revision SET flipped_at = flipped_at WHERE false')).resolves.toBeDefined();
    expect(await sqlstate(() => planning.query('DELETE FROM publish.active_revision WHERE false'))).toBe('42501');
    expect(await sqlstate(() => planning.query('TRUNCATE publish.active_revision'))).toBe('42501');
  });

  test('planning can append to the flip log', async () => {
    // Insert-only: no pointer move needed to prove the grant, so use a row we clean up by note-matched revision.
    await planning.query('INSERT INTO publish.revision_flips (from_revision_id, to_revision_id) VALUES (NULL, $1)', [revisionId]);
    const r = await planning.query('SELECT 1 FROM publish.revision_flips WHERE to_revision_id = $1', [revisionId]);
    expect(r.rowCount).toBe(1);
  });

  test('the ACLs name only planning and runtime; the flip log names only planning; nothing for PUBLIC or the app role', async () => {
    const r = await owner.query<{ tbl: string; grantee: string; privilege_type: string }>(
      `SELECT c.relname AS tbl,
              CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
              a.privilege_type
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
              LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
        WHERE n.nspname = 'publish' AND c.relkind = 'r'
          AND c.relname IN ('revisions', 'revision_entries', 'active_revision', 'revision_flips')`,
    );
    const by = (tbl: string) => {
      const m = new Map<string, string[]>();
      for (const row of r.rows.filter((x) => x.tbl === tbl)) m.set(row.grantee, [...(m.get(row.grantee) ?? []), row.privilege_type].sort());
      return m;
    };
    for (const t of ['revisions', 'revision_entries']) {
      expect([...by(t).keys()].sort()).toEqual(['planning', 'runtime']);
      expect(by(t).get('planning')).toEqual(['INSERT', 'SELECT']);
      expect(by(t).get('runtime')).toEqual(['SELECT']);
    }
    expect([...by('active_revision').keys()].sort()).toEqual(['planning', 'runtime']);
    expect(by('active_revision').get('planning')).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    expect(by('active_revision').get('runtime')).toEqual(['SELECT']);
    expect([...by('revision_flips').keys()]).toEqual(['planning']);
    expect(by('revision_flips').get('planning')).toEqual(['INSERT', 'SELECT']);
  });

  test('an unrelated role has no access to any revision table', async () => {
    const role = `sc404_nobody_${process.pid}`;
    await owner.query(`CREATE ROLE ${role} NOLOGIN`);
    try {
      for (const t of ALL) {
        const r = await owner.query<{ sel: boolean }>(`SELECT has_table_privilege($1, $2, 'SELECT') AS sel`, [role, t]);
        expect([t, r.rows[0].sel]).toEqual([t, false]);
      }
    } finally {
      await owner.query(`DROP ROLE ${role}`);
    }
  });
});
