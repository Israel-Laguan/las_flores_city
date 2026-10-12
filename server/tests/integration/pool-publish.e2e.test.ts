import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { oltpPool, queryOLTP } from '@las-flores/infra';
import {
  characterPoolsArtifactFromBytes,
  createPersonalityPool,
  createSceneDef,
  personalityPoolArtifactFromBytes,
} from '@las-flores/api-contracts';
import { compilePools, compileScenes } from '@las-flores/api-planning';
import { PgSceneDefRepository } from '../../src/planning/PgSceneDefRepository.js';
import { PgSceneOverlayRepository } from '../../src/planning/PgSceneOverlayRepository.js';
import { PgContentLookup } from '../../src/planning/PgContentLookup.js';
import { PgCharacterPoolRepository, PgPersonalityPoolRepository } from '../../src/planning/PgPersonalityPoolRepository.js';
import { PgRevisionRepository } from '../../src/planning/PgRevisionRepository.js';
import { acquirePointerLock, deletePrefixedPublishRows } from '../helpers/pointerLock.js';

// SC-M3 T1 — pool artifacts end to end on Postgres, observed from the RUNTIME role.
//
// canon (scene + pool + links) -> compile scenes AND pools -> ONE publish (one revision, one
// flip) -> the runtime role reads the manifest and the pool/link bytes -> editing the pool
// changes only the pool's artifact id. Also proves adding pool artifacts to a bundle does not
// change a scene artifact's id (scene ids are a function of scene bytes only).
//
// Collision avoidance: planning slugs, artifact names and revision notes start with `scm3pool`;
// legacy fixture rows use UUIDs in the dedicated `e9903300-…` range and character slugs
// `scm3pool_ana` / `scm3pool_bo`. The pointer is one global row, so the suite holds the shared
// advisory lock (helpers/pointerLock.ts). Compile is always given explicit slugs so other
// suites' rows are never picked up.

const PREFIX = 'scm3pool';
const DISTRICT = 'e9903300-0000-4000-8000-0000000000d1';
const LOCATION = 'e9903300-0000-4000-8000-0000000000a1';
const CHARS = { ana: 'e9903300-0000-4000-8000-0000000000c1', bo: 'e9903300-0000-4000-8000-0000000000c2' };
const ANA = `${PREFIX}_ana`;
const BO = `${PREFIX}_bo`;
const POOL = `${PREFIX}_vendor`;
const SCENE = `${PREFIX}_market`;
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL || 'postgresql://runtime:dev_runtime@localhost:5434/las_flores';

const pools = new PgPersonalityPoolRepository();
const links = new PgCharacterPoolRepository();
const scenes = new PgSceneDefRepository();
const content = new PgContentLookup();
const revisions = new PgRevisionRepository();

let runtime: pg.Client;
let release: () => Promise<void>;

const vendorPool = (text: string) => createPersonalityPool({ slug: POOL, lines: [{ line_id: 'hello', text, when: {} }] });
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function compileAll() {
  const s = await compileScenes({ scenes, overlays: new PgSceneOverlayRepository(), content }, { slugs: [SCENE] });
  const p = await compilePools({ pools, links, content }, { slugs: [POOL] });
  expect(s.report.ok).toBe(true);
  expect(p.ok).toBe(true);
  return { scene: s.records, pools: p.records, all: [...s.records, ...p.records] };
}

/** What the runtime role can learn from the active revision: manifest entries and verified bytes. */
async function runtimeView() {
  const active = await runtime.query<{ revision_id: string }>('SELECT revision_id FROM publish.active_revision WHERE singleton');
  const revisionId = active.rows[0].revision_id;
  const rows = await runtime.query<{ artifact_type: string; name: string; artifact_id: string; payload: string }>(
    `SELECT e.artifact_type, e.name, a.artifact_id, a.payload
       FROM publish.revision_entries e JOIN publish.artifacts a USING (artifact_id)
      WHERE e.revision_id = $1 ORDER BY e.artifact_type, e.name`,
    [revisionId],
  );
  for (const r of rows.rows) expect(sha(r.payload)).toBe(r.artifact_id);
  return { revisionId, entries: rows.rows };
}

