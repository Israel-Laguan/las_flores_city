import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// DialogueResolver Property-Based Tests
//
// Feature: runtime-rewrite-dialogue-chunks
//
// Properties under test:
//   Property 1: Chunk contains only allowed nodes
//   Property 2: Chunk size limit enforcement
//   Property 7: Overlay merge preserves base nodes
//
// Validates: Requirements 1.3, 1.5, 1.6, 7.3
//
// Mocking strategy:
//   - queryOLTP is mocked to return fixture data from the
//     generator, keeping tests DB-free.
//   - getCache / setCache are mocked so no Redis connection
//     is needed.
//   - The pure deepMergeNodes function is tested directly
//     (no mocks needed — it is a pure dictionary patch).
// ============================================================

// ── Module mocks ──────────────────────────────────────────────

// Mock queryOLTP — each test overrides its return value per-run.
jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(),
  withOLTPTransaction: jest.fn(
    async (cb: (client: unknown) => Promise<unknown>) => cb({}),
  ),
}));

// Mock Redis so no real connection is attempted.
jest.mock('../../src/database/redis.js', () => ({
  getCache: jest.fn(async () => null),   // always cache-miss
  setCache: jest.fn(async () => undefined),
  closeRedis: jest.fn(async () => undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────

import { DialogueResolver, deepMergeNodes } from '../../src/services/DialogueResolver.js';
import { queryOLTP } from '../../src/database/connection.js';
import { closeRedis } from '../../src/database/redis.js';
import type { DialogueNode, Leaf } from '@las-flores/shared';

// ── Arbitraries ───────────────────────────────────────────────

/** Generates a valid node id string. */
const nodeIdArb = (): fc.Arbitrary<string> =>
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'), {
    minLength: 3,
    maxLength: 20,
  });

/** Generates a valid DialogueNode (minimal fields to satisfy schema). */
const dialogueNodeArb = (id?: string): fc.Arbitrary<DialogueNode> =>
  fc
    .record({
      id: id !== undefined ? fc.constant(id) : nodeIdArb(),
      type: fc.constantFrom(
        'narrator',
        'character',
        'choice',
        'system',
        'monologue',
      ) as fc.Arbitrary<DialogueNode['type']>,
      text: fc.string({ minLength: 0, maxLength: 100 }),
    })
    .map((n) => n as unknown as DialogueNode);

/** Generates a record of up to 15 DialogueNodes (keys = node ids). */
const nodesArb = (maxCount = 15): fc.Arbitrary<Record<string, DialogueNode>> =>
  fc
    .array(nodeIdArb(), { minLength: 1, maxLength: maxCount })
    // Deduplicate ids so we always get unique keys.
    .chain((ids) => {
      const uniqueIds = [...new Set(ids)];
      return fc
        .tuple(...uniqueIds.map((id) => dialogueNodeArb(id)))
        .map((nodes) => {
          const record: Record<string, DialogueNode> = {};
          uniqueIds.forEach((id, i) => {
            record[id] = nodes[i];
          });
          return record;
        });
    });

/** Generates a FREE leaf. */
const freeLeafArb = (): fc.Arbitrary<Leaf> =>
  fc
    .string({ minLength: 1, maxLength: 40 })
    .map((target_chunk) => ({ type: 'FREE' as const, target_chunk }));

/** Generates a leaves record (string → Leaf). */
const leavesArb = (): fc.Arbitrary<Record<string, Leaf>> =>
  fc
    .array(
      fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), freeLeafArb()),
      { minLength: 0, maxLength: 5 },
    )
    .map((pairs) => {
      const record: Record<string, Leaf> = {};
      for (const [k, v] of pairs) {
        record[k] = v;
      }
      return record;
    });

/** Generates a valid UUID string. */
const uuidArb = (): fc.Arbitrary<string> => fc.uuid();

/**
 * Generates a complete BaseDialogueChunkRow fixture with at most
 * 15 nodes (the spec invariant we want to verify).
 */
const chunkRowArb = () =>
  fc.record({
    id: uuidArb(),
    tree_id: uuidArb(),
    chunk_key: nodeIdArb(),
    nodes: nodesArb(15),
    leaves: leavesArb(),
  });

// ── Test setup ────────────────────────────────────────────────

afterAll(async () => {
  await closeRedis();
});

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Wire queryOLTP to return the expected rows for one call to
 * resolveChunkForUser.
 *
 * resolveChunkForUser makes these queryOLTP calls (in order):
 *   1. loadBaseChunk        → SELECT … FROM dialogue_chunks WHERE id = ?
 *   2. getActiveMysteryIds  → SELECT mystery_id FROM player_mysteries … (Promise.all[0])
 *   3. getActiveMysteries   → SELECT id FROM mysteries …             (Promise.all[1])
 *   4. getUserNsfwStatus    → SELECT is_nsfw_unlocked …              (Promise.all[2])
 *   5. getUserAlignment     → SELECT alignment …                     (Promise.all[3])
 *   6. loadMysteryOverlays  → SELECT … FROM dialogue_overlays …
 *
 * loadBaseChunk is awaited first (step 1), THEN the four user-context
 * queries run in parallel via Promise.all (steps 2-5), THEN
 * loadMysteryOverlays (step 6).
 *
 * Jest mock returns are consumed in call order, so we push them
 * in the exact execution order above.
 */
