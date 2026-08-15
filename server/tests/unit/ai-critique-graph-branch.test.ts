/**
 * Unit test: AICritiqueService graph-branch wiring (M27-b). When NEO4J_ENABLED
 * is true, runCritique serves its cache from the graph, persist writes graph
 * nodes, getAnnotations reads the graph, and setAnnotationStatus mirrors to the
 * graph. We inject a mock GraphCritiqueService + mock Neo4jClient + mock infra
 * so no real DB/Neo4j/Redis connections are opened.
 */
import { describe, it, expect, jest as jestGlobals, beforeEach, afterEach } from '@jest/globals';
import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import { AICritiqueService } from '../../src/services/AICritiqueService.js';
import { MockProvider } from '../../src/services/MockProvider.js';
import { isNeo4jEnabled } from '../../src/services/Neo4jClient.js';

jestGlobals.mock('@las-flores/infra', () => ({
  queryOLTP: jestGlobals.fn(),
  withOLTPTransaction: jestGlobals.fn(),
}));

jestGlobals.mock('../../src/services/Neo4jClient.js', () => ({
  isNeo4jEnabled: jestGlobals.fn(() => true),
  runNeo4jQuery: jestGlobals.fn(async () => []),
  runNeo4jTransaction: jestGlobals.fn(async () => undefined),
  verifyNeo4j: jestGlobals.fn(async () => true),
  closeNeo4j: jestGlobals.fn(async () => {}),
}));

const mockQueryOLTP = jestGlobals.mocked(queryOLTP);
const mockWithOLTPTransaction = jestGlobals.mocked(withOLTPTransaction);
const mockEnabled = jestGlobals.mocked(isNeo4jEnabled);

const PLAN_ID = 'd0000000-e000-4000-8000-00000000bd01';
const HASH = 'b'.repeat(64);

// Injected graph double — captures write/replace/cache calls without touching Neo4j.
function makeGraph() {
  return {
    findCached: jestGlobals.fn(async () => null),
    writeAnnotations: jestGlobals.fn(async () => undefined),
    getAnnotations: jestGlobals.fn(async () => []),
    getAnnotation: jestGlobals.fn(async () => null),
    setAnnotationStatus: jestGlobals.fn(async () => undefined),
    clearAnnotations: jestGlobals.fn(async () => undefined),
  };
}

function planRow() {
  return {
    rows: [{
      plan_json: {
        id: PLAN_ID,
        description: 'graph-branch plan',
        items: [{
          id: 'd0000000-1111-4000-8000-00000000bd02',
          type: 'character',
          action: 'create',
          name: 'AdaGraph',
          slug: 'ada_graph',
          fields: { description: 'x' },
          assetNeeds: [],
          dependsOn: [],
        }],
      },
      description: 'graph-branch plan',
    }],
  } as any;
}

describe('AICritiqueService graph branch (M27-b)', () => {
  let service: AICritiqueService;
  let graph: ReturnType<typeof makeGraph>;
  const prev = process.env.NEO4J_ENABLED;

  beforeEach(() => {
    jestGlobals.clearAllMocks();
    jestGlobals.resetAllMocks();
    process.env.NEO4J_ENABLED = 'true';
    mockEnabled.mockReturnValue(true);
    mockWithOLTPTransaction.mockImplementation(async (cb: (client: { query: typeof mockQueryOLTP }) => Promise<unknown>) =>
      cb({ query: mockQueryOLTP }),
    );
    mockQueryOLTP.mockImplementation(async (sql: string) => {
      // Serve the plan-load query; everything else is an empty result.
      if (String(sql).includes('FROM content_plans')) return planRow();
      return { rows: [], rowCount: 0 } as any;
    });
    graph = makeGraph();
    service = new AICritiqueService(new MockProvider(), graph as any);
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.NEO4J_ENABLED;
    else process.env.NEO4J_ENABLED = prev;
  });

  it('runCritique on a cache miss persists annotations to the graph', async () => {
    const result = await service.runCritique(PLAN_ID, 'entity', { neighborhood: emptyContext() });
    expect(result.cached).toBe(false);
    // Postgres durability write still happens (unchanged), graph mirror too.
    expect(mockQueryOLTP).toHaveBeenCalled();
    expect(graph.writeAnnotations).toHaveBeenCalledTimes(1);
    const [written, meta] = graph.writeAnnotations.mock.calls[0] as [any[], any];
    expect(meta.planId).toBe(PLAN_ID);
    expect(meta.model).toBe('mock');
  });

  it('runCritique serves the cache from the graph on an unchanged subgraph', async () => {
    const cached = {
      annotations: [{
        id: 'd0000000-2222-4000-8000-00000000bd03',
        type: 'suggestion',
        severity: 'info',
        description: 'cached',
        evidence: [],
        relatedEntities: [],
        scope: 'entity',
        aiModel: 'mock',
        inputHash: HASH,
        status: 'open',
        planId: PLAN_ID,
        itemIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
      cached: true,
      model: 'mock',
    };
    graph.findCached.mockResolvedValue(cached);

    const result = await service.runCritique(PLAN_ID, 'entity', { neighborhood: emptyContext() });
    expect(result.cached).toBe(true);
    expect(graph.findCached).toHaveBeenCalled();
    // No LLM re-write on a cache hit.
    expect(graph.writeAnnotations).not.toHaveBeenCalled();
  });

  it('getAnnotations reads the graph when enabled', async () => {
    graph.getAnnotations.mockResolvedValue([{ id: 'x', type: 'suggestion' } as any]);
    const annotations = await service.getAnnotations(PLAN_ID);
    expect(graph.getAnnotations).toHaveBeenCalledWith(PLAN_ID);
    expect(annotations).toHaveLength(1);
  });

  it('setAnnotationStatus keeps Postgres and mirrors status to the graph', async () => {
    mockQueryOLTP.mockResolvedValue({ rows: [], rowCount: 1 } as any);
    await service.setAnnotationStatus('ann-1', 'addressed');
    expect(graph.setAnnotationStatus).toHaveBeenCalledWith('ann-1', 'addressed');
  });
});

function emptyContext(): any {
  return { characters: [], scenes: [], dialogues: [], missions: [], overlays: [], locations: [] };
}
