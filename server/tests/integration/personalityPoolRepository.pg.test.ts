import { oltpPool } from '@las-flores/infra';
import { PgCharacterPoolRepository, PgPersonalityPoolRepository } from '../../src/planning/PgPersonalityPoolRepository.js';
import { personalityPoolRepositoryContract } from '../helpers/personalityPoolRepositoryContract.js';

// SC-306: the shared pool + link contract against planning.personality_pools / character_pools
// (Postgres). Collision avoidance: every slug starts with `sc306_pg`, which no other suite or
// content file uses; rows are removed in afterAll (links before pools — FK).
const PREFIX = 'sc306_pg';

personalityPoolRepositoryContract(
  'PgPersonalityPoolRepository',
  () => ({ pools: new PgPersonalityPoolRepository(), links: new PgCharacterPoolRepository() }),
  {
    slugPrefix: PREFIX,
    cleanup: async () => {
      await oltpPool.query('DELETE FROM planning.character_pools WHERE pool_slug LIKE $1', [`${PREFIX}\\_%`]);
      await oltpPool.query('DELETE FROM planning.personality_pools WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
    },
  },
);
