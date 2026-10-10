import { InMemoryArtifactStore, InMemoryRevisionRepository } from '@las-flores/api-planning';
import { revisionRepositoryContract } from '../helpers/revisionRepositoryContract.js';

// SC-404: the shared RevisionRepository contract against the in-memory implementation. `make()`
// builds a fresh store and repository per test, so nothing is shared between tests or suites.
revisionRepositoryContract(
  'InMemoryRevisionRepository',
  () => {
    const store = new InMemoryArtifactStore();
    return { repo: new InMemoryRevisionRepository(store), store };
  },
  { slugPrefix: 'sc404_mem' },
);
