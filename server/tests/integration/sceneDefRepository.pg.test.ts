import { oltpPool } from '@las-flores/infra';
import { PgSceneDefRepository } from '../../src/planning/PgSceneDefRepository.js';
import { sceneRepositoryContract } from '../helpers/sceneRepositoryContract.js';

// SC-314: the shared SceneDefRepository contract against planning.scene_defs (Postgres).
// Collision avoidance: every slug starts with `sc314_pg`, which no other suite or content
// file uses; rows are removed in afterAll.
const PREFIX = 'sc314_pg';

sceneRepositoryContract('PgSceneDefRepository', () => new PgSceneDefRepository(), {
  slugPrefix: PREFIX,
  cleanup: async () => {
    await oltpPool.query('DELETE FROM planning.scene_defs WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  },
});
