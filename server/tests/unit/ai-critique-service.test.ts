/**
 * Unit test for AICritiqueService — runCritique, caching, status override,
 * annotation clearing, scope switching. Mocks queryOLTP + the LLM provider,
 * passes a canned `neighborhood` so no real DB/Redis is touched.
 *
 * Per AGENTS.md: pure unit test (jest.mock for @las-flores/infra).
 */
import { describe, it, expect, jest as jestGlobals, beforeEach } from '@jest/globals';
import { queryOLTP } from '@las-flores/infra';
import { AICritiqueService } from '../../src/services/AICritiqueService.js';
import { MockProvider } from '../../src/services/MockProvider.js';
import type { ExistingContentContext } from '../../src/services/types/LLMTypes.js';

// Mock the entire infra module to avoid real DB/Redis connections
jestGlobals.mock('@las-flores/infra');

const mockQueryOLTP = jestGlobals.mocked(queryOLTP);

const PLAN_ID = 'a0000000-e000-4000-8000-0000000000aa';
const DESCRIPTION = 'Test plan for critique service unit tests';

const emptyContext: ExistingContentContext = {
  characters: [],
  scenes: [],
  dialogues: [],
  missions: [],
  overlays: [],
  locations: [],
};

function makeItem(overrides: Partial<any> = {}): any {
  return {
    id: 'b0000000-e000-4000-8000-000000000001',
    type: 'character',
    action: 'create',
    name: 'Test Character',
    slug: 'test_character',
    fields: { description: 'A test character' },
    assetNeeds: [],
    dependsOn: [],
    ...overrides,
  };
}

/** Seed the plan-load query to return a single plan row. */
function mockPlan(items: any[] = [makeItem()], planId = PLAN_ID): void {
  mockQueryOLTP.mockResolvedValueOnce({
    rows: [{ plan_json: { items, id: planId, description: DESCRIPTION }, description: DESCRIPTION }],
  } as any);
}

describe('AICritiqueService', () => {
  let service: AICritiqueService;

  beforeEach(() => {
    jestGlobals.clearAllMocks();
    jestGlobals.resetAllMocks();
    service = new AICritiqueService(new MockProvider());
  });

  it('throws on a non-existent plan', async () => {
    mockQueryOLTP.mockResolvedValue({ rows: [] } as any);
    await expect(service.runCritique(PLAN_ID)).rejects.toThrow(/not found/i);
  });

  it('throws on a plan without an items array', async () => {
    mockQueryOLTP.mockResolvedValue({ rows: [{ plan_json: { id: PLAN_ID }, description: DESCRIPTION }] } as any);
    await expect(service.runCritique(PLAN_ID)).rejects.toThrow(/no items/i);
  });

  it('runs a cache-miss critique and persists annotations', async () => {
    mockPlan(); // plan load
    mockQueryOLTP.mockResolvedValueOnce({ rows: [] } as any); // cache check (miss)
    mockQueryOLTP.mockResolvedValue({ rowCount: 1 } as any); // inserts

    const result = await service.runCritique(PLAN_ID, 'entity', { neighborhood: emptyContext });

    expect(result.cached).toBe(false);
    const inserts = mockQueryOLTP.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO critique_annotations'),
    );
    expect(inserts.length).toBe(result.annotations.length);
  });

  it('returns cached annotations (no LLM insert) on an unchanged subgraph', async () => {
    mockPlan(); // plan load
    // Cache check: hit
    mockQueryOLTP.mockResolvedValueOnce({ rows: [{ id: 'cached-1', ai_model: 'mock', created_at: new Date() }] } as any);
    // getAnnotations (cache-hit fetch)
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{
        id: 'cached-1', type: 'conflict', severity: 'error', description: 'Cached conflict',
        evidence: JSON.stringify([{ nodeType: 'character', nodeId: 'x', slug: 'x', excerpt: 'e' }]),
        related_entities: '[]', scope: 'entity', ai_model: 'mock', input_hash: 'hash',
        status: 'open', plan_id: PLAN_ID, item_ids: ['{x}'], created_at: new Date('2026-01-01T00:00:00Z'),
      }],
    } as any);

    const result = await service.runCritique(PLAN_ID, 'entity', { neighborhood: emptyContext });

    expect(result.cached).toBe(true);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].id).toBe('cached-1');
  });

  it('forceReanalyze bypasses the cache and runs the LLM', async () => {
    mockPlan(); // plan load
    // forceReanalyze skips the cache check entirely → first DB call after load is an insert
    mockQueryOLTP.mockResolvedValue({ rowCount: 1 } as any);

    const result = await service.runCritique(PLAN_ID, 'entity', { forceReanalyze: true, neighborhood: emptyContext });

    expect(result.cached).toBe(false);
    const cacheLookup = mockQueryOLTP.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('SELECT id, ai_model, created_at'),
    );
    expect(cacheLookup.length).toBe(0);
  });

  it('setAnnotationStatus issues a status UPDATE', async () => {
    mockQueryOLTP.mockResolvedValue({ rowCount: 1 } as any);
    await service.setAnnotationStatus('ann-1', 'dismissed');
    const update = mockQueryOLTP.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE critique_annotations'),
    );
    expect(update).toBeDefined();
    expect(update![1]).toEqual(['dismissed', 'ann-1']);
  });

  it('setAnnotationStatus throws when the annotation is not found', async () => {
    mockQueryOLTP.mockResolvedValue({ rowCount: 0 } as any);
    await expect(service.setAnnotationStatus('nonexistent', 'dismissed')).rejects.toThrow(/not found/i);
  });

  it('getAnnotations maps DB rows into typed annotations', async () => {
    mockQueryOLTP.mockResolvedValue({
      rows: [{
        id: 'ann-1', type: 'conflict', severity: 'error', description: 'A conflict',
        evidence: JSON.stringify([{ nodeType: 'character', nodeId: 'item-1', slug: 'x', excerpt: 'Test excerpt' }]),
        related_entities: JSON.stringify([]), scope: 'entity', ai_model: 'mock',
        input_hash: 'abc123', status: 'open', plan_id: PLAN_ID,
        item_ids: ['item-1'], created_at: new Date('2026-01-01T00:00:00Z'),
      }],
    } as any);

    const annotations = await service.getAnnotations(PLAN_ID);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].evidence[0].excerpt).toBe('Test excerpt');
    expect(annotations[0].itemIds).toEqual(['item-1']);
  });

  it('clearAnnotations deletes rows for the plan', async () => {
    mockQueryOLTP.mockResolvedValue({ rowCount: 0 } as any);
    await service.clearAnnotations(PLAN_ID);
    const del = mockQueryOLTP.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('DELETE FROM critique_annotations'),
    );
    expect(del).toBeDefined();
    expect(del![1]).toEqual([PLAN_ID]);
  });
});
