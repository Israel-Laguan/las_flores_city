import { InMemoryFlagRegistry } from '@las-flores/api-planning';
import { flagRegistryContract } from '../helpers/flagRegistryContract.js';

// Unit run of the shared FlagRegistry contract (BF-303). Pure in-memory — no DB.
const registry = new InMemoryFlagRegistry();
flagRegistryContract('InMemoryFlagRegistry', () => registry, {
  slugPrefix: 'bf303_mem',
  cleanup: async () => registry.clear(),
});
