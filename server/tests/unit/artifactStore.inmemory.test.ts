import { InMemoryArtifactStore } from '@las-flores/api-planning';
import { artifactStoreContract } from '../helpers/artifactStoreContract.js';

// SC-402: the shared ArtifactStore contract against the in-memory implementation. Each factory
// call is a fresh store, so no rows are shared; the slug prefix is unique to this suite anyway.
artifactStoreContract('InMemoryArtifactStore', () => new InMemoryArtifactStore(), { slugPrefix: 'sc402_mem' });
