import { InMemorySceneDefRepository } from '@las-flores/api-planning';
import { sceneRepositoryContract } from '../helpers/sceneRepositoryContract.js';

// SC-311: the shared SceneDefRepository contract against the in-memory implementation.
// No rows are shared (each factory call is a fresh store); the prefix is kept for parity
// with the Postgres run in F1, which must not collide with any other suite.
sceneRepositoryContract('InMemorySceneDefRepository', () => new InMemorySceneDefRepository(), {
  slugPrefix: 'sc311_mem',
});