async function cleanup(): Promise<void> {
  await deletePrefixedPublishRows(PREFIX);
  await oltpPool.query('DELETE FROM planning.scene_overlays WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query('DELETE FROM planning.scene_defs WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query('DELETE FROM planning.character_pools WHERE pool_slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query('DELETE FROM planning.personality_pools WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query(`DELETE FROM entity_aliases WHERE entity_id = ANY($1::uuid[])`, [[LOCATION, ...Object.values(CHARS)]]);
  await oltpPool.query('DELETE FROM scenes WHERE id = $1', [LOCATION]);
  await oltpPool.query('DELETE FROM characters WHERE id = ANY($1::uuid[])', [Object.values(CHARS)]);
  await oltpPool.query('DELETE FROM districts WHERE id = $1', [DISTRICT]);
}

describe('SC-M3 T1: pool artifacts in a revision, observed from the runtime role (Postgres)', () => {
  beforeAll(async () => {
    release = await acquirePointerLock();
    runtime = new pg.Client({ connectionString: RUNTIME_URL, connectionTimeoutMillis: 5000 });
    await runtime.connect();
    await cleanup();
    await queryOLTP(`INSERT INTO districts (id, name, slug, description, x, y, weather) VALUES ($1, 'scm3pool district', 'scm3pool-district', 'e2e', 0, 0, 'fog')`, [DISTRICT]);
    await queryOLTP(`INSERT INTO scenes (id, name, description, district_id) VALUES ($1, 'scm3pool location', 'e2e', $2)`, [LOCATION, DISTRICT]);
    await queryOLTP(`INSERT INTO characters (id, name, description, slug) VALUES ($1, 'scm3pool ana', 'e2e', $2), ($3, 'scm3pool bo', 'e2e', $4)`, [CHARS.ana, ANA, CHARS.bo, BO]);
  }, 30_000);

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await runtime?.end();
      await release();
    }
  });

  test('scene + pool artifacts publish in one revision; scene ids ignore the pools; editing a pool moves only its id', async () => {
    await scenes.create(
      createSceneDef({
        id: 'e9903300-0000-4000-8000-0000000000b1',
        slug: SCENE,
        title: 'Market',
        description: 'e2e',
        location: LOCATION,
        role_slots: [
          { slot_id: 'stall', cast: ANA, position: 'left' },
          { slot_id: 'passerby', cast: BO, position: 'right' },
        ],
      }),
    );
    // Compiled BEFORE any pool canon exists: the id every later compile must reproduce.
    const sceneOnly = await compileScenes({ scenes, overlays: new PgSceneOverlayRepository(), content }, { slugs: [SCENE] });
    const sceneIdBefore = sceneOnly.records[0].artifact.artifact_id;

    await pools.create(vendorPool('Fresh today!'));
    await links.link(ANA, POOL);
    await links.link(BO, POOL);
    const v1 = await compileAll();
    expect(v1.scene[0].artifact.artifact_id).toBe(sceneIdBefore);
    expect(v1.all.map((r) => `${r.artifact.artifact_type}:${r.artifact.name}`).sort()).toEqual([
      `character_pools:${ANA}`,
      `character_pools:${BO}`,
      `personality_pool:${POOL}`,
      `scene:${SCENE}`,
    ]);

    const p1 = await revisions.publish({ records: v1.all, expectedActive: null, note: `${PREFIX} v1` });
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;

    // The runtime role sees all four entries and can verify and parse every byte.
    const seen1 = await runtimeView();
    expect(seen1.revisionId).toBe(p1.revision.revision_id);
    expect(seen1.entries.map((e) => `${e.artifact_type}:${e.name}`)).toEqual([
      `character_pools:${ANA}`,
      `character_pools:${BO}`,
      `personality_pool:${POOL}`,
      `scene:${SCENE}`,
    ]);
    const poolEntry = seen1.entries.find((e) => e.artifact_type === 'personality_pool')!;
    expect(personalityPoolArtifactFromBytes(poolEntry.payload)).toEqual(vendorPool('Fresh today!'));
    for (const e of seen1.entries.filter((x) => x.artifact_type === 'character_pools')) {
      expect(characterPoolsArtifactFromBytes(e.payload).pools).toEqual([POOL]);
    }

    // Edit the pool: only the pool's id changes; scene and link artifacts keep theirs.
    await pools.upsertIfChanged(vendorPool('Special today!'));
    const v2 = await compileAll();
    const idOf = (set: typeof v1, type: string, name: string) => set.all.find((r) => r.artifact.artifact_type === type && r.artifact.name === name)!.artifact.artifact_id;
    expect(idOf(v2, 'personality_pool', POOL)).not.toBe(idOf(v1, 'personality_pool', POOL));
    expect(idOf(v2, 'scene', SCENE)).toBe(idOf(v1, 'scene', SCENE));
    expect(idOf(v2, 'character_pools', ANA)).toBe(idOf(v1, 'character_pools', ANA));

    const p2 = await revisions.publish({ records: v2.all, expectedActive: p1.revision.revision_id, note: `${PREFIX} v2` });
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;
    expect(p2.artifacts.created).toEqual([idOf(v2, 'personality_pool', POOL)]);
    expect(p2.artifacts.unchanged).toHaveLength(3);
  });
});
