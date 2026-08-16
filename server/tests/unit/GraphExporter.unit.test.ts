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
}));

import { isNeo4jEnabled } from '../../src/services/Neo4jClient.js';
import { buildMergedRevision } from '../../src/services/GraphMerger.js';
import { getDeltasForPlan, getDeltaEdgesForPlan } from '../../src/services/GraphDeltaService.js';
import { exportContentPlan, GraphExportError } from '../../src/services/GraphExporter.js';
import { ContentPlanSchema } from '@las-flores/shared';

const mockEnabled = isNeo4jEnabled as unknown as Mock<() => boolean>;
const mockRevision = buildMergedRevision as unknown as Mock<(p: string) => Promise<GraphMergedRevision>>;
const mockDeltas = getDeltasForPlan as unknown as Mock<(p: string) => Promise<GraphDelta[]>>;
const mockEdges = getDeltaEdgesForPlan as unknown as Mock<(p: string) => Promise<GraphDeltaEdge[]>>;

const PLAN_ID = 'a1000000-e29b-41d4-a716-446655440001';
const CHAR_ID = 'a1000000-e29b-41d4-a716-446655440011';
const SCENE_ID = 'a1000000-e29b-41d4-a716-446655440012';

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
  mockRevision.mockReset();
  mockRevision.mockResolvedValue({ planId: PLAN_ID, nodes: [], edges: [], deltaEdges: [] });
  mockDeltas.mockReset();
  mockDeltas.mockResolvedValue([]);
  mockEdges.mockReset();
  mockEdges.mockResolvedValue([]);
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
});

describe('GraphExporter — error cases', () => {
  test('DELETE delta present → throws GraphExportError (blocks at approve)', async () => {
    mockDeltas.mockResolvedValue([makeDelta({ op: 'DELETE' })]);
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
});
