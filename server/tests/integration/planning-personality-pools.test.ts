import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { queryOLTP } from '@las-flores/infra';
import { withSchemaLock } from '../helpers/schemaLock.js';

// SC-306 — migration 106: planning.personality_pools / planning.character_pools.
// Collision avoidance: every row slug starts with `sc306_mig`, which no other suite or content
// file uses; rows are removed in afterAll (links first — FK).
const PREFIX = 'sc306_mig';
const HASH = 'a'.repeat(64);
const MIGRATION = '106_planning_personality_pools.sql';

async function applyMigration(): Promise<void> {
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'src/database/migrations', MIGRATION), 'utf-8');
  await withSchemaLock(async (client) => {
    await client.query(sql);
  });
}

const insertPool = (slug: string) =>
  queryOLTP(
    `INSERT INTO planning.personality_pools (slug, schema_version, payload, content_hash)
     VALUES ($1, 1, jsonb_build_object('slug', $1::text), $2)`,
    [slug, HASH],
  );
const insertLink = (character: string, pool: string) =>
  queryOLTP('INSERT INTO planning.character_pools (character_slug, pool_slug) VALUES ($1, $2)', [character, pool]);

async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('106 planning.personality_pools / character_pools', () => {
  const cleanup = async () => {
    await queryOLTP('DELETE FROM planning.character_pools WHERE pool_slug LIKE $1', [`${PREFIX}\\_%`]);
    await queryOLTP('DELETE FROM planning.personality_pools WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  };

  beforeAll(async () => {
    await applyMigration();
    await cleanup();
  });
  afterAll(cleanup);

  test('is idempotent (re-apply is a no-op)', async () => {
    await expect(applyMigration()).resolves.toBeUndefined();
    await expect(applyMigration()).resolves.toBeUndefined();
  });

  test('the tables have exactly the contract columns', async () => {
    const cols = async (t: string) =>
      (await queryOLTP<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'planning' AND table_name = $1`, [t])).rows
        .map((c) => c.column_name)
        .sort();
    expect(await cols('personality_pools')).toEqual(['content_hash', 'created_at', 'payload', 'retired_at', 'schema_version', 'slug', 'updated_at']);
    expect(await cols('character_pools')).toEqual(['character_slug', 'created_at', 'pool_slug']);
  });

  test('personality_pools: slug CHECK, payload/slug agreement and hash format (23514)', async () => {
    expect(await pgCode(() => insertPool(`${PREFIX}-bad slug`))).toBe('23514');
    expect(await pgCode(() => insertPool(`1${PREFIX}_digit_first`))).toBe('23514');
    expect(
      await pgCode(() =>
        queryOLTP(`INSERT INTO planning.personality_pools (slug, schema_version, payload, content_hash) VALUES ($1, 1, '{"slug":"other"}'::jsonb, $2)`, [`${PREFIX}_mismatch`, HASH]),
      ),
    ).toBe('23514');
    expect(
      await pgCode(() =>
        queryOLTP(`INSERT INTO planning.personality_pools (slug, schema_version, payload, content_hash) VALUES ($1, 1, jsonb_build_object('slug', $1::text), 'nothex')`, [`${PREFIX}_hash`]),
      ),
    ).toBe('23514');
  });

  test('duplicate pool slug is rejected (23505)', async () => {
    await insertPool(`${PREFIX}_dup`);
    expect(await pgCode(() => insertPool(`${PREFIX}_dup`))).toBe('23505');
  });

  test('links: (character, pool) is the primary key, so a repeat is rejected raw (23505)', async () => {
    await insertPool(`${PREFIX}_pk`);
    await insertLink(`${PREFIX}_c`, `${PREFIX}_pk`);
    expect(await pgCode(() => insertLink(`${PREFIX}_c`, `${PREFIX}_pk`))).toBe('23505');
    // ...while a second character on the same pool is the point of the table.
    await expect(insertLink(`${PREFIX}_c2`, `${PREFIX}_pk`)).resolves.toBeDefined();
  });

  test('links: an unknown pool is rejected by the FK (23503); a bad character slug by the CHECK (23514)', async () => {
    expect(await pgCode(() => insertLink(`${PREFIX}_c`, `${PREFIX}_no_such_pool`))).toBe('23503');
    await insertPool(`${PREFIX}_chk`);
    expect(await pgCode(() => insertLink('bad slug', `${PREFIX}_chk`))).toBe('23514');
  });

  test('FK: a pool that still has links cannot be deleted (23503)', async () => {
    await insertPool(`${PREFIX}_held`);
    await insertLink(`${PREFIX}_c`, `${PREFIX}_held`);
    expect(await pgCode(() => queryOLTP('DELETE FROM planning.personality_pools WHERE slug = $1', [`${PREFIX}_held`]))).toBe('23503');
  });

  test('there is NO foreign key from links to the legacy characters table (a link needs no characters row)', async () => {
    const r = await queryOLTP(
      `SELECT 1 FROM pg_constraint WHERE conrelid = 'planning.character_pools'::regclass AND contype = 'f' AND confrelid <> 'planning.personality_pools'::regclass`,
    );
    expect(r.rowCount).toBe(0);
  });

  test('updated_at moves on UPDATE, created_at does not; retired_at keeps the row', async () => {
    await insertPool(`${PREFIX}_touch`);
    const before = await queryOLTP<{ created_at: Date; updated_at: Date }>('SELECT created_at, updated_at FROM planning.personality_pools WHERE slug = $1', [`${PREFIX}_touch`]);
    await new Promise((r) => setTimeout(r, 20));
    await queryOLTP('UPDATE planning.personality_pools SET retired_at = NOW() WHERE slug = $1', [`${PREFIX}_touch`]);
    const after = await queryOLTP<{ created_at: Date; updated_at: Date; retired_at: Date | null }>('SELECT created_at, updated_at, retired_at FROM planning.personality_pools WHERE slug = $1', [`${PREFIX}_touch`]);
    expect(after.rows[0].created_at).toEqual(before.rows[0].created_at);
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
    expect(after.rows[0].retired_at).not.toBeNull();
  });

  describe('grants: planning only', () => {
    const TABLES = ['planning.personality_pools', 'planning.character_pools'];

    test.each(TABLES)('planning has full access to %s', async (table) => {
      for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const r = await queryOLTP<{ ok: boolean }>(`SELECT has_table_privilege('planning', $1, $2) AS ok`, [table, priv]);
        expect(r.rows[0].ok).toBe(true);
      }
    });

    test.each(TABLES)('runtime has no privilege on %s', async (table) => {
      for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        const r = await queryOLTP<{ ok: boolean }>(`SELECT has_table_privilege('runtime', $1, $2) AS ok`, [table, priv]);
        expect(r.rows[0].ok).toBe(false);
      }
    });

    test.each(TABLES)('the ACL of %s names only planning (nothing for PUBLIC, runtime or the app role)', async (table) => {
      const r = await queryOLTP<{ grantee: string }>(
        `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee
           FROM pg_class c, LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
          WHERE c.oid = $1::regclass`,
        [table],
      );
      expect([...new Set(r.rows.map((x) => x.grantee))]).toEqual(['planning']);
    });
  });
});
