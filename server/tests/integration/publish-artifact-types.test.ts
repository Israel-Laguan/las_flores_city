/**
 * SC-M3 T1 — migration 107: the `publish` artifact_type CHECKs accept the two pool kinds.
 *
 *   - 107 is idempotent and leaves the existing kinds (scene, ...) and the grants untouched;
 *   - planning can store `personality_pool` and `character_pools` artifacts and list them in a
 *     revision manifest; runtime reads them back byte for byte;
 *   - an unknown type is still rejected by BOTH tables (23514), so the CHECK was widened, not removed.
 *
 * SC-106 style, raw `pg` clients logged in as the real roles. Collision avoidance: artifact names
 * and revision notes start with `sc_m3_types`, which no other suite uses; rows are removed in
 * afterAll through the owner connection (planning may not DELETE). No test moves the pointer.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createPersonalityPool, stringifyPersonalityPoolArtifact, stringifyCharacterPoolsArtifact } from '@las-flores/api-contracts';
import { buildArtifactRecord } from '@las-flores/api-planning';
import { withSchemaLock } from '../helpers/schemaLock.js';
import { deletePrefixedPublishRows } from '../helpers/pointerLock.js';

const { Client } = pg;
const PREFIX = 'sc_m3_types';
const MIGRATION = '107_publish_pool_artifact_types.sql';
const PLANNING_URL = process.env.PLANNING_DATABASE_URL || 'postgresql://planning:dev_planning@localhost:5434/las_flores';
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL || 'postgresql://runtime:dev_runtime@localhost:5434/las_flores';
const OWNER_URL = process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores';

const sqlstate = async (run: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await run();
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
};

const poolRec = buildArtifactRecord(
  'personality_pool',
  `${PREFIX}_pool`,
  stringifyPersonalityPoolArtifact(createPersonalityPool({ slug: `${PREFIX}_pool`, lines: [{ line_id: 'a', text: 'hi', when: {} }] })),
  '2026-10-10T00:00:00.000Z',
);
const linkRec = buildArtifactRecord(
  'character_pools',
  `${PREFIX}_char`,
  stringifyCharacterPoolsArtifact({ character_slug: `${PREFIX}_char`, pools: [`${PREFIX}_pool`] }),
  '2026-10-10T00:00:00.000Z',
);

const insertArtifact = (c: pg.Client, r: typeof poolRec, type = r.artifact.artifact_type) =>
  c.query(
    `INSERT INTO publish.artifacts (artifact_id, artifact_type, name, manifest_version, payload, size_bytes)
     VALUES ($1, $2, $3, 1, $4, $5)`,
    [r.artifact.artifact_id, type, r.artifact.name, r.payload, r.artifact.size_bytes],
  );

describe('publish artifact types: pool kinds (migration 107)', () => {
  let owner: pg.Client;
  let planning: pg.Client;
  let runtime: pg.Client;
  let revisionId = '';
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

  test('migration 107 is idempotent', async () => {
    await withSchemaLock(async (client) => {
      await client.query(sql());
      await client.query(sql());
    });
  });

  test('planning stores both pool kinds; runtime reads them back byte for byte', async () => {
    await insertArtifact(planning, poolRec);
    await insertArtifact(planning, linkRec);
    const r = await runtime.query('SELECT artifact_id, artifact_type, payload FROM publish.artifacts WHERE name LIKE $1 ORDER BY artifact_type', [`${PREFIX}\\_%`]);
    expect(r.rows.map((x) => x.artifact_type)).toEqual(['character_pools', 'personality_pool']);
    expect(r.rows.find((x) => x.artifact_type === 'personality_pool')!.payload).toBe(poolRec.payload);
    expect(r.rows.find((x) => x.artifact_type === 'character_pools')!.payload).toBe(linkRec.payload);
  });

  test('a revision manifest can list both kinds; runtime sees the entries', async () => {
    const rev = await planning.query(
      `INSERT INTO publish.revisions (manifest_hash, note) VALUES ($1, $2) RETURNING revision_id`,
      ['0'.repeat(64), `${PREFIX} manifest`],
    );
    revisionId = rev.rows[0].revision_id;
    for (const r of [poolRec, linkRec]) {
      await planning.query(
        `INSERT INTO publish.revision_entries (revision_id, artifact_type, name, artifact_id) VALUES ($1, $2, $3, $4)`,
        [revisionId, r.artifact.artifact_type, r.artifact.name, r.artifact.artifact_id],
      );
    }
    const seen = await runtime.query('SELECT artifact_type FROM publish.revision_entries WHERE revision_id = $1 ORDER BY 1', [revisionId]);
    expect(seen.rows.map((x) => x.artifact_type)).toEqual(['character_pools', 'personality_pool']);
  });

  test('an unknown type is still rejected by both tables (CHECK widened, not removed)', async () => {
    const bogus = buildArtifactRecord('scene', `${PREFIX}_bogus`, '{"x":1}', '2026-10-10T00:00:00.000Z');
    expect(await sqlstate(() => insertArtifact(planning, bogus, 'not_a_type'))).toBe('23514');
    expect(
      await sqlstate(() =>
        planning.query(`INSERT INTO publish.revision_entries (revision_id, artifact_type, name, artifact_id) VALUES ($1, 'not_a_type', 'x', $2)`, [
          revisionId,
          poolRec.artifact.artifact_id,
        ]),
      ),
    ).toBe('23514');
  });

  test('the existing kinds still work and the grants did not change (runtime INSERT still denied)', async () => {
    const scene = buildArtifactRecord('scene', `${PREFIX}_scene`, '{"s":1}', '2026-10-10T00:00:00.000Z');
    await insertArtifact(planning, scene);
    expect(await sqlstate(() => insertArtifact(runtime, buildArtifactRecord('personality_pool', `${PREFIX}_denied`, '{"d":1}', '2026-10-10T00:00:00.000Z')))).toBe('42501');
    const acl = await owner.query(`SELECT relacl::text AS acl FROM pg_class WHERE oid = 'publish.artifacts'::regclass`);
    // Exactly 104's ACL: planning INSERT+SELECT, runtime SELECT, nobody else (no PUBLIC, no app role).
    expect(acl.rows[0].acl).toBe('{planning=ar/las_flores,runtime=r/las_flores}');
  });
});
