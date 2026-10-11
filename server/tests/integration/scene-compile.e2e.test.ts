import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { oltpPool, queryOLTP } from '@las-flores/infra';
import {
  createSceneDef,
  createSceneOverlay,
  flag,
  sceneArtifactPayloadFromJSON,
  type SceneOverlay,
} from '@las-flores/api-contracts';
import { compileScenes, resolveSceneForPlayer, resolveWeather } from '@las-flores/api-planning';
import { PgSceneDefRepository } from '../../src/planning/PgSceneDefRepository.js';
import { PgSceneOverlayRepository } from '../../src/planning/PgSceneOverlayRepository.js';
import { PgContentLookup } from '../../src/planning/PgContentLookup.js';
import { PgArtifactStore } from '../../src/planning/PgArtifactStore.js';

// SC-402/403/405 — SC-M2 exit criterion 1, end to end through the real Postgres adapters:
// canon (planning.*) -> compile -> publish.artifacts -> read back AS THE runtime ROLE ->
// strict parse -> per-player resolve as a flag flips.
//
// Collision avoidance: every planning slug / artifact name starts with `sc402e2e_`, and the
// legacy fixture rows (district, location scene, character) use UUIDs in the dedicated
// `e9902000-…` range plus slug `sc402e2e_valentina`; nothing else uses either. All rows are
// removed in afterAll (artifacts, overlays, scenes, then legacy rows + their alias rows).
// Compile is always given explicit slugs so other suites' scene rows are never picked up.

const PREFIX = 'sc402e2e';
const DISTRICT = 'e9902000-0000-4000-8000-0000000000d1';
const LOCATION = 'e9902000-0000-4000-8000-0000000000a1';
const CHARACTER = 'e9902000-0000-4000-8000-0000000000c1';
const CAST = `${PREFIX}_valentina`;
const FLAG = `${PREFIX}_pushed`;
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL || 'postgresql://runtime:dev_runtime@localhost:5434/las_flores';

const scenes = new PgSceneDefRepository();
const overlays = new PgSceneOverlayRepository();
const store = new PgArtifactStore();
const deps = { scenes, overlays, content: new PgContentLookup() };

const baseScene = (slug: string) =>
  createSceneDef({
    id: 'e9902000-0000-4000-8000-0000000000b1',
    slug,
    title: `Title ${slug}`,
    description: 'e2e',
    location: LOCATION,
    dialogue_refs: ['some_dialogue'],
    role_slots: [{ slot_id: 'host', cast: CAST, position: 'center' }],
  });

const rain = (base: string, slug = `${base}_rain`, priority = 10): SceneOverlay =>
  createSceneOverlay({
    slug,
    base_scene_slug: base,
    priority,
    availability: flag(FLAG, true),
    ops: [{ op: 'set_weather', weather: 'rain' }],
  });

let runtime: pg.Client;

