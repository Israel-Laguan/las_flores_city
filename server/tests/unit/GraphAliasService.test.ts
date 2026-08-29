import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock Neo4j so no real graph connection is opened in unit tests. The factory is
// hoisted above the imports; it reads `state.enabled` to flip behavior per test.
const state = { enabled: true };
jest.mock('../../src/services/Neo4jClient.js', () => ({
  isNeo4jEnabled: () => state.enabled,
  runNeo4jQuery: jest.fn(async (cypher: string) => {
    if (cypher.includes('MATCH (c:Content { nodeType: $nodeType, name: $name })')) {
      return [{ nodeId: 'd-city', name: 'City District' }];
    }
    if (cypher.includes('RETURN count(a) AS count')) {
      return [{ count: 2 }];
    }
    return [];
  }),
}));

import { seedAliases, pruneOrphanAliases, loadSeedAliases } from '../../src/services/GraphAliasService.js';
import { runNeo4jQuery } from '../../src/services/Neo4jClient.js';

describe('GraphAliasService', () => {
  beforeEach(() => {
    state.enabled = true;
    (runNeo4jQuery as jest.Mock).mockClear();
  });

  it('loads a curated, reviewed alias list from disk', async () => {
    const aliases = await loadSeedAliases();
    expect(Array.isArray(aliases)).toBe(true);
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases[0]).toHaveProperty('nodeType');
    expect(aliases[0]).toHaveProperty('alias');
    expect(aliases[0]).toHaveProperty('targetName');
  });

  it('seeds aliases as (:Alias)-[:ALIAS_OF]->(:Content) when Neo4j is enabled', async () => {
    const result = await seedAliases();
    expect(result.linked).toBeGreaterThan(0);
    // Every alias whose target node was found triggers an ALIAS_OF MERGE.
    const aliasOfCalls = (runNeo4jQuery as jest.Mock).mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('ALIAS_OF'),
    );
    expect(aliasOfCalls.length).toBe(result.linked);
  });

  it('prunes orphan aliases when Neo4j is enabled', async () => {
    const removed = await pruneOrphanAliases();
    expect(removed).toBe(2);
    const detachCalls = (runNeo4jQuery as jest.Mock).mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('DETACH DELETE a'),
    );
    expect(detachCalls.length).toBe(1);
  });

  it('is a no-op when Neo4j is disabled', async () => {
    state.enabled = false;
    expect(await seedAliases()).toEqual({ linked: 0, skipped: 0 });
    expect(await pruneOrphanAliases()).toBe(0);
  });
});
