/* eslint-disable max-lines-per-function */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import type { Mock } from 'jest-mock';
import {
  GraphDeltaSchema,
  type GraphDelta,
  type GraphDeltaEdge,
  type GraphMergedRevision,
} from '@las-flores/shared';

// M28 — unit test the graph→ContentPlan exporter. Per AGENTS.md rule 7, stub
// the Neo4j seam so no real TCP connection is opened. GraphExporter depends on
// GraphMerger.buildMergedRevision + GraphDeltaService's getDeltasForPlan /
// getDeltaEdgesForPlan; all three are mocked here.
jest.mock('../../src/services/Neo4jClient.js', () => ({
  isNeo4jEnabled: jest.fn(() => true),
  runNeo4jQuery: jest.fn(async () => []),
}));

jest.mock('../../src/services/GraphMerger.js', () => ({
  buildMergedRevision: jest.fn(async (): Promise<GraphMergedRevision> => ({
    planId: 'p0000000-0000-0000-0000-000000000001',
    nodes: [],
    edges: [],
    deltaEdges: [],
  })),
}));

jest.mock('../../src/services/GraphDeltaService.js', () => ({
  getDeltasForPlan: jest.fn(async (): Promise<GraphDelta[]> => []),
  getDeltaEdgesForPlan: jest.fn(async (): Promise<GraphDeltaEdge[]> => []),
  // Local stubs mirroring the real mappings (IN_DISTRICT Scene→District is the
  // only name-valued edge today). Kept free of external value imports so the
  // hoisted factory can't reference an uninitialized binding.
  isNameValuedEdge: (e: GraphDeltaEdge) =>
    e.type === 'IN_DISTRICT' && e.sourceNodeType === 'Scene' && e.targetNodeType === 'District',
  resolveEdgeTargetNameValue: (e: GraphDeltaEdge, nameByKey: Map<string, string>) =>
    nameByKey.get(`${e.targetNodeType}:${e.targetNodeId}`) ?? e.targetNodeId,
  // Local stub mirroring the real edge-identity-aware revision seed part so the
  // captured seed strings match what the exporter would pass to
  // buildPlanRevisionFromDeltasAndEdges (a bare sorted name list would miss a
  // swapped-edge rename). Matches the production helper's JSON.stringify([...])
  // array format exactly so a future change to that format is caught here.
  nameValuedEdgeRevisionPart: (e: GraphDeltaEdge, name: string) =>
    JSON.stringify([e.sourceNodeType, e.sourceNodeId, e.targetNodeType, e.targetNodeId, e.type, name]),
  buildPlanRevisionFromDeltas: jest.fn(() => REVISION_ID),
  buildPlanRevisionFromDeltasAndEdges: jest.fn(
    (_del: GraphDelta[], _edges: GraphDeltaEdge[], resolved: readonly string[] = []) => {
      mockCapturedRevisionNames = resolved as readonly string[];
      return REVISION_ID;
    },
  ),
}));

// GraphExporter resolves canonical on-disk slugs for UUID-backed MODIFY deltas
// via a bulk OLTP content-store lookup (queryOLTP). Mock it so unit tests do not
// open a real DB connection and so UUID MODIFY deltas resolve a canonical slug
// instead of triggering the new "no canonical slug → block" GraphExportError.
jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(),
}));

import { isNeo4jEnabled } from '../../src/services/Neo4jClient.js';
import { buildMergedRevision } from '../../src/services/GraphMerger.js';
import { getDeltasForPlan, getDeltaEdgesForPlan } from '../../src/services/GraphDeltaService.js';
import { exportContentPlan, GraphExportError } from '../../src/services/GraphExporter.js';
import { queryOLTP } from '@las-flores/infra';
import { ContentPlanSchema } from '@las-flores/shared';