async function cleanup(): Promise<void> {
  await oltpPool.query('DELETE FROM publish.artifacts WHERE name LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query('DELETE FROM planning.scene_overlays WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query('DELETE FROM planning.scene_defs WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query(`DELETE FROM entity_aliases WHERE entity_id = ANY($1::uuid[])`, [[LOCATION, CHARACTER]]);
  await oltpPool.query('DELETE FROM scenes WHERE id = $1', [LOCATION]);
  await oltpPool.query('DELETE FROM characters WHERE id = $1', [CHARACTER]);
  await oltpPool.query('DELETE FROM districts WHERE id = $1', [DISTRICT]);
}

describe('SC-402 scene compile: base + flag-gated overlay -> artifact -> resolve as the flag flips (Postgres)', () => {
  beforeAll(async () => {
    runtime = new pg.Client({ connectionString: RUNTIME_URL, connectionTimeoutMillis: 5000 });
    await runtime.connect();
    await cleanup();
    await queryOLTP(
      `INSERT INTO districts (id, name, slug, description, x, y, weather) VALUES ($1, 'sc402e2e district', 'sc402e2e-district', 'e2e', 0, 0, 'fog')`,
      [DISTRICT],
    );
    await queryOLTP(`INSERT INTO scenes (id, name, description, district_id) VALUES ($1, 'sc402e2e location', 'e2e', $2)`, [LOCATION, DISTRICT]);
    await queryOLTP(`INSERT INTO characters (id, name, description, slug) VALUES ($1, 'sc402e2e valentina', 'e2e', $2)`, [CHARACTER, CAST]);
  }, 30_000);

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await runtime?.end();
    }
  });

  test('compile -> publish -> runtime reads the artifact -> the SAME artifact resolves differently as the flag flips', async () => {
    const slug = `${PREFIX}_gate`;
    await scenes.create(baseScene(slug));
    await overlays.create(rain(slug));

    const { report, records } = await compileScenes(deps, { slugs: [slug] });
    expect(report.ok).toBe(true);
    expect(records).toHaveLength(1);
    const id = records[0].artifact.artifact_id;
    // Honest about what could not be verified: legacy dialogues have no slug identity.
    expect(report.scenes[0].issues).toEqual([expect.objectContaining({ code: 'COMPILE_DIALOGUE_REFS_UNVERIFIED', severity: 'hint' })]);

    expect(await store.putMany(records)).toEqual({ created: [id], unchanged: [] });

    // Read as the runtime role: SELECT-only access to publish, no access to planning.
    const { rows } = await runtime.query<{ payload: string }>('SELECT payload FROM publish.artifacts WHERE artifact_id = $1', [id]);
    expect(createHash('sha256').update(rows[0].payload).digest('hex')).toBe(id);
    const payload = sceneArtifactPayloadFromJSON(JSON.parse(rows[0].payload));

    expect(payload.district_weather).toBe('fog'); // snapshot of districts.weather (A6)
    expect(payload.scene.layers.map((l) => l.slug)).toEqual([`${slug}_rain`]);

    const off = resolveSceneForPlayer(payload.scene, new Set());
    const on = resolveSceneForPlayer(payload.scene, new Set([FLAG]));
    expect(off.active_layers).toEqual([]);
    expect(resolveWeather(off.scene, payload.district_weather)).toEqual({ weather: 'fog', source: 'district' });
    expect(on.active_layers).toEqual([`${slug}_rain`]);
    expect(resolveWeather(on.scene, payload.district_weather)).toEqual({ weather: 'rain', source: `overlay:${slug}_rain` });
  });

  test('recompiling unchanged canon is a skip: same id, `unchanged`, the row is not rewritten (SC-403)', async () => {
    const slug = `${PREFIX}_idem`;
    await scenes.create(baseScene(slug));
    await overlays.create(rain(slug));
    const first = await compileScenes(deps, { slugs: [slug] });
    await store.putMany(first.records);
    const id = first.records[0].artifact.artifact_id;
    const before = await queryOLTP<{ created_at: Date; xmin: string }>('SELECT created_at, xmin::text FROM publish.artifacts WHERE artifact_id = $1', [id]);

    const second = await compileScenes(deps, { slugs: [slug] });
    expect(second.records[0].artifact.artifact_id).toBe(id);
    expect(await store.putMany(second.records)).toEqual({ created: [], unchanged: [id] });
    const after = await queryOLTP<{ created_at: Date; xmin: string }>('SELECT created_at, xmin::text FROM publish.artifacts WHERE artifact_id = $1', [id]);
    expect(after.rows[0]).toEqual(before.rows[0]); // same creation time AND same row version: untouched
  });

  test('a district weather change produces a new artifact id on recompile (D8)', async () => {
    const slug = `${PREFIX}_weather`;
    await scenes.create(baseScene(slug));
    const a = (await compileScenes(deps, { slugs: [slug] })).records[0].artifact.artifact_id;
    await queryOLTP(`UPDATE districts SET weather = 'smog' WHERE id = $1`, [DISTRICT]);
    try {
      const b = (await compileScenes(deps, { slugs: [slug] })).records[0].artifact.artifact_id;
      expect(b).not.toBe(a);
    } finally {
      await queryOLTP(`UPDATE districts SET weather = 'fog' WHERE id = $1`, [DISTRICT]);
    }
  });

  test('equal-priority co-satisfiable exclusive overlays fail the compile and NOTHING is written (SC-304)', async () => {
    const slug = `${PREFIX}_conflict`;
    await scenes.create(baseScene(slug));
    await overlays.create(rain(slug, `${slug}_a`, 3));
    await overlays.create(
      createSceneOverlay({ slug: `${slug}_b`, base_scene_slug: slug, priority: 3, availability: flag(`${PREFIX}_other`, true), ops: [{ op: 'set_weather', weather: 'storm' }] }),
    );
    const { report, records } = await compileScenes(deps, { slugs: [slug] });
    expect(report.ok).toBe(false);
    expect(records).toEqual([]);
    expect(report.scenes[0].issues).toContainEqual(expect.objectContaining({ code: 'SCENE_EXCLUSIVE_CONFLICT', severity: 'error' }));
    const rows = await queryOLTP('SELECT 1 FROM publish.artifacts WHERE name = $1', [slug]);
    expect(rows.rowCount).toBe(0);
  });

  test('missing required content is a machine-readable error: unknown location and unknown cast', async () => {
    const slug = `${PREFIX}_missing`;
    await scenes.create(
      createSceneDef({
        id: 'e9902000-0000-4000-8000-0000000000b2',
        slug,
        title: 't',
        description: 'd',
        location: 'e9902000-0000-4000-8000-0000000000ff', // no such location row
        role_slots: [{ slot_id: 'host', cast: `${PREFIX}_nobody`, position: 'left' }],
      }),
    );
    const { report, records } = await compileScenes(deps, { slugs: [slug] });
    expect(records).toEqual([]);
    expect(report.scenes[0].issues.map((i) => `${i.code}@${i.path}`).sort()).toEqual([
      'COMPILE_CAST_CHARACTER_MISSING@role_slots[0].cast',
      'COMPILE_LOCATION_MISSING@location',
    ]);
  });
});
