import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { GraphDeltaSchema, GraphDeltaEdgeSchema, type GraphDelta, type GraphDeltaEdge, type ChatMessage } from '@las-flores/shared';

// M32 — mock all external seams for unit testing (AGENTS.md rule: unit tests
// must never open real Neo4j/Redis/DB TCP connections).
//
// GraphIntakeService dependencies:
//   - Neo4jClient (graph read/write)
//   - ChatService (LLM chatPropose)
//   - queryOLTP (Postgres)
//   - uuidv4 (local util)
// All are mocked below.

// Mock uuidv4 (now sourced from @las-flores/shared) before importing the module under test
jest.mock('@las-flores/shared', () => {
  const actual = jest.requireActual('@las-flores/shared');
  return { ...actual, uuidv4: jest.fn(() => 'mock-plan-id') };
});

// Mock Neo4j (AGENTS.md: unit tests must mock database/redis.js when importing
// Redis-using modules; same rule for Neo4j).
jest.mock('../../src/services/Neo4jClient.js', () => ({
  isNeo4jEnabled: jest.fn(() => true),
  runNeo4jQuery: jest.fn(async () => []),
  runNeo4jTransaction: jest.fn(async (fn: any) => fn(mockTx)),
}));

// Mock queryOLTP (AGENTS.md: unit tests must never touch DB)
jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(async () => ({ rows: [] })),
}));

// Mock the chat provider chain
const mockChatPropose = jest.fn();
const mockGatherContext = jest.fn();

jest.mock('../../src/services/ChatService.js', () => ({
  chatService: {
    propose: mockChatPropose,
  },
}));

// Mock gatherLocationContext so the test does not read content YAML from disk.
const mockGatherLocationContext = jest.fn(async () => []);
jest.mock('../../src/services/ContentContext.js', () => ({
  gatherLocationContext: mockGatherLocationContext,
  gatherExistingContentContext: jest.fn(),
}));

jest.mock('../../src/services/LLMService.js', () => ({
  createLLMProvider: jest.fn(() => ({
    gatherContext: mockGatherContext,
  })),
}));

// Mock GraphDeltaService (the write path under test calls applyDelta/applyDeltaEdge)
const mockApplyDelta = jest.fn(async () => {});
const mockApplyDeltaEdge = jest.fn(async () => {});
const mockPreflightDeltas = jest.fn(async () => {});
const mockPreflightDeltaEdges = jest.fn(async () => {});
const mockGetDeltasForPlan = jest.fn(async () => []);
const mockGetDeltaEdgesForPlan = jest.fn(async () => []);
const mockClearDeltasForPlan = jest.fn(async () => {});

jest.mock('../../src/services/GraphDeltaService.js', () => ({
  ...jest.requireActual('../../src/services/GraphDeltaService.js'),
  applyDelta: mockApplyDelta,
  applyDeltaEdge: mockApplyDeltaEdge,
  preflightDeltas: mockPreflightDeltas,
  preflightDeltaEdges: mockPreflightDeltaEdges,
  getDeltasForPlan: mockGetDeltasForPlan,
  getDeltaEdgesForPlan: mockGetDeltaEdgesForPlan,
  clearDeltasForPlan: mockClearDeltasForPlan,
}));

// Mock ContentPlanService so synthesizeLegacyPlan can resolve a base entity for
// MODIFY deltas (the real gatherContext reads from Postgres via queryOLTP).
const mockContentGatherContext = jest.fn(async () => ({
  characters: [], scenes: [], dialogues: [], missions: [], overlays: [], locations: [],
}));
jest.mock('../../src/services/ContentPlanService.js', () => ({
  contentPlanService: { gatherContext: mockContentGatherContext },
}));

import { isNeo4jEnabled, runNeo4jQuery, runNeo4jTransaction } from '../../src/services/Neo4jClient.js';
import { queryOLTP } from '@las-flores/infra';
import { chatService } from '../../src/services/ChatService.js';
import { GraphIntakeService, GraphIntakeDisabledError, GraphIntakeValidationError, graphIntakeService } from '../../src/services/GraphIntakeService.js';
import { applyDelta, applyDeltaEdge, getDeltasForPlan, getDeltaEdgesForPlan, clearDeltasForPlan, preflightDeltas, preflightDeltaEdges } from '../../src/services/GraphDeltaService.js';

