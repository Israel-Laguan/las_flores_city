import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import type { Mock } from 'jest-mock';
import type { GraphDelta, GraphDeltaEdge } from '@las-flores/shared';

// Mock the Neo4j seam (AGENTS.md: unit tests must never open real Neo4j/Redis
// connections). `partitionDeltas`/`partitionDeltaEdges` are called WITHOUT a tx
// here, so they route through `runNeo4jQuery` — which is exactly how
// GraphIntakeService uses them for its read-only pre-write partition.
jest.mock('../../src/services/Neo4jClient.js', () => ({
  isNeo4jEnabled: jest.fn(() => true),
  runNeo4jQuery: jest.fn(async () => []),
  runNeo4jTransaction: jest.fn(async (fn: any) => fn({ run: jest.fn() })),
}));

import { isNeo4jEnabled, runNeo4jQuery } from '../../src/services/Neo4jClient.js';
import {
  partitionDeltas,
  partitionDeltaEdges,
  deltaKey,
} from '../../src/services/GraphDeltaService.js';

const mockEnabled = isNeo4jEnabled as unknown as Mock<() => boolean>;
const mockQuery = runNeo4jQuery as unknown as Mock<(c: string, p: Record<string, unknown>) => Promise<any[]>>;

// Synthetic UUIDs dedicated to this test file (AGENTS.md).
const PLAN_ID = 'f8400000-e29b-41d4-a716-4466554400a0';
const CHAR_ID = 'f8400001-e29b-41d4-a716-4466554400a1';
const SCENE_ID = 'f8400002-e29b-41d4-a716-4466554400a2';
const MISSING_ID = 'f8400003-e29b-41d4-a716-4466554400a3';

function delta(overrides: Partial<GraphDelta> = {}): GraphDelta {
  return {
    id: 'f8400009-e29b-41d4-a716-4466554400a9',
    planId: PLAN_ID,
    nodeType: 'Character',
    nodeId: CHAR_ID,
    op: 'MODIFY',
    fields: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  } as GraphDelta;
}

function edge(overrides: Partial<GraphDeltaEdge> = {}): GraphDeltaEdge {
  return {
    planId: PLAN_ID,
    sourceNodeType: 'Dialogue',
    sourceNodeId: 'new_dialogue',
    targetNodeType: 'Character',
    targetNodeId: CHAR_ID,
    type: 'OWNED_BY',
    ...overrides,
  } as GraphDeltaEdge;
}

/** Canonical base node present. */
const FOUND = [{ anyExists: true, canonical: true }];
/** Base node absent entirely. */
const ABSENT = [{ anyExists: false, canonical: false }];
/** Base node exists ONLY as critique evidence. */
const EVIDENCE_ONLY = [{ anyExists: true, canonical: false }];