function wireQueryOLTP(
  chunkRow: {
    id: string;
    tree_id: string;
    chunk_key: string;
    nodes: Record<string, DialogueNode>;
    leaves: Record<string, Leaf>;
  },
  overlayNodes: Record<string, DialogueNode> = {},
): void {
  const mock = queryOLTP as jest.Mock;

  const hasOverlay = Object.keys(overlayNodes).length > 0;

  // 1. loadBaseChunk (called first, before Promise.all)
  mock.mockResolvedValueOnce({ rows: [chunkRow] });
  // 2. getActiveMysteryIds (Promise.all[0])
  mock.mockResolvedValueOnce({ rows: [] });
  // 3. getActiveMysteries (Promise.all[1])
  mock.mockResolvedValueOnce({ rows: [] });
  // 4. getUserNsfwStatus (Promise.all[2])
  mock.mockResolvedValueOnce({ rows: [{ is_nsfw_unlocked: false }] });
  // 5. getUserAlignment (Promise.all[3])
  mock.mockResolvedValueOnce({ rows: [{ alignment: 'neutral' }] });
  // 6. loadMysteryOverlays — optionally inject overlay
  if (hasOverlay) {
    mock.mockResolvedValueOnce({
      rows: [
        {
          nodes: overlayNodes,
          updated_at: new Date('2025-01-01T00:00:00Z'),
          is_nsfw: false,
          unlock_condition: null,
        },
      ],
    });
  } else {
    mock.mockResolvedValueOnce({ rows: [] });
  }
}

// ── Chunk contains only allowed nodes ────────────────────────
//
// For ANY chunk served to a client, the response SHALL only
// contain nodes that exist within that chunk's node set.
//
// Specifically: mergedNodes (the nodes the caller uses to render)
// must be a superset of only base-chunk keys PLUS any overlay keys
// that were merged in — never a key that was invented or leaked
// from another chunk.
//
// When there are NO overlays, mergedNodes keys === base chunk keys.
//
// Validates: Requirements 1.3, 1.5
// ─────────────────────────────────────────────────────────────