const mockNeo4jEnabled = isNeo4jEnabled as unknown as Mock<() => boolean>;
const mockQueryOLTP = queryOLTP as unknown as Mock<(sql: string, params: any[]) => Promise<{ rows: any[] }>>;

// Dummy transaction object for runNeo4jTransaction
let mockTx: {
  run: Mock<(cypher: string, params?: Record<string, unknown>) => Promise<{ records: Array<{ toObject: () => Record<string, unknown> }> }>>;
  [k: string]: unknown;
} = { run: jest.fn(async (cypher: string, _params?: Record<string, unknown>) => ({ records: [] })) };

const mockChatProposeFn = mockChatPropose as unknown as Mock<(planId: string, messages: ChatMessage[], context: any, conflict?: any, description?: string) => Promise<{ reply: string; deltas: GraphDelta[]; deltaEdges: GraphDeltaEdge[]; usage: any }>>;
const mockGatherContextFn = mockGatherContext as unknown as Mock<() => Promise<any>>;

// Synthetic UUIDs for this test file (AGENTS.md: dedicated UUIDs per test file)
const TEST_PLAN_ID = 'f0000000-e29b-41d4-a716-4466554400f0';
const TEST_CHAR_ID = 'f0000000-e29b-41d4-a716-4466554400f1';

// Mock the uuidv4 import
import { uuidv4 } from '@las-flores/shared';
const mockUuid = uuidv4 as unknown as Mock<() => string>;

