import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import type { Mock } from 'jest-mock';
import {
  GraphDeltaSchema,
  GraphDeltaEdgeSchema,
  GraphDeltaOpSchema,
  GraphNodeTypeSchema,
  type GraphContentNode,
  type GraphDelta,
  type GraphEdge,
  type GraphImpactAnalysis,
  type GraphMergedView,
} from '@las-flores/shared';

// M27 — mock the Neo4j seam (AGENTS.md rule: unit tests must never open real
// Neo4j/Redis TCP connections). All graph services go through Neo4jClient, so
// stubbing it here keeps every test DB/Neo4j-free.
jest.mock('../../src/services/Neo4jClient.js', () => ({
  isNeo4jEnabled: jest.fn(() => true),
  runNeo4jQuery: jest.fn(async () => []),
  // mockTx is mock-prefixed so the hoisted factory may reference it; it is read
  // lazily at call time (set in beforeEach), never at module load.
  runNeo4jTransaction: jest.fn(async (fn: any) => fn(mockTx)),
}));

import { isNeo4jEnabled, runNeo4jQuery } from '../../src/services/Neo4jClient.js';
import {
  ensureGraphConstraints,
  upsertContentNode,
  upsertContentRelationship,
  countContentNodes,
  hasContentNode,
} from '../../src/services/GraphBaseService.js';
import {
  applyDelta,
  getDeltasForPlan,
  clearDeltasForPlan,
  countDeltasForPlan,
  summarizeDeltasForPlan,
  buildPlanRevisionFromDeltasAndEdges,
  getPlanDeltaRevisionWithEdges,
  nameValuedEdgeRevisionPart,
} from '../../src/services/GraphDeltaService.js';
import { getMergedView, getImpactAnalysis, countAllDeltas, detectCycles } from '../../src/services/GraphQueryService.js';

const mockEnabled = isNeo4jEnabled as unknown as Mock<() => boolean>;
const mockQuery = runNeo4jQuery as unknown as Mock<(c: string, p: Record<string, unknown>) => Promise<any[]>>;

// Dummy transaction object handed to `runNeo4jTransaction`'s callback. Set to a
// fresh default in beforeEach; the revision-wiring test overrides `.run`.
let mockTx: { run: Mock; [k: string]: unknown } = { run: jest.fn() };

const PLAN_ID = 'e0000000-e29b-41d4-a716-4466554400aa';
const CHAR_ID = 'e0000000-e29b-41d4-a716-4466554400bb';

// Dedicated synthetic IDs for the revision-builder tests (AGENTS.md: never reuse
// a sibling test's fixture IDs).
const REV_PLAN_ID = 'e0000000-e29b-41d4-a716-4466554400cd';
const REV_SCENE_ID = 'e0000000-e29b-41d4-a716-4466554400ce';
const REV_DISTRICT_ID = 'e0000000-e29b-41d4-a716-4466554400cf';
const REV_DELTA_ID = 'e0000000-e29b-41d4-a716-4466554400d0';

function makeDelta(overrides: Partial<GraphDelta> = {}): GraphDelta {
  return GraphDeltaSchema.parse({
    id: 'e0000000-e29b-41d4-a716-4466554400cc',
    planId: PLAN_ID,
    nodeType: 'Character',
    nodeId: CHAR_ID,
    op: 'MODIFY',
    fields: { name: 'Edited Character', personality: 'brave' },
    createdAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  });
}

beforeEach(() => {
  mockEnabled.mockReturnValue(true);
  mockQuery.mockReset();
  mockQuery.mockReturnValue(Promise.resolve([]));
  mockTx = { run: jest.fn(async () => ({ records: [] })) };
});

describe('graph-delta schema', () => {
  test('validates a delta and rejects bad op / nodeType / nodeId', () => {
    const ok = makeDelta();
    expect(GraphDeltaSchema.parse(ok)).toMatchObject({ nodeType: 'Character', op: 'MODIFY', planId: PLAN_ID });
    expect(() => GraphDeltaSchema.parse(makeDelta({ op: 'MERGE' as never }))).toThrow();
    expect(() => GraphDeltaSchema.parse(makeDelta({ nodeType: 'Thing' as never }))).toThrow();
    expect(() => GraphDeltaSchema.parse(makeDelta({ nodeId: 'not a valid id!' }))).toThrow();
  });

  test('op and nodeType enums expose ADD/MODIFY/DELETE and the six canon types', () => {
    expect(GraphDeltaOpSchema.options).toEqual(['ADD', 'MODIFY', 'DELETE']);
    for (const t of ['Character', 'Scene', 'Dialogue', 'Mission', 'Overlay', 'Location', 'District']) {
      expect(GraphNodeTypeSchema.safeParse(t).success).toBe(true);
    }
  });
});