const mockEnabled = isNeo4jEnabled as unknown as Mock<() => boolean>;
const mockRevision = buildMergedRevision as unknown as Mock<(p: string) => Promise<GraphMergedRevision>>;
const mockDeltas = getDeltasForPlan as unknown as Mock<(p: string) => Promise<GraphDelta[]>>;
const mockEdges = getDeltaEdgesForPlan as unknown as Mock<(p: string) => Promise<GraphDeltaEdge[]>>;
const mockQueryOLTP = queryOLTP as unknown as Mock<(sql: string, params: unknown[]) => Promise<{ rows: Array<{ id: string; name: string }> }>>;

const PLAN_ID = 'a1000000-e29b-41d4-a716-446655440001';
const CHAR_ID = 'a1000000-e29b-41d4-a716-446655440011';
const SCENE_ID = 'a1000000-e29b-41d4-a716-446655440012';
const DIALOGUE_ID = 'a1000000-e29b-41d4-a716-446655440020';
const REVISION_ID = 'b1000000-e29b-41d4-a716-446655440001';

// Captured by the GraphDeltaService mock's buildPlanRevisionFromDeltasAndEdges so
// tests can assert the resolved canonical names are folded into the revision seed.
// Reset in beforeEach. Mock-prefixed so the hoisted factory may reference it.
let mockCapturedRevisionNames: readonly string[] = [];

function makeDelta(overrides: Partial<GraphDelta>): GraphDelta {
  return GraphDeltaSchema.parse({
    id: 'd0000000-0000-0000-0000-000000000001',
    planId: PLAN_ID,
    nodeType: 'Character',
    nodeId: CHAR_ID,
    op: 'MODIFY',
    fields: { name: 'Edited Character', personality: 'brave' },
    createdAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  });
}

function makeEdge(overrides: Partial<GraphDeltaEdge>): GraphDeltaEdge {
  return {
    planId: PLAN_ID,
    sourceNodeType: 'Dialogue',
    sourceNodeId: 'dlg_1',
    targetNodeType: 'Character',
    targetNodeId: CHAR_ID,
    type: 'OWNED_BY',
    ...overrides,
  };
}

beforeEach(() => {
  mockEnabled.mockReturnValue(true);
  mockCapturedRevisionNames = [];
  mockRevision.mockReset();
  mockRevision.mockResolvedValue({ planId: PLAN_ID, nodes: [], edges: [], deltaEdges: [] });
  mockDeltas.mockReset();
  mockDeltas.mockResolvedValue([]);
  mockEdges.mockReset();
  mockEdges.mockResolvedValue([]);
  // Default: any UUID-backed MODIFY delta's canonical slug lookup resolves a row
  // (so the exporter uses the validated canonical slug). Test overrides to [].
  mockQueryOLTP.mockReset();
  mockQueryOLTP.mockImplementation(async (_sql: string, params: unknown[]) => {
    const ids = params.flat() as string[];
    return { rows: ids.map((id) => ({ id: String(id), name: `Canonical ${id}` })) };
  });
});