describe('GraphIntakeService — unit tests (Neo4j mocked)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset uuidv4 to return our test ID
    mockUuid.mockReturnValue(TEST_PLAN_ID);
    mockNeo4jEnabled.mockReturnValue(true);
    mockQueryOLTP.mockResolvedValue({ rows: [] });
    mockGatherContextFn.mockResolvedValue({ characters: [], scenes: [], dialogues: [], missions: [], overlays: [], locations: [] });
    
    // Default: chatPropose returns a delta + edge
    mockChatProposeFn.mockResolvedValue({
      reply: 'Proposal generated',
      deltas: [{
        id: 'delta-001',
        planId: '', // Will be set by service
        nodeType: 'Character',
        nodeId: TEST_CHAR_ID,
        op: 'ADD',
        fields: { name: 'Test Character', description: 'A test character' },
        createdAt: new Date().toISOString(),
      }],
      deltaEdges: [{
        planId: '',
        sourceNodeType: 'Character',
        sourceNodeId: TEST_CHAR_ID,
        targetNodeType: 'Scene',
        targetNodeId: 'scene-001',
        type: 'APPEARS_IN',
      }],
      usage: null,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createPlanFromDescription', () => {
    test('rejects empty description', async () => {
      const service = new GraphIntakeService();
      await expect(service.createPlanFromDescription('')).rejects.toThrow(GraphIntakeValidationError);
      await expect(service.createPlanFromDescription('   ')).rejects.toThrow(GraphIntakeValidationError);
      await expect(service.createPlanFromDescription(null as any)).rejects.toThrow(GraphIntakeValidationError);
      await expect(service.createPlanFromDescription(undefined as any)).rejects.toThrow(GraphIntakeValidationError);
    });

    test('rejects non-string description', async () => {
      const service = new GraphIntakeService();
      await expect(service.createPlanFromDescription(123 as any)).rejects.toThrow(GraphIntakeValidationError);
      await expect(service.createPlanFromDescription({} as any)).rejects.toThrow(GraphIntakeValidationError);
    });

    test('rejects when Neo4j is disabled', async () => {
      mockNeo4jEnabled.mockReturnValue(false);
      const service = new GraphIntakeService();
      await expect(service.createPlanFromDescription('Valid description')).rejects.toThrow(GraphIntakeDisabledError);
    });

    test('calls chatPropose with description and context', async () => {
      const service = new GraphIntakeService();
      await service.createPlanFromDescription('Create a new character named Alice');

      // Context is gathered internally via contentPlanService.gatherContext()
      // (read-only OLTP queries) and passed straight through to chatService.propose.
      expect(mockChatProposeFn).toHaveBeenCalledTimes(1);
      const [planIdArg, messagesArg, contextArg] = mockChatProposeFn.mock.calls[0];
      expect(planIdArg).toBe(TEST_PLAN_ID); // planId is generated up-front and passed to chatPropose
      expect(messagesArg).toEqual([{ role: 'user', content: 'Create a new character named Alice' }]);
      expect(contextArg).toEqual({ characters: [], scenes: [], dialogues: [], missions: [], overlays: [], locations: [] });
    });

    test('creates plan row in OLTP with description', async () => {
      const service = new GraphIntakeService();
      await service.createPlanFromDescription('Test description');

      // gatherContext() issues several read-only OLTP queries (one per entity
      // type) plus the single plan INSERT; assert the INSERT is among them.
      const insertCall = mockQueryOLTP.mock.calls.find(([sql]) =>
        typeof sql === 'string' && sql.includes('INSERT INTO content_plans'),
      );
      expect(insertCall).toBeDefined();
      const [, params] = insertCall!;
      expect(params).toEqual([TEST_PLAN_ID, 'Test description', expect.any(String)]);
    });

    test('writes deltas and edges to Neo4j via transaction', async () => {
      const service = new GraphIntakeService();
      await service.createPlanFromDescription('Test');

      // Should call runNeo4jTransaction once for all deltas + edges
      expect(runNeo4jTransaction as jest.Mock).toHaveBeenCalledTimes(1);
      expect(mockPreflightDeltas).toHaveBeenCalledTimes(1);
      expect(mockApplyDelta).toHaveBeenCalledTimes(1);
      expect(mockPreflightDeltaEdges).toHaveBeenCalledTimes(1);
      expect(mockApplyDeltaEdge).toHaveBeenCalledTimes(1);
    });

    test('returns result with planId and counts', async () => {
      const service = new GraphIntakeService();
      const result = await service.createPlanFromDescription('Test');

      expect(result).toEqual({
        planId: TEST_PLAN_ID,
        description: 'Test',
        deltaCount: 1,
        edgeCount: 1,
        usage: null,
        timestamp: expect.any(String),
      });
    });

    test('rejects when chatPropose returns no deltas', async () => {
      mockChatProposeFn.mockResolvedValueOnce({
        reply: 'No changes',
        deltas: [],
        deltaEdges: [],
        usage: null,
      });

      const service = new GraphIntakeService();
      await expect(service.createPlanFromDescription('Test')).rejects.toThrow(GraphIntakeValidationError);
    });

    test('passes initial messages to chatPropose', async () => {
      const service = new GraphIntakeService();
      const initialMessages: ChatMessage[] = [
        { role: 'system', content: 'Be creative' },
      ];
      await service.createPlanFromDescription('Test', initialMessages);

      const [, messagesArg] = mockChatProposeFn.mock.calls[0];
      expect(messagesArg).toEqual([
        { role: 'user', content: 'Test' },
        { role: 'system', content: 'Be creative' },
      ]);
    });
  });

  describe('getPlanDeltas', () => {
    test('returns empty arrays when Neo4j is disabled', async () => {
      mockNeo4jEnabled.mockReturnValue(false);
      const service = new GraphIntakeService();
      const result = await service.getPlanDeltas(TEST_PLAN_ID);
      expect(result).toEqual({ deltas: [], edges: [] });
    });

    test('calls getDeltasForPlan and getDeltaEdgesForPlan when enabled', async () => {
      mockNeo4jEnabled.mockReturnValue(true);
      mockGetDeltasForPlan.mockResolvedValueOnce([
        { id: 'd1', planId: TEST_PLAN_ID, nodeType: 'Character', nodeId: 'c1', op: 'ADD', fields: {}, createdAt: new Date().toISOString() },
      ]);
      mockGetDeltaEdgesForPlan.mockResolvedValueOnce([
        { planId: TEST_PLAN_ID, sourceNodeType: 'Character', sourceNodeId: 'c1', targetNodeType: 'Scene', targetNodeId: 's1', type: 'APPEARS_IN' },
      ]);

      const service = new GraphIntakeService();
      const result = await service.getPlanDeltas(TEST_PLAN_ID);

      expect(mockGetDeltasForPlan).toHaveBeenCalledWith(TEST_PLAN_ID, undefined);
      expect(mockGetDeltaEdgesForPlan).toHaveBeenCalledWith(TEST_PLAN_ID, undefined);
      expect(result).toEqual({
        deltas: [expect.objectContaining({ id: 'd1' })],
        edges: [expect.objectContaining({ sourceNodeId: 'c1' })],
      });
    });
  });

  describe('discardPlan', () => {
    test('does nothing when Neo4j is disabled', async () => {
      mockNeo4jEnabled.mockReturnValue(false);
      const service = new GraphIntakeService();
      await service.discardPlan(TEST_PLAN_ID);

      expect(mockClearDeltasForPlan).not.toHaveBeenCalled();
      expect(mockQueryOLTP).not.toHaveBeenCalled();
    });

    test('clears deltas and deletes plan row when enabled', async () => {
      mockNeo4jEnabled.mockReturnValue(true);
      const service = new GraphIntakeService();
      await service.discardPlan(TEST_PLAN_ID);

      expect(mockClearDeltasForPlan).toHaveBeenCalledWith(TEST_PLAN_ID);
      expect(mockQueryOLTP).toHaveBeenCalledWith('DELETE FROM content_plans WHERE id = $1', [TEST_PLAN_ID]);
    });
  });

  describe('synthesizeLegacyPlan', () => {
    test('returns null when plan not found', async () => {
      mockQueryOLTP.mockResolvedValueOnce({ rows: [] });
      const service = new GraphIntakeService();
      const result = await service.synthesizeLegacyPlan(TEST_PLAN_ID);
      expect(result).toBeNull();
    });

    test('synthesizes ContentPlan from deltas and edges', async () => {
      mockQueryOLTP.mockResolvedValueOnce({ rows: [{ description: 'Test description' }] });
      mockNeo4jEnabled.mockReturnValue(true);
      mockGetDeltasForPlan.mockResolvedValueOnce([
        {
          id: 'd1',
          planId: TEST_PLAN_ID,
          nodeType: 'Character',
          nodeId: TEST_CHAR_ID,
          op: 'ADD',
          fields: { name: 'Test Char', description: 'A test' },
          createdAt: new Date().toISOString(),
        },
      ]);
      mockGetDeltaEdgesForPlan.mockResolvedValueOnce([]);
      mockGatherContextFn.mockResolvedValueOnce({ characters: [], scenes: [], dialogues: [], missions: [], overlays: [], locations: [] });

      const service = new GraphIntakeService();
      const result = await service.synthesizeLegacyPlan(TEST_PLAN_ID);

      expect(result).not.toBeNull();
      expect(result?.description).toBe('Test description');
      expect(result?.items).toHaveLength(1);
      expect(result?.items[0].type).toBe('character');
      expect(result?.items[0].action).toBe('create');
    });

    test('deep-merges nested object fields for MODIFY deltas, preserving unchanged nested fields', async () => {
      mockQueryOLTP.mockResolvedValueOnce({ rows: [{ description: 'Test description' }] });
      mockNeo4jEnabled.mockReturnValue(true);
      mockGetDeltasForPlan.mockResolvedValueOnce([
        {
          id: 'd1',
          planId: TEST_PLAN_ID,
          nodeType: 'Character',
          nodeId: TEST_CHAR_ID,
          op: 'MODIFY',
          fields: { metadata: { personality: 'Grumpy' } },
          createdAt: new Date().toISOString(),
        },
      ]);
      mockGetDeltaEdgesForPlan.mockResolvedValueOnce([]);
      mockContentGatherContext.mockResolvedValueOnce({
        characters: [{ id: TEST_CHAR_ID, name: 'Existing', metadata: { personality: 'Cheerful', backstory: 'Old lore' } }],
        scenes: [], dialogues: [], missions: [], overlays: [], locations: [],
      });

      const service = new GraphIntakeService();
      const result = await service.synthesizeLegacyPlan(TEST_PLAN_ID);

      expect(result).not.toBeNull();
      expect(result?.items).toHaveLength(1);
      expect(result?.items[0].action).toBe('update');
      // The MODIFY delta only set metadata.personality; the unchanged
      // metadata.backstory must survive the merge (deep merge, not replace).
      expect(result?.items[0].fields.metadata).toEqual({ personality: 'Grumpy', backstory: 'Old lore' });
    });
  });

  describe('singleton export', () => {
    test('graphIntakeService is a GraphIntakeService instance', () => {
      expect(graphIntakeService).toBeInstanceOf(GraphIntakeService);
    });
  });
});
