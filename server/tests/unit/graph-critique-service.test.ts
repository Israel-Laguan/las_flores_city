/**
 * Unit test for GraphCritiqueService (M27-b) — the graph write/read/cache
 * authority for `:Conflict`/`:Suggestion` nodes. Mocks the Neo4jClient seam so
 * no real bolt connection is opened (AGENTS.md rule 7), and asserts the Cypher
 * shapes emitted by write/read/findCached/status/clear.
 */
import { describe, it, expect, jest as jestGlobals, beforeEach } from '@jest/globals';
import { GraphCritiqueService } from '../../src/services/GraphCritiqueService.js';
import { isNeo4jEnabled, runNeo4jQuery, runNeo4jTransaction } from '../../src/services/Neo4jClient.js';

// Mock the entire Neo4jClient module so GraphCritiqueService (and the
// GraphBaseService `contentKey` it imports) never touch a real driver.
jestGlobals.mock('../../src/services/Neo4jClient.js', () => ({
  isNeo4jEnabled: jestGlobals.fn(() => true),
  runNeo4jQuery: jestGlobals.fn(async () => []),
  runNeo4jTransaction: jestGlobals.fn(async () => undefined),
  verifyNeo4j: jestGlobals.fn(async () => true),
  closeNeo4j: jestGlobals.fn(async () => {}),
}));

const mockEnabled = jestGlobals.mocked(isNeo4jEnabled);
const mockRunQuery = jestGlobals.mocked(runNeo4jQuery);
const mockRunTx = jestGlobals.mocked(runNeo4jTransaction);

const PLAN_ID = 'd0000000-a000-4000-8000-00000000bc01';
const ANN_ID = 'd0000000-b000-4000-8000-00000000bc02';
const CHAR_ID = 'd0000000-c000-4000-8000-00000000bc03';
const HASH = 'a'.repeat(64);

