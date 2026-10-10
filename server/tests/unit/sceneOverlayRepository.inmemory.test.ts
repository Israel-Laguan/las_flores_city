import { InMemorySceneOverlayRepository } from '@las-flores/api-planning';
import { sceneOverlayRepositoryContract } from '../helpers/sceneOverlayRepositoryContract.js';

// SC-314: the shared SceneOverlayRepository contract against the in-memory implementation.
// Each factory call is a fresh store, so no rows are shared. The in-memory double does not
// model the base-scene FK; that behaviour is covered by the Postgres integration suite.
sceneOverlayRepositoryContract('InMemorySceneOverlayRepository', () => new InMemorySceneOverlayRepository(), {
  slugPrefix: 'sc314_mem',
  seedBase: async () => {},
});