describe('Chunk contains only allowed nodes', () => {
  it('1a — mergedNodes contains only the base chunk node keys when no overlay is present', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb(),
        chunkRowArb(),
        async (userId, chunkRow) => {
          jest.clearAllMocks();
          wireQueryOLTP(chunkRow);

          const result = await DialogueResolver.resolveChunkForUser(
            userId,
            chunkRow.id,
            chunkRow.chunk_key,
          );

          const baseKeys = new Set(Object.keys(chunkRow.nodes));
          const mergedKeys = Object.keys(result.mergedNodes);

          // Every key in mergedNodes must exist in the base chunk.
          for (const key of mergedKeys) {
            expect(baseKeys.has(key)).toBe(true);
          }

          // The number of keys must be identical (no keys added or dropped).
          expect(mergedKeys.length).toBe(baseKeys.size);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('1b — chunk.nodes in returned chunk matches base chunk nodes exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb(),
        chunkRowArb(),
        async (userId, chunkRow) => {
          jest.clearAllMocks();
          wireQueryOLTP(chunkRow);

          const result = await DialogueResolver.resolveChunkForUser(
            userId,
            chunkRow.id,
            chunkRow.chunk_key,
          );

          // result.chunk.nodes is the raw base nodes (not merged),
          // so its keys must match the base chunk exactly.
          expect(Object.keys(result.chunk.nodes).sort()).toEqual(
            Object.keys(chunkRow.nodes).sort(),
          );
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ── Chunk size limit enforcement ─────────────────────────────
//
// For any chunk stored in dialogue_chunks, the number of nodes
// SHALL NOT exceed 15.
//
// We test this in two complementary ways:
//   2a: The generator itself produces ≤15-node chunks, and after
//       resolveChunkForUser the returned chunk.nodes still has ≤15 keys.
//   2b: A chunk with 15 nodes, after resolveChunkForUser (no overlay),
//       still has exactly ≤15 keys in mergedNodes.
//
// Validates: Requirements 1.3
// ─────────────────────────────────────────────────────────────

describe('Chunk size limit enforcement', () => {
  it('2a — chunk.nodes returned by resolveChunkForUser has at most 15 keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb(),
        chunkRowArb(),
        async (userId, chunkRow) => {
          jest.clearAllMocks();
          wireQueryOLTP(chunkRow);

          const result = await DialogueResolver.resolveChunkForUser(
            userId,
            chunkRow.id,
            chunkRow.chunk_key,
          );

          expect(Object.keys(result.chunk.nodes).length).toBeLessThanOrEqual(15);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('2b — any base chunk with ≤15 nodes produces mergedNodes with ≤15 keys when no overlay', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb(),
        chunkRowArb(),
        async (userId, chunkRow) => {
          // Precondition: base chunk respects the 15-node limit.
          fc.pre(Object.keys(chunkRow.nodes).length <= 15);

          jest.clearAllMocks();
          wireQueryOLTP(chunkRow);

          const result = await DialogueResolver.resolveChunkForUser(
            userId,
            chunkRow.id,
            chunkRow.chunk_key,
          );

          expect(Object.keys(result.mergedNodes).length).toBeLessThanOrEqual(15);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ── Overlay merge preserves base nodes ───────────────────────
//
// For any base chunk and overlay nodes, the merged result SHALL
// contain all base nodes and all overlay nodes, with overlay nodes
// overwriting base nodes for matching keys.
//
// Sub-properties:
//   7a: All base node keys exist in the merged result.
//   7b: All overlay node keys exist in the merged result.
//   7c: For keys present in BOTH base and overlay, the overlay
//       value wins (last-writer-wins per-key semantics).
//   7d: For keys present only in base, the value is unchanged.
//   7e: For keys present only in overlay, the value is the overlay value.
//
// deepMergeNodes is a pure exported function — tested directly with
// no mocking needed.
//
// Validates: Requirements 1.6, 7.3
// ─────────────────────────────────────────────────────────────

describe('Overlay merge preserves base nodes', () => {
  it('7a — all base node keys appear in the merged result', () => {
    fc.assert(
      fc.property(
        nodesArb(15),
        nodesArb(5),
        (baseNodes, overlayNodes) => {
          const merged = deepMergeNodes(baseNodes, overlayNodes);

          for (const key of Object.keys(baseNodes)) {
            expect(merged).toHaveProperty(key);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('7b — all overlay node keys appear in the merged result', () => {
    fc.assert(
      fc.property(
        nodesArb(15),
        nodesArb(5),
        (baseNodes, overlayNodes) => {
          const merged = deepMergeNodes(baseNodes, overlayNodes);

          for (const key of Object.keys(overlayNodes)) {
            expect(merged).toHaveProperty(key);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('7c — overlay value overwrites base value for matching keys', () => {
    fc.assert(
      fc.property(
        nodesArb(10),
        nodesArb(10),
        (baseNodes, overlayNodes) => {
          // Find keys that exist in both to verify overlay wins.
          const sharedKeys = Object.keys(baseNodes).filter(
            (k) => k in overlayNodes,
          );

          const merged = deepMergeNodes(baseNodes, overlayNodes);

          for (const key of sharedKeys) {
            // The overlay fields should be present in the merged node.
            // deepMergeNodes spreads: { ...base[key], ...overlay[key] }
            // so every field from the overlay node must appear.
            const overlayNode = overlayNodes[key];
            for (const [field, value] of Object.entries(overlayNode)) {
              expect((merged[key] as Record<string, unknown>)[field]).toEqual(value);
            }
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('7d — keys present only in base are unchanged in merged result', () => {
    fc.assert(
      fc.property(
        nodesArb(10),
        nodesArb(5),
        (baseNodes, overlayNodes) => {
          const baseOnlyKeys = Object.keys(baseNodes).filter(
            (k) => !(k in overlayNodes),
          );

          const merged = deepMergeNodes(baseNodes, overlayNodes);

          for (const key of baseOnlyKeys) {
            expect(merged[key]).toEqual(baseNodes[key]);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('7e — keys present only in overlay appear in merged result with overlay value', () => {
    fc.assert(
      fc.property(
        nodesArb(10),
        nodesArb(5),
        (baseNodes, overlayNodes) => {
          const overlayOnlyKeys = Object.keys(overlayNodes).filter(
            (k) => !(k in baseNodes),
          );

          const merged = deepMergeNodes(baseNodes, overlayNodes);

          for (const key of overlayOnlyKeys) {
            expect(merged[key]).toEqual(overlayNodes[key]);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('7f — resolveChunkForUser mergedNodes contains all base keys plus overlay keys', async () => {
    // Integration sub-test: validates that overlay merge via
    // resolveChunkForUser also satisfies Property 7 end-to-end.
    await fc.assert(
      fc.asyncProperty(
        uuidArb(),
        chunkRowArb(),
        nodesArb(5),
        async (userId, chunkRow, overlayNodes) => {
          jest.clearAllMocks();
          wireQueryOLTP(chunkRow, overlayNodes);

          const result = await DialogueResolver.resolveChunkForUser(
            userId,
            chunkRow.id,
            chunkRow.chunk_key,
          );

          const expectedKeys = new Set([
            ...Object.keys(chunkRow.nodes),
            ...Object.keys(overlayNodes),
          ]);

          for (const key of expectedKeys) {
            expect(result.mergedNodes).toHaveProperty(key);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});
