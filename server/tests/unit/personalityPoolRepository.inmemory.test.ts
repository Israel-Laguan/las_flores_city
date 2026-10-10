import { InMemoryCharacterPoolRepository, InMemoryPersonalityPoolRepository } from '@las-flores/api-planning';
import { personalityPoolRepositoryContract } from '../helpers/personalityPoolRepositoryContract.js';

// SC-306: the shared pool + link contract against the in-memory implementations. The factory
// builds fresh repositories, so nothing is shared with any other suite.
personalityPoolRepositoryContract(
  'InMemoryPersonalityPoolRepository',
  () => {
    const pools = new InMemoryPersonalityPoolRepository();
    return { pools, links: new InMemoryCharacterPoolRepository(pools) };
  },
  { slugPrefix: 'sc306_mem' },
);
