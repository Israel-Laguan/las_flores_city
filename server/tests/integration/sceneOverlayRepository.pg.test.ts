import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { oltpPool } from '@las-flores/infra';
import { createSceneDef, createSceneOverlay } from '@las-flores/api-contracts';
import { PgSceneDefRepository } from '../../src/planning/PgSceneDefRepository.js';
import { PgSceneOverlayRepository } from '../../src/planning/PgSceneOverlayRepository.js';
import { sceneOverlayRepositoryContract } from '../helpers/sceneOverlayRepositoryContract.js';

// SC-314: the shared SceneOverlayRepository contract against planning.scene_overlays.
// Collision avoidance: overlay slugs start with `sc314ov`, and the base scenes they point at
// are seeded as `sc314ov_base*` through PgSceneDefRepository (the FK requires real rows).
// Overlays are removed before their scenes in afterAll.
// `...00a2` is this suite's own location literal — `...00a1` belongs to
// scene-composition.e2e.test.ts (and the contract helpers) and must not be reused here
// (no-shared-fixtures guard; see the collision-avoidance rule in AGENTS.md).
const PREFIX = 'sc314ov';
const LOCATION = 'e9900000-0000-4000-8000-0000000000a2';

const scenes = new PgSceneDefRepository();

const cleanup = async () => {
  await oltpPool.query('DELETE FROM planning.scene_overlays WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query('DELETE FROM planning.scene_defs WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
};

sceneOverlayRepositoryContract('PgSceneOverlayRepository', () => new PgSceneOverlayRepository(), {
  slugPrefix: PREFIX,
  seedBase: async (slug) => {
    await scenes.upsertIfChanged(
      createSceneDef({
        id: 'e9900000-0000-4000-8000-0000000000b2',
        slug,
        title: `Base ${slug}`,
        description: 'overlay fixture base',
        location: LOCATION,
      }),
    );
  },
  cleanup,
});

// Foreign-key and never-delete behaviour (SC-317 m-83) is database-only, so it lives here
// rather than in the shared contract, which the in-memory double also runs.
describe('scene_overlays database rules (SC-314 / SC-317)', () => {
  const overlays = new PgSceneOverlayRepository();
  const BASE = `${PREFIX}_fk_base`;

  beforeAll(async () => {
    await scenes.upsertIfChanged(
      createSceneDef({ id: 'e9900000-0000-4000-8000-0000000000b3', slug: BASE, title: 'FK base', description: 'fk', location: LOCATION }),
    );
  });
  afterAll(cleanup);

  test('an overlay for a missing base scene is rejected with a readable error', async () => {
    await expect(
      overlays.create(createSceneOverlay({ slug: `${PREFIX}_orphan`, base_scene_slug: `${PREFIX}_no_such_base` })),
    ).rejects.toThrow(/does not exist/);
  });

  test('retiring an overlay keeps the row', async () => {
    await overlays.create(createSceneOverlay({ slug: `${PREFIX}_keep`, base_scene_slug: BASE }));
    expect((await overlays.retire(`${PREFIX}_keep`)).success).toBe(true);
    const { rows } = await oltpPool.query('SELECT retired_at FROM planning.scene_overlays WHERE slug = $1', [`${PREFIX}_keep`]);
    expect(rows).toHaveLength(1);
    expect(rows[0].retired_at).not.toBeNull();
  });

  test('retiring a scene keeps its row even when it has overlays', async () => {
    expect((await scenes.retire(BASE)).success).toBe(true);
    const { rows } = await oltpPool.query('SELECT retired_at FROM planning.scene_defs WHERE slug = $1', [BASE]);
    expect(rows).toHaveLength(1);
    expect(rows[0].retired_at).not.toBeNull();
  });
});
