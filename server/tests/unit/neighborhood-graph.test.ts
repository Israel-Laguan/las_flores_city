/**
 * Unit test for Neo4jNeighborhoodProvider (M27-b) — gathers the critique
 * neighborhood from the base `:Content` graph and reassembles the exact
 * `ExistingContentContext` shape the M26 Postgres gatherer produces. Mocks the
 * Neo4jClient + infra seams so no real connections are opened.
 */
import { describe, it, expect, jest as jestGlobals, beforeEach } from '@jest/globals';
import { Neo4jNeighborhoodProvider } from '../../src/services/NeighborhoodProvider.js';
import { isNeo4jEnabled, runNeo4jQuery } from '../../src/services/Neo4jClient.js';

jestGlobals.mock('../../src/services/Neo4jClient.js', () => ({
  isNeo4jEnabled: jestGlobals.fn(() => true),
  runNeo4jQuery: jestGlobals.fn(async () => []),
  runNeo4jTransaction: jestGlobals.fn(async () => undefined),
  verifyNeo4j: jestGlobals.fn(async () => true),
  closeNeo4j: jestGlobals.fn(async () => {}),
}));

// NeighborhoodProvider imports ContentPlanService → @las-flores/infra; mock it
// so module load never opens a real DB (not called in the enabled path).
jestGlobals.mock('@las-flores/infra', () => ({
  queryOLTP: jestGlobals.fn(async () => ({ rows: [] })),
  queryOLAP: jestGlobals.fn(async () => ({ rows: [] })),
  withOLTPTransaction: jestGlobals.fn(),
  getCache: jestGlobals.fn(async () => null),
  setCache: jestGlobals.fn(async () => true),
  deleteCache: jestGlobals.fn(async () => true),
}));

const mockEnabled = jestGlobals.mocked(isNeo4jEnabled);
const mockRunQuery = jestGlobals.mocked(runNeo4jQuery);

function contentRow(nodeType: string, nodeId: string, name: string, props: Record<string, unknown>) {
  return { nodeType, nodeId, name, props };
}

describe('Neo4jNeighborhoodProvider', () => {
  const provider = new Neo4jNeighborhoodProvider();

  beforeEach(() => {
    jestGlobals.clearAllMocks();
    mockEnabled.mockReturnValue(true);
    mockRunQuery.mockResolvedValue([]);
  });

  it('queries the base :Content layer (planId null) and groups into ExistingContentContext', async () => {
    mockRunQuery.mockResolvedValue([
      contentRow('Character', 'c1', 'Ada', { role: 'engineer', faction: 'Anarchs', description: 'Netrunner.' }),
      contentRow('Scene', 's1', 'Fireside', { district: 'Northside', mood: 'tense', description: 'A bar.' }),
      contentRow('Dialogue', 'd1', 'First meet', {}),
      contentRow('Mission', 'm1', 'The Heist', { description: 'Rob the vault.' }),
      contentRow('Overlay', 'o1', 'Rain overlay', {}),
      contentRow('Location', 'l1', 'The Vault', { district: 'Northside', nightlife: 'closed', history: 'old bank' }),
      contentRow('District', 'dist1', 'Northside', {}), // not part of the critique context
    ] as any);

    const ctx = await provider.gatherContext();

    expect(ctx.characters).toHaveLength(1);
    expect(ctx.characters[0]).toMatchObject({ id: 'c1', name: 'Ada', role: 'engineer', faction: 'Anarchs', personality: undefined });
    expect(ctx.scenes[0].name).toBe('Fireside');
    expect(ctx.scenes[0].district).toBe('Northside');
    expect(ctx.dialogues[0].id).toBe('d1');
    // Missions expose title (not name) per ExistingContentContext.
    expect(ctx.missions[0]).toEqual({ id: 'm1', title: 'The Heist', description: 'Rob the vault.' });
    expect(ctx.overlays[0].name).toBe('Rain overlay');
    expect(ctx.locations[0]).toMatchObject({ id: 'l1', name: 'The Vault', district: 'Northside', nightlife: 'closed', history: 'old bank' });
    // District nodes are excluded from the critique context.
    expect(ctx.characters.map((c) => c.id)).not.toContain('dist1');

    // The traversal is scoped to canonical (planId IS null) Content nodes.
    const query = (mockRunQuery.mock.calls[0] as any[])[0] as string;
    expect(query).toContain('c.planId IS null');
  });
});
