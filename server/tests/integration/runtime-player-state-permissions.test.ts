/**
 * SC-501 — permission test for the player-state tables of the `runtime` schema (migration 108).
 *
 * SC-106 style, raw `pg` clients logged in as the real roles (no runtimePool):
 *   - runtime has SELECT + INSERT on games and game_flags (write-once is a grant: UPDATE and DELETE
 *     are 42501) and SELECT + INSERT + UPDATE on game_resolution (DELETE is 42501);
 *   - planning, PUBLIC and the app role have nothing on any of the three tables (exact relacl);
 *   - runtime still cannot read planning and cannot write publish;
 *   - no foreign key from these tables to planning or publish (only same-schema FKs);
 *   - the migration is idempotent.
 *
 * Collision avoidance: every row belongs to a random-UUID player created in this file, removed in
 * afterAll through the owner connection (runtime cannot DELETE flags). Nothing here moves the pointer.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { withSchemaLock } from '../helpers/schemaLock.js';

const { Client } = pg;
const MIGRATION = '108_runtime_player_state.sql';
const PLANNING_URL = process.env.PLANNING_DATABASE_URL || 'postgresql://planning:dev_planning@localhost:5434/las_flores';
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL || 'postgresql://runtime:dev_runtime@localhost:5434/las_flores';
const OWNER_URL = process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores';

const TABLES = ['runtime.games', 'runtime.game_flags', 'runtime.game_resolution'];
/** A column that exists on each table so UPDATE parses and the privilege check is what fails. */
const COLUMN: Record<string, string> = {
  'runtime.games': 'player_id',
  'runtime.game_flags': 'flag_slug',
  'runtime.game_resolution': 'scene_slug',
};

const sqlstate = async (run: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await run();
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
};

