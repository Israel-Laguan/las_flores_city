import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { oltpPool, queryOLTP } from '@las-flores/infra';
import { createSceneDef, createSceneOverlay, flag, sceneArtifactPayloadFromJSON } from '@las-flores/api-contracts';
import { compileScenes, resolveSceneForPlayer, resolveWeather } from '@las-flores/api-planning';
import { PgSceneDefRepository } from '../../src/planning/PgSceneDefRepository.js';
import { PgSceneOverlayRepository } from '../../src/planning/PgSceneOverlayRepository.js';
import { PgContentLookup } from '../../src/planning/PgContentLookup.js';
import { PgRevisionRepository } from '../../src/planning/PgRevisionRepository.js';
import { acquirePointerLock, deletePrefixedPublishRows } from '../helpers/pointerLock.js';

// SC-404 — SC-M2 exit criterion 3, end to end on Postgres: "the revision pointer flips
// atomically and rolls back by flipping it again", observed from the RUNTIME role.
//
// canon -> compile -> publish (artifacts + revision + flip, one transaction) -> runtime role reads
// the pointer, the manifest and the artifact -> publish v2 -> runtime now sees v2 -> a stale flip
// is rejected -> rollback is a flip back -> runtime sees v1 again, byte for byte.
//
// Collision avoidance: planning slugs, artifact names and revision notes start with `sc404e2e`;
// legacy fixture rows use UUIDs in the dedicated `e9904100-…` range and cast slug
// `sc404e2e_valentina`. The pointer is one global row, so the suite holds the shared advisory lock
// (helpers/pointerLock.ts) and restores any pre-existing pointer on release. Compile is always
// given explicit slugs so other suites' scene rows are never picked up.

const PREFIX = 'sc404e2e';
const DISTRICT = 'e9904100-0000-4000-8000-0000000000d1';
const LOCATION = 'e9904100-0000-4000-8000-0000000000a1';
const CHARACTER = 'e9904100-0000-4000-8000-0000000000c1';
const CAST = `${PREFIX}_valentina`;
const FLAG = `${PREFIX}_pushed`;
const SLUG = `${PREFIX}_gate`;
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL || 'postgresql://runtime:dev_runtime@localhost:5434/las_flores';

const scenes = new PgSceneDefRepository();
const overlays = new PgSceneOverlayRepository();
const revisions = new PgRevisionRepository();
const deps = { scenes, overlays, content: new PgContentLookup() };

let runtime: pg.Client;
let release: () => Promise<void>;

/** Everything the runtime role can learn: the active revision and, through it, the scene artifact. */
async function runtimeView() {
  const active = await runtime.query<{ revision_id: string }>('SELECT revision_id FROM publish.active_revision WHERE singleton');
  const revisionId = active.rows[0]?.revision_id;
  const art = await runtime.query<{ artifact_id: string; payload: string }>(
    `SELECT a.artifact_id, a.payload
       FROM publish.revision_entries e JOIN publish.artifacts a USING (artifact_id)
      WHERE e.revision_id = $1 AND e.artifact_type = 'scene' AND e.name = $2`,
    [revisionId, SLUG],
  );
  const { artifact_id, payload } = art.rows[0];
  expect(createHash('sha256').update(payload).digest('hex')).toBe(artifact_id);
  const parsed = sceneArtifactPayloadFromJSON(JSON.parse(payload));
  const weatherFor = (flags: string[]) => {
    const p = resolveSceneForPlayer(parsed.scene, new Set(flags));
    return resolveWeather(p.scene, parsed.district_weather).weather;
  };
  return { revisionId, artifactId: artifact_id, payload, title: parsed.scene.base.title, off: weatherFor([]), on: weatherFor([FLAG]) };
}