describe('GraphBaseService', () => {
  test('upsertContentNode emits a keyed MERGE and replaces all properties', async () => {
    await upsertContentNode({ nodeType: 'Character', nodeId: CHAR_ID, name: 'Peter van der Meer', canonicalFields: { role: 'npc' } });
    const [cypher, params] = mockQuery.mock.calls[0] ?? [];
    expect(String(cypher)).toContain('MERGE (c:Content { key: $key })');
    expect(String(cypher)).toContain('SET c = $props');
    expect(params).toMatchObject({ key: `Character:${CHAR_ID}` });
    expect((params as any).props).toMatchObject({
      key: `Character:${CHAR_ID}`,
      nodeType: 'Character',
      nodeId: CHAR_ID,
      name: 'Peter van der Meer',
      role: 'npc',
      planId: null,
    });
  });

  test('upsertContentRelationship whitelists the relationship type; rejects unsafe', async () => {
    const edge: GraphEdge = { sourceNodeType: 'Scene', sourceNodeId: 'x', targetNodeType: 'Character', targetNodeId: CHAR_ID, type: 'HAS_CHARACTER' };
    await upsertContentRelationship(edge);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    await expect(upsertContentRelationship({ ...edge, type: 'DROP TABLE; --' })).rejects.toThrow('Unsafe graph relationship type');
  });

  test('countContentNodes coerces neo4j Integer counts to a number', async () => {
    mockQuery.mockReturnValue(Promise.resolve([{ count: 42 }]));
    await expect(countContentNodes()).resolves.toBe(42);
  });

  test('disabled flag short-circuits: no query, zero counts', async () => {
    mockEnabled.mockReturnValue(false);
    await upsertContentNode({ nodeType: 'Character', nodeId: CHAR_ID, name: 'n' });
    await countContentNodes();
    await hasContentNode('Character', CHAR_ID);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('GraphDeltaService', () => {
  test('applyDelta MERGEs a ContentDelta keyed on its surrogate key', async () => {
    // Ensure the base :Content node exists before applying a MODIFY delta,
    // since MODIFY/DELETE must reference an existing canonical node.
    await upsertContentNode({ nodeType: 'Character', nodeId: CHAR_ID, name: 'Test Character' });
    // Reset mock after upsertContentNode to capture the applyDelta call;
    // set up return values for both the base-node existence check and the MERGE.
    mockQuery.mockReset();
    mockQuery.mockReturnValueOnce(Promise.resolve([{ anyExists: true, canonical: true }]));
    await applyDelta(makeDelta());
    const [cypher, params] = mockQuery.mock.calls[1] ?? [];
    expect(String(cypher)).toContain('MERGE (d:ContentDelta { key: $key })');
    expect(params).toMatchObject({
      key: `Character:${CHAR_ID}:${PLAN_ID}`,
      nodeType: 'Character',
      nodeId: CHAR_ID,
      planId: PLAN_ID,
      op: 'MODIFY',
    });
  });

  test('getDeltasForPlan maps raw node properties into validated deltas', async () => {
    mockQuery.mockReturnValue(Promise.resolve([
      { d: { properties: {
        id: 'e0000000-e29b-41d4-a716-4466554400cc',
        planId: PLAN_ID,
        nodeType: 'Character',
        nodeId: CHAR_ID,
        op: 'MODIFY',
        fieldsJson: JSON.stringify({ name: 'Edited Character' }),
        createdAt: '2026-08-15T00:00:00.000Z',
      } } },
    ]));
    const deltas = await getDeltasForPlan(PLAN_ID);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ planId: PLAN_ID, op: 'MODIFY' });
  });

  test('clearDeltasForPlan deletes nodes for the plan', async () => {
    await clearDeltasForPlan(PLAN_ID);
    const [cypher, params] = mockQuery.mock.calls[0] ?? [];
    expect(String(cypher)).toContain('DELETE d');
    expect(params).toEqual({ planId: PLAN_ID });
  });

  test('summarizeDeltasForPlan tallies ops; disabled returns empty', async () => {
    mockQuery
      .mockReturnValueOnce(Promise.resolve([
         { d: { properties: { id: 'f0000000-0000-0000-0000-000000000001', planId: PLAN_ID, nodeType: 'Character', nodeId: CHAR_ID, op: 'ADD', fields: {}, createdAt: '2026-08-15T00:00:01.000Z' } } },
        // DELETE/MODIFY reference base :Content nodes by UUID (schema requires it).
        { d: { properties: { id: 'f0000000-0000-0000-0000-000000000002', planId: PLAN_ID, nodeType: 'Scene', nodeId: 'e0000000-e29b-41d4-a716-4466554400dd', op: 'DELETE', fields: {}, createdAt: '2026-08-15T00:00:02.000Z' } } },
        { d: { properties: { id: 'f0000000-0000-0000-0000-000000000003', planId: PLAN_ID, nodeType: 'Dialogue', nodeId: 'e0000000-e29b-41d4-a716-4466554400ee', op: 'MODIFY', fields: {}, createdAt: '2026-08-15T00:00:03.000Z' } } },
      ]))
      .mockReturnValueOnce(Promise.resolve([{ count: 3 }]));
    await expect(summarizeDeltasForPlan(PLAN_ID)).resolves.toEqual({ total: 3, byOp: { ADD: 1, MODIFY: 1, DELETE: 1 } });
    await expect(countDeltasForPlan(PLAN_ID)).resolves.toBe(3);
    mockEnabled.mockReturnValue(false);
    await expect(summarizeDeltasForPlan(PLAN_ID)).resolves.toEqual({ total: 0, byOp: {} });
  });
});

describe('GraphQueryService', () => {
  test('getMergedView assembles base + deltas into a GraphMergedView', async () => {
    mockQuery
      .mockReturnValueOnce(Promise.resolve([
        { nodeType: 'Character', nodeId: CHAR_ID, name: 'Canon Name', planId: null, nodeProps: { nodeType: 'Character', nodeId: CHAR_ID, name: 'Canon Name' } },
      ]))
      .mockReturnValueOnce(Promise.resolve([
        { sourceNodeType: 'Character', sourceNodeId: CHAR_ID, sourceName: 'Canon Name', targetNodeType: 'Scene', targetNodeId: 'scene-1', targetName: 'Scene', type: 'APPEARS_IN' },
      ]));
    const merged: GraphMergedView = await getMergedView(PLAN_ID);
    expect(merged.planId).toBe(PLAN_ID);
    expect(merged.nodes).toHaveLength(1);
    expect(merged.nodes[0]).toMatchObject({ nodeType: 'Character', nodeId: CHAR_ID, planId: null });
    expect(merged.edges[0]).toMatchObject({ type: 'APPEARS_IN' });
  });

  test('getImpactAnalysis gathers target + incoming/outgoing + neighbors', async () => {
    mockQuery
      .mockReturnValueOnce(Promise.resolve([{ nodeType: 'Character', nodeId: CHAR_ID, name: 'Peter', planId: null, props: {} }]))
      .mockReturnValueOnce(Promise.resolve([
        { sourceNodeType: 'Dialogue', sourceNodeId: 'dl', sourceName: 'DG', targetNodeType: 'Character', targetNodeId: CHAR_ID, targetName: 'Peter', type: 'OWNED_BY' },
      ]))
      .mockReturnValueOnce(Promise.resolve([
        { sourceNodeType: 'Character', sourceNodeId: CHAR_ID, sourceName: 'Peter', targetNodeType: 'Scene', targetNodeId: 'scene-1', targetName: 'Scene', type: 'APPEARS_IN' },
      ]));
    const result: GraphImpactAnalysis = await getImpactAnalysis('Character', CHAR_ID);
    expect(result.target?.nodeId).toBe(CHAR_ID);
    expect(result.incoming).toHaveLength(1);
    expect(result.outgoing).toHaveLength(1);
    expect(result.neighbors.map((n: GraphContentNode) => n.nodeId).sort()).toEqual(['dl', 'scene-1']);
  });

  test('detectCycles validates the relationship type', async () => {
    await expect(detectCycles('DEPENDS_ON', 10)).resolves.toEqual([]);
    await expect(detectCycles('bad type')).rejects.toThrow('Unsafe graph relationship type');
  });

  test('disabled flag returns empty views', async () => {
    mockEnabled.mockReturnValue(false);
    await expect(getMergedView(PLAN_ID)).resolves.toEqual({ planId: PLAN_ID, nodes: [], edges: [] });
    await expect(getImpactAnalysis('Character', CHAR_ID)).resolves.toEqual({ incoming: [], outgoing: [], neighbors: [] });
    await expect(countAllDeltas()).resolves.toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('GraphDeltaService — revision builders (deltas + edges + resolved names)', () => {
  const revDelta = GraphDeltaSchema.parse({
    id: REV_DELTA_ID,
    planId: REV_PLAN_ID,
    nodeType: 'Scene',
    nodeId: REV_SCENE_ID,
    op: 'ADD',
    fields: {},
    createdAt: '2026-08-15T00:00:00.000Z',
  });
  const revEdge = GraphDeltaEdgeSchema.parse({
    planId: REV_PLAN_ID,
    sourceNodeType: 'Scene',
    sourceNodeId: REV_SCENE_ID,
    targetNodeType: 'District',
    targetNodeId: REV_DISTRICT_ID,
    type: 'IN_DISTRICT',
  });

  test('buildPlanRevisionFromDeltasAndEdges: empty/absent third arg keeps legacy output; names change it', () => {
    const legacy = buildPlanRevisionFromDeltasAndEdges([revDelta], [revEdge]);
    expect(buildPlanRevisionFromDeltasAndEdges([revDelta], [revEdge], [])).toBe(legacy);
    const withName = buildPlanRevisionFromDeltasAndEdges([revDelta], [revEdge], ['Los Andes']);
    expect(withName).not.toBe(legacy);
  });

  test('buildPlanRevisionFromDeltasAndEdges: resolved names are order-independent', () => {
    expect(
      buildPlanRevisionFromDeltasAndEdges([revDelta], [revEdge], ['Los Andes', 'El Prado']),
    ).toBe(
      buildPlanRevisionFromDeltasAndEdges([revDelta], [revEdge], ['El Prado', 'Los Andes']),
    );
  });

  test('buildPlanRevisionFromDeltasAndEdges: swapping two name-valued edges is detected', () => {
    // Two differently-named Districts with their IN_DISTRICT edges swapped. A
    // bare sorted list of names ("North","South") would be identical, but the
    // revision must fold each resolved name together with its edge identity so
    // the approve gate rejects the stale export.
    const edgeA: GraphDeltaEdge = { ...revEdge, sourceNodeId: 'scene-a', targetNodeId: 'dist-north' };
    const edgeB: GraphDeltaEdge = { ...revEdge, sourceNodeId: 'scene-b', targetNodeId: 'dist-south' };

    const swappedA = [
      nameValuedEdgeRevisionPart(edgeA, 'North'),
      nameValuedEdgeRevisionPart(edgeB, 'South'),
    ].sort();
    const swappedB = [
      nameValuedEdgeRevisionPart(edgeA, 'South'),
      nameValuedEdgeRevisionPart(edgeB, 'North'),
    ].sort();

    expect(buildPlanRevisionFromDeltasAndEdges([revDelta], [edgeA, edgeB], swappedA)).not.toBe(
      buildPlanRevisionFromDeltasAndEdges([revDelta], [edgeA, edgeB], swappedB),
    );
    // And the unswapped case is stable.
    expect(buildPlanRevisionFromDeltasAndEdges([revDelta], [edgeA, edgeB], swappedA)).toBe(
      buildPlanRevisionFromDeltasAndEdges([revDelta], [edgeA, edgeB], swappedA),
    );
  });

  test('getPlanDeltaRevisionWithEdges folds resolved District names in a single transaction', async () => {
    mockEnabled.mockReturnValue(true);
    mockTx = {
      run: jest.fn(async (cypher: string) => {
        const rec = (o: Record<string, unknown>) => ({ toObject: () => o });
        const c = String(cypher);
        if (c.includes('ORDER BY d.createdAt')) {
          return { records: [rec({ d: { properties: { id: REV_DELTA_ID, planId: REV_PLAN_ID, nodeType: 'Scene', nodeId: REV_SCENE_ID, op: 'ADD', fields: {}, createdAt: '2026-08-15T00:00:00.000Z' } } })] };
        }
        if (c.includes('type(r) AS type')) {
          return { records: [rec({ sourceNodeType: 'Scene', sourceNodeId: REV_SCENE_ID, targetNodeType: 'District', targetNodeId: REV_DISTRICT_ID, type: 'IN_DISTRICT', planId: REV_PLAN_ID })] };
        }
        if (c.includes('RETURN c.nodeId AS nodeId')) {
          return { records: [rec({ nodeId: REV_DISTRICT_ID, name: 'Los Andes' })] };
        }
        return { records: [] };
      }),
    };

    const rev = await getPlanDeltaRevisionWithEdges(REV_PLAN_ID);
    // Same snapshot (deltas + edge + resolved District name) → same revision.
    const losPart = nameValuedEdgeRevisionPart(revEdge, 'Los Andes');
    expect(rev).toBe(buildPlanRevisionFromDeltasAndEdges([revDelta], [revEdge], [losPart]));
    // A base District rename with unchanged deltas/edges flips the revision.
    const elPart = nameValuedEdgeRevisionPart(revEdge, 'El Prado');
    expect(rev).not.toBe(buildPlanRevisionFromDeltasAndEdges([revDelta], [revEdge], [elPart]));
  });

  test('getPlanDeltaRevisionWithEdges: disabled returns the empty deltas+edges revision', async () => {
    mockEnabled.mockReturnValue(false);
    await expect(getPlanDeltaRevisionWithEdges(REV_PLAN_ID)).resolves.toBe(
      buildPlanRevisionFromDeltasAndEdges([], []),
    );
  });
});