describe('runtime player-state tables: grants (SC-501)', () => {
  let planning: pg.Client;
  let runtime: pg.Client;
  let owner: pg.Client;
  const player = randomUUID();
  let gameId = '';
  const sql = () => fs.readFileSync(path.resolve(process.cwd(), 'src/database/migrations', MIGRATION), 'utf-8');

  beforeAll(async () => {
    owner = new Client({ connectionString: OWNER_URL, connectionTimeoutMillis: 5000 });
    planning = new Client({ connectionString: PLANNING_URL, connectionTimeoutMillis: 5000 });
    runtime = new Client({ connectionString: RUNTIME_URL, connectionTimeoutMillis: 5000 });
    await Promise.all([owner.connect(), planning.connect(), runtime.connect()]);
    await withSchemaLock(async (client) => {
      await client.query(sql());
    });
  }, 30_000);

  afterAll(async () => {
    try {
      for (const t of ['game_flags', 'game_resolution', 'games']) {
        await owner.query(`DELETE FROM runtime.${t} WHERE player_id = $1`, [player]);
      }
    } finally {
      await Promise.allSettled([owner?.end(), planning?.end(), runtime?.end()]);
    }
  });

  test('migration 108 is idempotent and leaves the exact grants in place', async () => {
    await withSchemaLock(async (client) => {
      await client.query(sql());
      await client.query(sql());
    });
    expect(await sqlstate(() => runtime.query('UPDATE runtime.game_flags SET flag_slug = flag_slug WHERE false'))).toBe('42501');
  });

  test('runtime can create a game, set a flag and write a resolution', async () => {
    const g = await runtime.query<{ game_id: string }>('INSERT INTO runtime.games (player_id) VALUES ($1) RETURNING game_id', [player]);
    gameId = g.rows[0].game_id;
    await runtime.query('INSERT INTO runtime.game_flags (player_id, game_id, flag_slug) VALUES ($1, $2, $3)', [player, gameId, 'perm_flag']);
    await runtime.query(
      `INSERT INTO runtime.game_resolution (player_id, game_id, scene_slug, artifact_id, revision_id) VALUES ($1, $2, 'lobby', $3, $4)`,
      [player, gameId, 'c'.repeat(64), randomUUID()],
    );
    for (const t of TABLES) await expect(runtime.query(`SELECT 1 FROM ${t} LIMIT 0`)).resolves.toBeDefined();
  });

  test('flags are write-once by grant: runtime UPDATE / DELETE / TRUNCATE on game_flags and games are 42501', async () => {
    for (const t of ['runtime.game_flags', 'runtime.games']) {
      const col = COLUMN[t];
      for (const q of [`UPDATE ${t} SET ${col} = ${col} WHERE false`, `DELETE FROM ${t} WHERE false`, `TRUNCATE ${t}`]) {
        expect([q, await sqlstate(() => runtime.query(q))]).toEqual([q, '42501']);
      }
    }
  });

  test('runtime may UPDATE game_resolution (upsert replaces) but never DELETE or TRUNCATE it', async () => {
    await expect(
      runtime.query(`UPDATE runtime.game_resolution SET scene_slug = 'rooftop' WHERE player_id = $1 AND game_id = $2`, [player, gameId]),
    ).resolves.toBeDefined();
    for (const q of ['DELETE FROM runtime.game_resolution WHERE false', 'TRUNCATE runtime.game_resolution']) {
      expect([q, await sqlstate(() => runtime.query(q))]).toEqual([q, '42501']);
    }
  });

  test.each(TABLES)('planning has no privilege on %s (SELECT / INSERT / UPDATE / DELETE all 42501)', async (t) => {
    const col = COLUMN[t];
    for (const q of [`SELECT 1 FROM ${t} LIMIT 0`, `INSERT INTO ${t} DEFAULT VALUES`, `UPDATE ${t} SET ${col} = ${col} WHERE false`, `DELETE FROM ${t} WHERE false`]) {
      expect([q, await sqlstate(() => planning.query(q))]).toEqual([q, '42501']);
    }
  });

  test('the ACLs name only runtime, with exactly the granted privileges (nothing for planning, PUBLIC or the app role)', async () => {
    const r = await owner.query<{ tbl: string; acl: string[] | null }>(
      `SELECT c.relname AS tbl, c.relacl::text[] AS acl
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'runtime' AND c.relname IN ('games', 'game_flags', 'game_resolution')`,
    );
    const acl = Object.fromEntries(r.rows.map((x) => [x.tbl, x.acl]));
    // relacl: grantee=privs/grantor; a=INSERT r=SELECT w=UPDATE. Owner is `las_flores`.
    expect(acl.games).toEqual(['runtime=ar/las_flores']);
    expect(acl.game_flags).toEqual(['runtime=ar/las_flores']);
    expect(acl.game_resolution).toEqual(['runtime=arw/las_flores']);
  });

  test('runtime still cannot read planning and cannot write publish', async () => {
    expect(await sqlstate(() => runtime.query('SELECT 1 FROM planning.flag_definitions LIMIT 0'))).toBe('42501');
    for (const t of ['publish.artifacts', 'publish.revisions', 'publish.revision_entries', 'publish.active_revision']) {
      for (const q of [`INSERT INTO ${t} DEFAULT VALUES`, `DELETE FROM ${t} WHERE false`]) {
        expect([q, await sqlstate(() => runtime.query(q))]).toEqual([q, '42501']);
      }
    }
  });

  test('no foreign key from these tables to planning or publish; the only FKs stay in runtime', async () => {
    const r = await owner.query<{ tbl: string; target: string }>(
      `SELECT con.conrelid::regclass::text AS tbl, ns.nspname || '.' || tgt.relname AS target
         FROM pg_constraint con
         JOIN pg_class tgt ON tgt.oid = con.confrelid
         JOIN pg_namespace ns ON ns.oid = tgt.relnamespace
        WHERE con.contype = 'f' AND con.conrelid IN ('runtime.games'::regclass, 'runtime.game_flags'::regclass, 'runtime.game_resolution'::regclass)`,
    );
    expect(r.rows.filter((x) => !x.target.startsWith('runtime.'))).toEqual([]);
    expect(r.rows.map((x) => x.target).sort()).toEqual(['runtime.games', 'runtime.games']);
  });

  test('an unrelated role has no access to any player-state table', async () => {
    const role = `sc501_nobody_${process.pid}`;
    await owner.query(`CREATE ROLE ${role} NOLOGIN`);
    try {
      for (const t of TABLES) {
        const r = await owner.query<{ sel: boolean }>(`SELECT has_table_privilege($1, $2, 'SELECT') AS sel`, [role, t]);
        expect([t, r.rows[0].sel]).toEqual([t, false]);
      }
    } finally {
      await owner.query(`DROP ROLE ${role}`);
    }
  });
});