describe('partitionDeltas — fail-open delta triage', () => {
  beforeEach(() => {
    mockEnabled.mockReturnValue(true);
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([]);
  });

  test('ADD deltas always pass without a lookup', async () => {
    const add = delta({ op: 'ADD', nodeId: 'brand_new_character' });

    const result = await partitionDeltas([add]);

    expect(result.safe).toEqual([add]);
    expect(result.diagnostics).toEqual([]);
    // An ADD defines its own node, so there is nothing to look up.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('a MODIFY with a canonical base node is safe', async () => {
    mockQuery.mockResolvedValue(FOUND);
    const modify = delta();

    const result = await partitionDeltas([modify]);

    expect(result.safe).toEqual([modify]);
    expect(result.diagnostics).toEqual([]);
  });

  test('a MODIFY whose base node is missing is dropped as missing_base_node, not thrown', async () => {
    mockQuery.mockResolvedValue(ABSENT);
    const modify = delta({ nodeId: MISSING_ID, fields: { name: 'City Center' } });

    const result = await partitionDeltas([modify]);

    expect(result.safe).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      nodeType: 'Character',
      nodeId: MISSING_ID,
      kind: 'missing_base_node',
      status: 'unresolved',
      // The author's own wording is what surfaces in the note, not the raw id.
      raw: 'City Center',
    });
    expect(result.diagnostics[0].reason).toContain('non-existent base :Content node');
  });

  test('a MODIFY targeting an evidence-only node is dropped as evidence_only_node', async () => {
    mockQuery.mockResolvedValue(EVIDENCE_ONLY);

    const result = await partitionDeltas([delta()]);

    expect(result.safe).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ kind: 'evidence_only_node', status: 'unresolved' });
    expect(result.diagnostics[0].reason).toContain('only as evidence');
  });

  test('a DELETE with a missing base node is dropped, not thrown', async () => {
    mockQuery.mockResolvedValue(ABSENT);

    const result = await partitionDeltas([delta({ op: 'DELETE' })]);

    expect(result.safe).toEqual([]);
    expect(result.diagnostics[0].kind).toBe('missing_base_node');
    expect(result.diagnostics[0].reason).toContain('DELETE');
  });

  test('a mixed batch keeps the good deltas and reports only the bad ones', async () => {
    const good = delta({ nodeId: CHAR_ID });
    const bad = delta({ nodeId: MISSING_ID });
    const add = delta({ op: 'ADD', nodeId: 'fresh_scene', nodeType: 'Scene' });

    // Per-delta lookups run in order: `good` resolves, `bad` does not. (`add`
    // never queries.)
    mockQuery
      .mockResolvedValueOnce(FOUND)
      .mockResolvedValueOnce(ABSENT);

    const result = await partitionDeltas([good, bad, add]);

    // One bad reference must never take the whole batch down.
    expect(result.safe).toEqual([good, add]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].nodeId).toBe(MISSING_ID);
  });

  test('with Neo4j disabled every delta is nominally safe (matches preflightDeltas no-op)', async () => {
    mockEnabled.mockReturnValue(false);
    const modify = delta();

    const result = await partitionDeltas([modify]);

    expect(result.safe).toEqual([modify]);
    expect(result.diagnostics).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('partitionDeltaEdges — fail-open edge triage', () => {
  beforeEach(() => {
    mockEnabled.mockReturnValue(true);
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([]);
  });

  test('an unsafe relationship type STILL throws (injection safety, never fails open)', async () => {
    // `type` is interpolated straight into Cypher by applyDeltaEdge, so this is a
    // structural failure that must keep blocking.
    await expect(
      partitionDeltaEdges([edge({ type: 'OWNED_BY; DROP DATABASE' })], new Set()),
    ).rejects.toThrow(/Unsafe graph relationship type/);

    await expect(
      partitionDeltaEdges([edge({ type: 'lowercase_type' })], new Set()),
    ).rejects.toThrow(/Unsafe graph relationship type/);
  });

  test('an edge whose endpoints are both in the safe-delta set needs no lookup', async () => {
    const e = edge({ sourceNodeId: 'new_dialogue', targetNodeId: CHAR_ID });
    const safeKeys = new Set([
      deltaKey('Dialogue', 'new_dialogue'),
      deltaKey('Character', CHAR_ID),
    ]);

    const result = await partitionDeltaEdges([e], safeKeys);

    expect(result.safe).toEqual([e]);
    expect(result.diagnostics).toEqual([]);
    // Both endpoints are in the pending write set, so no round-trip is needed.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('a dangling source is dropped as dangling_edge_source with field "links"', async () => {
    // Source not in safeKeys and not in the graph.
    mockQuery.mockResolvedValue([{ count: 0 }]);

    const result = await partitionDeltaEdges([edge()], new Set());

    expect(result.safe).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      nodeType: 'Dialogue',
      nodeId: 'new_dialogue',
      field: 'links',
      kind: 'dangling_edge_source',
      status: 'unresolved',
    });
    // `raw` reads as the relationship the author asked for.
    expect(result.diagnostics[0].raw).toBe(`OWNED_BY Dialogue:new_dialogue -> Character:${CHAR_ID}`);
  });

  test('a dangling target is dropped as dangling_edge_target', async () => {
    const safeKeys = new Set([deltaKey('Dialogue', 'new_dialogue')]);
    // Source satisfied by safeKeys; the target lookup (a UNION ALL of two counts)
    // finds nothing.
    mockQuery.mockResolvedValue([{ count: 0 }, { count: 0 }]);

    const result = await partitionDeltaEdges([edge({ targetNodeId: MISSING_ID })], safeKeys);

    expect(result.safe).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      nodeType: 'Character',
      nodeId: MISSING_ID,
      field: 'links',
      kind: 'dangling_edge_target',
    });
  });

  test('a target found only as a canonical :Content node is safe', async () => {
    const safeKeys = new Set([deltaKey('Dialogue', 'new_dialogue')]);
    // First UNION ALL row = canonical :Content match, second = same-plan delta.
    mockQuery.mockResolvedValue([{ count: 1 }, { count: 0 }]);

    const result = await partitionDeltaEdges([edge()], safeKeys);

    expect(result.safe).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  test('an edge whose source delta was DROPPED is reported dangling, not silently attached', async () => {
    // This is the key interaction with partitionDeltas: the source is absent from
    // safeKeys because its delta was dropped. A stale :ContentDelta from a previous
    // run must not resurrect the edge — the graph lookup is what decides, and here
    // it finds nothing.
    mockQuery.mockResolvedValue([{ count: 0 }]);

    const result = await partitionDeltaEdges([edge()], new Set());

    expect(result.safe).toEqual([]);
    expect(result.diagnostics[0].kind).toBe('dangling_edge_source');
  });

  test('a mixed batch keeps the resolvable edge and reports the dangling one', async () => {
    const good = edge({ sourceNodeId: 'new_dialogue', targetNodeId: CHAR_ID });
    const bad = edge({ sourceNodeId: 'new_dialogue', targetNodeId: MISSING_ID, targetNodeType: 'Scene' });
    const safeKeys = new Set([
      deltaKey('Dialogue', 'new_dialogue'),
      deltaKey('Character', CHAR_ID),
    ]);

    // `good` resolves via safeKeys (no query). `bad`'s target is looked up and missing.
    mockQuery.mockResolvedValue([{ count: 0 }, { count: 0 }]);

    const result = await partitionDeltaEdges([good, bad], safeKeys);

    expect(result.safe).toEqual([good]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].nodeId).toBe(MISSING_ID);
  });

  test('the relationship-type check runs even with Neo4j disabled', async () => {
    mockEnabled.mockReturnValue(false);

    // Injection safety is not conditional on the graph being reachable.
    await expect(
      partitionDeltaEdges([edge({ type: 'bad type' })], new Set()),
    ).rejects.toThrow(/Unsafe graph relationship type/);

    // A well-formed edge passes through untouched when there is nothing to check against.
    const e = edge();
    const result = await partitionDeltaEdges([e], new Set());
    expect(result.safe).toEqual([e]);
    expect(result.diagnostics).toEqual([]);
  });
});

describe('deltaKey', () => {
  test('normalizes UUID case so an uppercase id matches its canonical lowercase form', () => {
    expect(deltaKey('Character', SCENE_ID.toUpperCase())).toBe(`Character:${SCENE_ID}`);
  });

  test('leaves a non-UUID slug untouched', () => {
    expect(deltaKey('Scene', 'my_new_scene')).toBe('Scene:my_new_scene');
  });
});