function makeAnnotation(): any {
  return {
    id: ANN_ID,
    type: 'conflict',
    severity: 'error',
    description: 'Name collides with an existing canon character.',
    evidence: [{ nodeType: 'Character', nodeId: CHAR_ID, slug: 'ada', excerpt: 'Ada exists in canon.' }],
    relatedEntities: [],
    scope: 'entity',
    aiModel: 'mock',
    inputHash: HASH,
    status: 'open',
    planId: PLAN_ID,
    itemIds: ['item-1'],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function propsRow(overrides: Record<string, unknown> = {}): { labels: string[]; p: Record<string, unknown>; createdAt: string } {
  return {
    labels: ['Conflict'],
    p: {
      id: ANN_ID,
      type: 'conflict',
      severity: 'error',
      description: 'd',
      evidenceJson: JSON.stringify([{ nodeType: 'Character', nodeId: CHAR_ID, excerpt: 'x' }]),
      relatedEntitiesJson: '[]',
      scope: 'entity',
      aiModel: 'mock',
      inputHash: HASH,
      status: 'open',
      planId: PLAN_ID,
      itemIds: ['item-1'],
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('GraphCritiqueService', () => {
  let service: GraphCritiqueService;

  beforeEach(() => {
    jestGlobals.clearAllMocks();
    mockEnabled.mockReturnValue(true);
    mockRunQuery.mockResolvedValue([]);
    mockRunTx.mockResolvedValue(undefined);
    service = new GraphCritiqueService();
  });

  it('writeAnnotations creates a :Conflict node with a :FLAGGED_IN edge', async () => {
    let txFn: (tx: { run: any }) => Promise<unknown> = undefined as any;
    mockRunTx.mockImplementation(async (fn: any) => {
      txFn = fn;
      return undefined;
    });

    await service.writeAnnotations([makeAnnotation()], { planId: PLAN_ID, scope: 'entity', inputHash: HASH, model: 'mock' });

    const fakeTx = { run: jestGlobals.fn(async () => ({} as any)) };
    await txFn(fakeTx);

    const cyphers = fakeTx.run.mock.calls.map((c: any[]) => c[0] as string);
    expect(fakeTx.run).toHaveBeenCalled();
    // Creates the Conflict node with provenance.
    expect(cyphers.some((c) => c.includes('MERGE (n:Conflict { key: $key })'))).toBe(true);
    expect(cyphers.some((c) => c.includes(':FLAGGED_IN]'))).toBe(true);
    // Node params carry ai_model + input_hash + status (provenance contract).
    const nodeCall = fakeTx.run.mock.calls.find((c: any[]) => `${c[0]}`.includes('MERGE (n:Conflict'));
    expect((nodeCall as any[])[1].props.aiModel).toBe('mock');
    expect((nodeCall as any[])[1].props.inputHash).toBe(HASH);
    expect((nodeCall as any[])[1].props.status).toBe('open');
    // Edge params point at the evidence Content node.
    const edgeCall = fakeTx.run.mock.calls.find((c: any[]) => `${c[0]}`.includes(':FLAGGED_IN]'));
    expect((edgeCall as any[])[1].nt).toBe('Character');
    expect((edgeCall as any[])[1].nid).toBe(CHAR_ID);
  });

  it('writeAnnotations emits a CacheMarker when the plan is clean', async () => {
    let txFn: (tx: { run: any }) => Promise<unknown> = undefined as any;
    mockRunTx.mockImplementation(async (fn: any) => {
      txFn = fn;
      return undefined;
    });
    await service.writeAnnotations([], { planId: PLAN_ID, scope: 'entity', inputHash: HASH, model: 'mock' });
    const fakeTx = { run: jestGlobals.fn(async () => ({} as any)) };
    await txFn(fakeTx);
    const cyphers = fakeTx.run.mock.calls.map((c: any[]) => c[0] as string);
    expect(cyphers.some((c) => c.includes('MERGE (m:CacheMarker'))).toBe(true);
  });

  it('findCached returns mapped annotations + cached flag, excluding markers', async () => {
    mockRunQuery.mockResolvedValue([propsRow()] as any);
    const result = await service.findCached(PLAN_ID, 'entity', HASH, 'mock');
    expect(result).not.toBeNull();
    expect(result!.cached).toBe(true);
    expect(result!.annotations).toHaveLength(1);
    expect(result!.annotations[0].type).toBe('conflict');
    expect(result!.annotations[0].evidence[0].nodeType).toBe('Character');
    // Cache probe is scoped to (plan, scope, hash, aiModel).
    const probeCall = mockRunQuery.mock.calls[0];
    expect((probeCall as any[])[1].inputHash).toBe(HASH);
    expect((probeCall as any[])[1].aiModel).toBe('mock');
  });

  it('findCached returns null on a cache miss', async () => {
    mockRunQuery.mockResolvedValue([]);
    expect(await service.findCached(PLAN_ID, 'entity', HASH, 'mock')).toBeNull();
  });

  it('getAnnotations reads non-dismissed nodes and maps them back', async () => {
    mockRunQuery.mockResolvedValue([propsRow()] as any);
    const annotations = await service.getAnnotations(PLAN_ID);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].planId).toBe(PLAN_ID);
  });

  it('setAnnotationStatus throws when the node does not exist', async () => {
    mockRunQuery.mockResolvedValue([]);
    await expect(service.setAnnotationStatus('missing', 'dismissed')).rejects.toThrow(/not found/i);
  });

  it('markAddressed issues a SET status = addressed', async () => {
    mockRunQuery.mockResolvedValue([{ id: ANN_ID }] as any);
    await service.markAddressed(ANN_ID);
    const call = mockRunQuery.mock.calls[0];
    expect((call as any[])[0]).toContain('SET a.status = $status');
    expect((call as any[])[1].status).toBe('addressed');
  });

  it('clearAnnotations detach-deletes the plan annotation nodes', async () => {
    await service.clearAnnotations(PLAN_ID);
    const call = mockRunQuery.mock.calls[0];
    expect((call as any[])[0]).toContain('DETACH DELETE a');
    expect((call as any[])[1].planId).toBe(PLAN_ID);
  });

  it('no-ops (no graph writes) when NEO4J_ENABLED is off', async () => {
    mockEnabled.mockReturnValue(false);
    await service.writeAnnotations([makeAnnotation()], { planId: PLAN_ID, scope: 'entity', inputHash: HASH, model: 'mock' });
    expect(mockRunTx).not.toHaveBeenCalled();
    expect(await service.findCached(PLAN_ID, 'entity', HASH, 'mock')).toBeNull();
    expect(await service.getAnnotations(PLAN_ID)).toEqual([]);
    expect(await service.countAnnotations(PLAN_ID)).toBe(0);
  });
});