async function cleanup(): Promise<void> {
  await deletePrefixedPublishRows(PREFIX);
  await oltpPool.query('DELETE FROM planning.scene_overlays WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query('DELETE FROM planning.scene_defs WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query(`DELETE FROM entity_aliases WHERE entity_id = ANY($1::uuid[])`, [[LOCATION, CHARACTER]]);
  await oltpPool.query('DELETE FROM scenes WHERE id = $1', [LOCATION]);
  await oltpPool.query('DELETE FROM characters WHERE id = $1', [CHARACTER]);
  await oltpPool.query('DELETE FROM districts WHERE id = $1', [DISTRICT]);
}

describe('SC-404 publish, flip and rollback, observed from the runtime role (Postgres)', () => {
  beforeAll(async () => {
    release = await acquirePointerLock();
    runtime = new pg.Client({ connectionString: RUNTIME_URL, connectionTimeoutMillis: 5000 });
    await runtime.connect();
    await cleanup();
    await queryOLTP(`INSERT INTO districts (id, name, slug, description, x, y, weather) VALUES ($1, 'sc404e2e district', 'sc404e2e-district', 'e2e', 0, 0, 'fog')`, [DISTRICT]);
    await queryOLTP(`INSERT INTO scenes (id, name, description, district_id) VALUES ($1, 'sc404e2e location', 'e2e', $2)`, [LOCATION, DISTRICT]);
    await queryOLTP(`INSERT INTO characters (id, name, description, slug) VALUES ($1, 'sc404e2e valentina', 'e2e', $2)`, [CHARACTER, CAST]);
  }, 30_000);

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await runtime?.end();
      await release();
    }
  });

  test('publish v1 -> publish v2 -> stale flip rejected -> rollback by flipping again', async () => {
    // v1: base scene + a flag-gated rain overlay.
    await scenes.create(
      createSceneDef({
        id: 'e9904100-0000-4000-8000-0000000000b1',
        slug: SLUG,
        title: 'v1 title',
        description: 'e2e',
        location: LOCATION,
        role_slots: [{ slot_id: 'host', cast: CAST, position: 'center' }],
      }),
    );
    await overlays.create(createSceneOverlay({ slug: `${SLUG}_rain`, base_scene_slug: SLUG, priority: 10, availability: flag(FLAG, true), ops: [{ op: 'set_weather', weather: 'rain' }] }));

    const c1 = await compileScenes(deps, { slugs: [SLUG] });
    expect(c1.report.ok).toBe(true);
    const p1 = await revisions.publish({ records: c1.records, expectedActive: null, note: `${PREFIX} v1` });
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;

    const seen1 = await runtimeView();
    expect(seen1.revisionId).toBe(p1.revision.revision_id);
    expect(seen1).toMatchObject({ title: 'v1 title', off: 'fog', on: 'rain' });

    // v2: the scene changes (new title) and the overlay now brings a storm instead of rain.
    await scenes.upsertIfChanged(
      createSceneDef({
        id: 'e9904100-0000-4000-8000-0000000000b1',
        slug: SLUG,
        title: 'v2 title',
        description: 'e2e',
        location: LOCATION,
        role_slots: [{ slot_id: 'host', cast: CAST, position: 'center' }],
      }),
    );
    await overlays.upsertIfChanged(createSceneOverlay({ slug: `${SLUG}_rain`, base_scene_slug: SLUG, priority: 10, availability: flag(FLAG, true), ops: [{ op: 'set_weather', weather: 'storm' }] }));
    const c2 = await compileScenes(deps, { slugs: [SLUG] });
    expect(c2.records[0].artifact.artifact_id).not.toBe(c1.records[0].artifact.artifact_id);
    const p2 = await revisions.publish({ records: c2.records, expectedActive: p1.revision.revision_id, note: `${PREFIX} v2` });
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;

    const seen2 = await runtimeView();
    expect(seen2.revisionId).toBe(p2.revision.revision_id);
    expect(seen2).toMatchObject({ title: 'v2 title', off: 'fog', on: 'storm' });

    // A stale flip (the caller still believes v1 is active) is rejected and changes nothing.
    const stale = await revisions.flip({ to: p1.revision.revision_id, expectedActive: p1.revision.revision_id });
    expect(stale).toMatchObject({ ok: false, actual: p2.revision.revision_id });
    expect((await runtimeView()).revisionId).toBe(p2.revision.revision_id);

    // The runtime role cannot move the pointer itself.
    let code: string | undefined;
    try {
      await runtime.query('UPDATE publish.active_revision SET revision_id = $1', [p1.revision.revision_id]);
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe('42501');
    expect((await runtimeView()).revisionId).toBe(p2.revision.revision_id);

    // Rollback is flipping again.
    const back = await revisions.flip({ to: p1.revision.revision_id, expectedActive: p2.revision.revision_id });
    expect(back).toMatchObject({ ok: true, previous: p2.revision.revision_id });
    const seenBack = await runtimeView();
    expect(seenBack).toEqual(seen1); // identical id, bytes and resolved behaviour as before v2 existed

    // ...and it is reversible: roll forward again.
    expect(await revisions.flip({ to: p2.revision.revision_id, expectedActive: p1.revision.revision_id })).toMatchObject({ ok: true });
    expect(await runtimeView()).toEqual(seen2);

    const log = await revisions.listFlips();
    expect(log.slice(0, 4).map((f) => [f.from_revision_id, f.to_revision_id])).toEqual([
      [p1.revision.revision_id, p2.revision.revision_id],
      [p2.revision.revision_id, p1.revision.revision_id],
      [p1.revision.revision_id, p2.revision.revision_id],
      [null, p1.revision.revision_id],
    ]);
  });

  test('a failed compile never reaches publish: nothing is written and the pointer stays', async () => {
    const before = (await runtimeView()).revisionId;
    await scenes.create(
      createSceneDef({ id: 'e9904100-0000-4000-8000-0000000000b2', slug: `${SLUG}_bad`, title: 't', description: 'd', location: LOCATION, role_slots: [{ slot_id: 'host', cast: `${PREFIX}_nobody`, position: 'left' }] }),
    );
    const c = await compileScenes(deps, { slugs: [`${SLUG}_bad`] });
    expect(c.report.ok).toBe(false);
    expect(c.records).toEqual([]); // nothing to publish: the all-or-nothing compile is the gate
    expect((await runtimeView()).revisionId).toBe(before);
  });
});
