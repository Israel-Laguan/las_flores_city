import { InMemoryArtifactStore, InMemoryRevisionRepository } from '@las-flores/api-planning';
import { RevisionScopedLookup } from '@las-flores/api-runtime';
import { sessionPinContract } from '../helpers/sessionPinContract.js';

// SC-504: the shared session-pin contract over planning's in-memory store and repository.
sessionPinContract(
  'in-memory',
  () => {
    const store = new InMemoryArtifactStore();
    const repo = new InMemoryRevisionRepository(store);
    return { repo, revisions: repo, lookup: new RevisionScopedLookup({ revisions: repo, artifacts: store }) };
  },
  { slugPrefix: 'sc504_mem' },
);
