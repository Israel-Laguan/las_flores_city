import { InMemoryArtifactStore, InMemoryRevisionRepository } from '@las-flores/api-planning';
import { RevisionScopedLookup } from '@las-flores/api-runtime';
import { runtimeLookupContract } from '../helpers/runtimeLookupContract.js';

// SC-502: the shared runtime lookup contract over planning's in-memory store and repository. They
// satisfy runtime's read ports structurally (`StoredArtifact` == `ArtifactRecord`), with no adapter,
// which is also what proves the read contract and the planning store cannot drift apart.
runtimeLookupContract(
  'in-memory',
  () => {
    const store = new InMemoryArtifactStore();
    const repo = new InMemoryRevisionRepository(store);
    return { repo, lookup: new RevisionScopedLookup({ revisions: repo, artifacts: store }) };
  },
  { slugPrefix: 'sc502_mem' },
);
