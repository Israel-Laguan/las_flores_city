import { oltpPool } from '@las-flores/infra';
import { PgFlagRegistry } from '../../src/planning/PgFlagRegistry.js';
import { flagRegistryContract } from '../helpers/flagRegistryContract.js';

// Integration run of the shared FlagRegistry contract against planning.flag_definitions
// (BF-303). Collision avoidance: every slug starts with `bf303_pg`, which no other
// suite or content file uses; rows are removed in afterAll.
const PREFIX = 'bf303_pg';

flagRegistryContract('PgFlagRegistry', () => new PgFlagRegistry(), {
  slugPrefix: PREFIX,
  cleanup: async () => {
    await oltpPool.query('DELETE FROM planning.flag_definitions WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  },
});
