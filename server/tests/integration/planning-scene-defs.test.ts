import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { queryOLTP } from '@las-flores/infra';
import { withSchemaLock } from '../helpers/schemaLock.js';

// SC-311 — migration 101: planning.scene_defs / planning.scene_overlays.
// Collision avoidance: every row slug starts with `sc311_pg`, which no other suite or
// content file uses; rows are removed in afterAll (overlays first — FK).
const PREFIX = 'sc311_pg';
const HASH = 'a'.repeat(64);
const MIGRATION = '101_planning_scene_defs.sql';

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'src/database/migrations', filename), 'utf-8');
  await withSchemaLock(async (client) => {
    await client.query(sql);
  });
}

const insertScene = (slug: string) =>
  queryOLTP(
    `INSERT INTO planning.scene_defs (slug, schema_version, payload, content_hash)
     VALUES ($1, 1, jsonb_build_object('slug', $1::text), $2)`,
    [slug, HASH],
  );

const insertOverlay = (slug: string, base: string, priority = 0) =>
  queryOLTP(
    `INSERT INTO planning.scene_overlays (slug, base_scene_slug, priority, payload, content_hash)
     VALUES ($1, $2, $3, '{}'::jsonb, $4)`,
    [slug, base, priority, HASH],
  );

async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('101 planning.scene_defs / scene_overlays', () => {
  const cleanup = async () => {
    await queryOLTP(`DELETE FROM planning.scene_overlays WHERE slug LIKE $1`, [`${PREFIX}\\_%`]);
    await queryOLTP(`DELETE FROM planning.scene_defs WHERE slug LIKE $1`, [`${PREFIX}\\_%`]);
  };

  beforeAll(async () => {
    await applyMigration(MIGRATION);
    await cleanup();
  });
  afterAll(cleanup);

  test('is idempotent (re-apply is a no-op)', async () => {
    await expect(applyMigration(MIGRATION)).resolves.toBeUndefined();
    await expect(applyMigration(MIGRATION)).resolves.toBeUndefined();
  });

  test('scene_defs has the contract columns', async () => {
    const r = await queryOLTP<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'planning' AND table_name = 'scene_defs'`,
    );
    const cols = Object.fromEntries(r.rows.map((c) => [c.column_name, c]));
    expect(Object.keys(cols).sort()).toEqual(
      ['content_hash', 'created_at', 'payload', 'retired_at', 'schema_version', 'slug', 'updated_at'],
    );
    expect(cols.payload.data_type).toBe('jsonb');
    expect(cols.payload.is_nullable).toBe('NO');
    expect(cols.retired_at.is_nullable).toBe('YES');
  });

  test('scene_overlays has the contract columns', async () => {
    const r = await queryOLTP<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'planning' AND table_name = 'scene_overlays'`,
    );
    expect(r.rows.map((c) => c.column_name).sort()).toEqual(
      ['base_scene_slug', 'content_hash', 'created_at', 'payload', 'priority', 'retired_at', 'slug', 'updated_at'],
    );
  });

  test('slug is the primary key of both tables', async () => {
    for (const table of ['scene_defs', 'scene_overlays']) {
      const r = await queryOLTP<{ attname: string }>(
        `SELECT a.attname FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [`planning.${table}`],
      );
      expect(r.rows.map((x) => x.attname)).toEqual(['slug']);
    }
  });

  test('rejects an invalid slug, a payload/slug mismatch and a bad hash (CHECK 23514)', async () => {
    expect(await pgCode(() => insertScene(`${PREFIX}-bad slug`))).toBe('23514');
    expect(await pgCode(() => insertScene(`1${PREFIX}_digit_first`))).toBe('23514');
    expect(
      await pgCode(() =>
        queryOLTP(
          `INSERT INTO planning.scene_defs (slug, schema_version, payload, content_hash)
           VALUES ($1, 1, '{"slug":"someone_else"}'::jsonb, $2)`,
          [`${PREFIX}_mismatch`, HASH],
        ),
      ),
    ).toBe('23514');
    expect(
      await pgCode(() =>
        queryOLTP(
          `INSERT INTO planning.scene_defs (slug, schema_version, payload, content_hash)
           VALUES ($1, 1, jsonb_build_object('slug', $1::text), 'nothex')`,
          [`${PREFIX}_hash`],
        ),
      ),
    ).toBe('23514');
  });

  test('duplicate slug is rejected (23505)', async () => {
    await insertScene(`${PREFIX}_dup`);
    expect(await pgCode(() => insertScene(`${PREFIX}_dup`))).toBe('23505');
  });

  test('FK: an overlay needs an existing base scene (23503)', async () => {
    expect(await pgCode(() => insertOverlay(`${PREFIX}_ov_orphan`, `${PREFIX}_no_such_scene`))).toBe('23503');
    await insertScene(`${PREFIX}_base`);
    await expect(insertOverlay(`${PREFIX}_ov_ok`, `${PREFIX}_base`, 10)).resolves.toBeDefined();
  });

  test('FK: a scene that still has overlays cannot be deleted (23503)', async () => {
    await insertScene(`${PREFIX}_held`);
    await insertOverlay(`${PREFIX}_ov_held`, `${PREFIX}_held`);
    expect(
      await pgCode(() => queryOLTP('DELETE FROM planning.scene_defs WHERE slug = $1', [`${PREFIX}_held`])),
    ).toBe('23503');
  });

  test('updated_at moves on UPDATE, created_at does not; retired_at keeps the row', async () => {
    await insertScene(`${PREFIX}_touch`);
    const before = await queryOLTP<{ created_at: Date; updated_at: Date }>(
      'SELECT created_at, updated_at FROM planning.scene_defs WHERE slug = $1',
      [`${PREFIX}_touch`],
    );
    await new Promise((r) => setTimeout(r, 20));
    await queryOLTP('UPDATE planning.scene_defs SET retired_at = NOW() WHERE slug = $1', [`${PREFIX}_touch`]);
    const after = await queryOLTP<{ created_at: Date; updated_at: Date; retired_at: Date | null }>(
      'SELECT created_at, updated_at, retired_at FROM planning.scene_defs WHERE slug = $1',
      [`${PREFIX}_touch`],
    );
    expect(after.rows[0].created_at).toEqual(before.rows[0].created_at);
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
    expect(after.rows[0].retired_at).not.toBeNull();
  });

  describe('grants: planning only', () => {
    const TABLES = ['planning.scene_defs', 'planning.scene_overlays'];

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

    test.each(TABLES)('the ACL of %s names only planning (nothing for PUBLIC or runtime)', async (table) => {
      const r = await queryOLTP<{ grantee: string }>(
        `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee
         FROM pg_class c, LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
         WHERE c.oid = $1::regclass`,
        [table],
      );
      const grantees = [...new Set(r.rows.map((x) => x.grantee))];
      expect(grantees).not.toContain('PUBLIC');
      expect(grantees).not.toContain('runtime');
      expect(grantees).toContain('planning');
    });
  });
});