describe('GraphExporter — mapping table coverage', () => {
  test('MODIFY delta → update item with entity_id and full merged fields', async () => {
    mockDeltas.mockResolvedValue([makeDelta({ op: 'MODIFY', fields: { name: 'Edited Character', personality: 'brave' } })]);
    const plan = await exportContentPlan(PLAN_ID, 'desc');
    expect(plan.items).toHaveLength(1);
    const item = plan.items[0];
    expect(item.action).toBe('update');
    expect(item.entity_id).toBe(CHAR_ID);
    expect(item.fields).toMatchObject({ name: 'Edited Character', personality: 'brave' });
    expect(plan._meta?.plan_revision).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('ADD delta with UUID nodeId → create item, id = nodeId (plan item id becomes entity id)', async () => {
    mockDeltas.mockResolvedValue([makeDelta({ op: 'ADD', nodeId: CHAR_ID, fields: { name: 'New Char', role: 'npc' } })]);
    const plan = await exportContentPlan(PLAN_ID, 'desc');
    expect(plan.items[0].action).toBe('create');
    expect(plan.items[0].id).toBe(CHAR_ID);
    expect(plan.items[0].entity_id).toBeUndefined();
  });

  test('ADD delta with slug nodeId → create item, id regenerated as UUID', async () => {
    mockDeltas.mockResolvedValue([makeDelta({ op: 'ADD', nodeId: 'new_slug', fields: { name: 'New Slug' } })]);
    const plan = await exportContentPlan(PLAN_ID, 'desc');
    expect(plan.items[0].action).toBe('create');
    expect(plan.items[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan.items[0].slug).toBe('new_slug');
  });

  test('delta→canonical edge writes mapped field directly into source item fields', async () => {
    mockDeltas.mockResolvedValue([makeDelta({ op: 'ADD', nodeType: 'Dialogue', nodeId: 'dlg_1', fields: { name: 'Dlg' } })]);
    mockEdges.mockResolvedValue([makeEdge({ sourceNodeType: 'Dialogue', sourceNodeId: 'dlg_1', targetNodeId: CHAR_ID, type: 'OWNED_BY' })]);
    const plan = await exportContentPlan(PLAN_ID, 'desc');
    expect(plan.items[0].fields).toMatchObject({ character_id: CHAR_ID });
    expect(plan.links).toHaveLength(0);
    // nodeId-valued edge: no resolved name is folded into the revision seed.
    expect(mockCapturedRevisionNames).toEqual([]);
  });

  test('IN_DISTRICT edge resolves the target District name into the source fields', async () => {
    mockRevision.mockResolvedValue({
      planId: PLAN_ID,
      nodes: [{ nodeType: 'District', nodeId: 'dist-1', name: 'Los Andes', planId: null, fields: {} }],
      edges: [],
      deltaEdges: [],
    });
    mockDeltas.mockResolvedValue([makeDelta({ op: 'ADD', nodeType: 'Scene', nodeId: SCENE_ID, fields: { name: 'Scene' } })]);

    mockEdges.mockResolvedValue([makeEdge({ sourceNodeType: 'Scene', sourceNodeId: SCENE_ID, targetNodeType: 'District', targetNodeId: 'dist-1', type: 'IN_DISTRICT' })]);
    const plan = await exportContentPlan(PLAN_ID, 'desc');
    expect(plan.items[0].fields).toMatchObject({ district: 'Los Andes' });
    // The resolved canonical name is folded into the revision seed, paired with
    // its edge identity (not a bare sorted name list).
    expect(mockCapturedRevisionNames).toHaveLength(1);
    expect(mockCapturedRevisionNames[0]).toContain('Los Andes');
    expect(mockCapturedRevisionNames[0]).toContain('IN_DISTRICT');
  });

  test('IN_DISTRICT revision seed tracks the resolved District name (rename would change it)', async () => {
    mockRevision.mockResolvedValue({
      planId: PLAN_ID,
      nodes: [{ nodeType: 'District', nodeId: 'dist-9', name: 'El Prado', planId: null, fields: {} }],
      edges: [],
      deltaEdges: [],
    });
    mockDeltas.mockResolvedValue([makeDelta({ op: 'ADD', nodeType: 'Scene', nodeId: SCENE_ID, fields: { name: 'Scene' } })]);
    mockEdges.mockResolvedValue([makeEdge({ sourceNodeType: 'Scene', sourceNodeId: SCENE_ID, targetNodeType: 'District', targetNodeId: 'dist-9', type: 'IN_DISTRICT' })]);
    await exportContentPlan(PLAN_ID, 'desc');
    // A different resolved name → a different revision seed, so the approve gate
    // detects the base-node rename even with unchanged deltas/edges.
    expect(mockCapturedRevisionNames).toHaveLength(1);
    expect(mockCapturedRevisionNames[0]).toContain('El Prado');
  });

  test('IN_DISTRICT with no resolvable District name falls back to the target nodeId in the seed', async () => {
    // District is not present in the merged revision → nameLookup misses, so the
    // seed uses the stable targetNodeId (mirroring resolveEdgeLinks' fallback).
    mockDeltas.mockResolvedValue([makeDelta({ op: 'ADD', nodeType: 'Scene', nodeId: SCENE_ID, fields: { name: 'Scene' } })]);
    mockEdges.mockResolvedValue([makeEdge({ sourceNodeType: 'Scene', sourceNodeId: SCENE_ID, targetNodeType: 'District', targetNodeId: 'dist-3', type: 'IN_DISTRICT' })]);
    const plan = await exportContentPlan(PLAN_ID, 'desc');
    expect(plan.items[0].fields).toMatchObject({ district: 'dist-3' });
    expect(mockCapturedRevisionNames).toHaveLength(1);
    expect(mockCapturedRevisionNames[0]).toContain('dist-3');
  });

  test('delta→delta edge emits a ContentLink (not a field write)', async () => {
    mockDeltas.mockResolvedValue([
      makeDelta({ op: 'ADD', nodeType: 'Dialogue', nodeId: 'dlg_1', fields: { name: 'Dlg' } }),
      makeDelta({ op: 'ADD', nodeType: 'Character', nodeId: CHAR_ID, fields: { name: 'Char' } }),
    ]);
    mockEdges.mockResolvedValue([makeEdge({ sourceNodeId: 'dlg_1', targetNodeId: CHAR_ID, type: 'OWNED_BY' })]);
    const plan = await exportContentPlan(PLAN_ID, 'desc');
    expect(plan.links).toHaveLength(1);
    expect(plan.links[0]).toMatchObject({ field: 'character_id', action: 'set' });
    expect(plan.items[0].fields.character_id).toBeUndefined();
  });

  test('delta→MODIFY-target edge writes the field directly with the stable entity_id (no ContentLink)', async () => {
    // Source is a MODIFY (update) item and the target is a MODIFY (update) item.
    // The relationship must materialize as a direct field write using the target's
    // entity_id — never the transient plan-item id.
    mockDeltas.mockResolvedValue([
      makeDelta({ op: 'MODIFY', nodeType: 'Dialogue', nodeId: DIALOGUE_ID, fields: { name: 'Dlg' } }),
      makeDelta({ op: 'MODIFY', nodeType: 'Character', nodeId: CHAR_ID, fields: { name: 'Char', personality: 'brave' } }),
    ]);
    mockEdges.mockResolvedValue([makeEdge({ sourceNodeType: 'Dialogue', sourceNodeId: DIALOGUE_ID, targetNodeType: 'Character', targetNodeId: CHAR_ID, type: 'OWNED_BY' })]);
    const plan = await exportContentPlan(PLAN_ID, 'desc');
    expect(plan.links).toHaveLength(0);
    const source = plan.items.find((i) => i.type === 'dialogue');
    expect(source?.fields.character_id).toBe(CHAR_ID);
  });

  test('MODIFY item preserves the canonical entity slug from the merged node (name edit does not retarget the file)', async () => {
    mockRevision.mockResolvedValue({
      planId: PLAN_ID,
      nodes: [{ nodeType: 'Character', nodeId: CHAR_ID, name: 'Edited Character', planId: null, fields: { slug: 'edited_character_canonical_slug' } }],
      edges: [],
      deltaEdges: [],
    });
    mockDeltas.mockResolvedValue([makeDelta({ op: 'MODIFY', fields: { name: 'Something Completely Different', personality: 'brave' } })]);
    const plan = await exportContentPlan(PLAN_ID, 'desc');
    const item = plan.items[0];
    expect(item.action).toBe('update');
    expect(item.slug).toBe('edited_character_canonical_slug');
  });
});

describe('GraphExporter — error cases', () => {
  test('DELETE delta present → throws GraphExportError (blocks at approve)', async () => {
    mockDeltas.mockResolvedValue([makeDelta({ op: 'DELETE' })]);
    await expect(exportContentPlan(PLAN_ID, 'desc')).rejects.toBeInstanceOf(GraphExportError);
  });

  test('MODIFY UUID delta with no resolvable canonical slug → throws GraphExportError (blocks retargeting a renamed path)', async () => {
    mockQueryOLTP.mockResolvedValue({ rows: [] });
    mockRevision.mockResolvedValue({ planId: PLAN_ID, nodes: [], edges: [], deltaEdges: [] });
    mockDeltas.mockResolvedValue([makeDelta({ op: 'MODIFY', fields: { name: 'Something Completely Different', personality: 'brave' } })]);
    await expect(exportContentPlan(PLAN_ID, 'desc')).rejects.toBeInstanceOf(GraphExportError);
  });

  test('unsupported edge type (HAS_CHARACTER) → throws GraphExportError', async () => {
    mockDeltas.mockResolvedValue([makeDelta({ op: 'ADD', nodeType: 'Scene', nodeId: SCENE_ID, fields: { name: 'S' } })]);
    mockEdges.mockResolvedValue([makeEdge({ sourceNodeType: 'Scene', sourceNodeId: SCENE_ID, targetNodeType: 'Character', targetNodeId: CHAR_ID, type: 'HAS_CHARACTER' })]);
    await expect(exportContentPlan(PLAN_ID, 'desc')).rejects.toBeInstanceOf(GraphExportError);
  });

  test('unmapped edge type → throws GraphExportError', async () => {
    mockDeltas.mockResolvedValue([makeDelta({ op: 'ADD', nodeType: 'Scene', nodeId: SCENE_ID, fields: { name: 'S' } })]);
    mockEdges.mockResolvedValue([makeEdge({ sourceNodeType: 'Scene', sourceNodeId: SCENE_ID, targetNodeType: 'Character', targetNodeId: CHAR_ID, type: 'MYSTERY_REL' })]);
    await expect(exportContentPlan(PLAN_ID, 'desc')).rejects.toBeInstanceOf(GraphExportError);
  });

  test('District delta → throws GraphExportError (no valid ContentTypeSchema value)', async () => {
    mockDeltas.mockResolvedValue([makeDelta({ op: 'ADD', nodeType: 'District', nodeId: 'los_andes', fields: { name: 'Los Andes' } })]);
    await expect(exportContentPlan(PLAN_ID, 'desc')).rejects.toBeInstanceOf(GraphExportError);
  });

  test('Neo4j disabled → throws GraphExportError', async () => {
    mockEnabled.mockReturnValue(false);
    await expect(exportContentPlan(PLAN_ID, 'desc')).rejects.toBeInstanceOf(GraphExportError);
  });
});

describe('GraphExporter — output is a valid ContentPlan', () => {
  test('exported plan passes ContentPlanSchema', async () => {
    mockDeltas.mockResolvedValue([makeDelta({ op: 'MODIFY', fields: { name: 'Edited', personality: 'x' } })]);
    const plan = await exportContentPlan(PLAN_ID, 'desc');
    expect(() => ContentPlanSchema.parse(plan)).not.toThrow();
  });

  test('uppercase delta UUID resolves a canonical slug stored in lowercase (canonical slug keys are UUID-case-normalized)', async () => {
    const upperNodeId = CHAR_ID.toUpperCase();
    mockRevision.mockResolvedValue({ planId: PLAN_ID, nodes: [], edges: [], deltaEdges: [] });
    mockDeltas.mockResolvedValue([makeDelta({ op: 'MODIFY', nodeId: upperNodeId, fields: { name: 'Edited', personality: 'x' } })]);
    // The content store holds the canonical UUID in lowercase; the exporter must
    // still resolve it against the uppercase delta UUID thanks to key normalization.
    mockQueryOLTP.mockResolvedValue({ rows: [{ id: CHAR_ID, name: 'Canonical Character' }] });
    const item = (await exportContentPlan(PLAN_ID, 'desc')).items[0];
    expect(item.action).toBe('update');
    expect(item.slug).toBe('canonical_character');
  });
});
