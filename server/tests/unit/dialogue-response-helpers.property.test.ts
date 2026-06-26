import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// dialogue-response-helpers Property-Based Tests
//
// Feature: runtime-rewrite-dialogue-chunks
//
// Properties under test:
//   Property 10: Response helper contract
//
// Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
//
// No mocking strategy needed: buildDialogueResponse and
// buildChooseResponse are pure functions — no DB, no network.
// ============================================================

import {
  buildDialogueResponse,
  buildChooseResponse,
} from '../../src/routes/dialogue-response-helpers.js';
import type { DialogueNode, DialogueChoice, Leaf } from '@las-flores/shared';

// ── Arbitraries ───────────────────────────────────────────────

/** Generates a valid node id string. */
const nodeIdArb = (): fc.Arbitrary<string> =>
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'), {
    minLength: 3,
    maxLength: 20,
  });

/** Generates a valid UUID. */
const uuidArb = (): fc.Arbitrary<string> => fc.uuid();

/** Generates a valid DialogueNode (minimal required fields). */
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

/** Generates a valid DialogueChoice. */
const dialogueChoiceArb = (): fc.Arbitrary<DialogueChoice> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 40 }),
    text: fc.string({ minLength: 1, maxLength: 100 }),
    next_node_id: nodeIdArb(),
  }) as fc.Arbitrary<DialogueChoice>;

/** Generates an array of 0-5 DialogueChoices. */
const choicesArb = (): fc.Arbitrary<DialogueChoice[]> =>
  fc.array(dialogueChoiceArb(), { minLength: 0, maxLength: 5 });

/**
 * Generates a valid ChunkPayload (id, chunk_key, nodes, leaves).
 * The chunk_key is a key that exists in nodes.
 */
const chunkPayloadArb = () =>
  nodesArb(15).chain((nodes) => {
    const keys = Object.keys(nodes);
    return fc.record({
      id: uuidArb(),
      chunk_key: keys.length > 0 ? fc.constantFrom(...keys) : fc.constant(keys[0] ?? 'fallback'),
      nodes: fc.constant(nodes),
      leaves: leavesArb(),
    });
  });

/** Generates a non-negative integer TB amount. */
const tbAmountArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: 168 }); // 0-168 TB (1 week of hours)

// ── Property 10: Response helper contract (buildDialogueResponse) ──
//
// For ANY call to buildDialogueResponse with a valid chunk, the
// returned object SHALL have exactly the required top-level fields:
//   { success: true, data: { chunk, current_chunk_id, current_node_id,
//     available_choices, is_end, time_blocks_spent, time_blocks_remaining } }
//
// Sub-properties:
//   10a: success is exactly true
//   10b: data contains all required fields
//   10c: chunk field contains id, chunk_key, nodes, leaves
//   10d: chunk.nodes matches the input chunk's nodes exactly (no extras)
//   10e: current_chunk_id equals the input currentChunkId
//   10f: current_node_id equals the input currentNodeId
//   10g: available_choices equals the input choices array
//   10h: is_end equals the input isEnd boolean
//   10i: time_blocks_spent and time_blocks_remaining equal the inputs
//   10j: timestamp is a valid ISO 8601 UTC string
//
// Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
// Feature: runtime-rewrite-dialogue-chunks, Property 10
// ─────────────────────────────────────────────────────────────

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('Property 10: buildDialogueResponse contract', () => {
  it('10a — success is exactly true', () => {
    fc.assert(
      fc.property(
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (chunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildDialogueResponse(
            chunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10b — data contains all required fields', () => {
    fc.assert(
      fc.property(
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (chunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildDialogueResponse(
            chunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          expect(result.data).toBeDefined();
          expect(result.data).toHaveProperty('chunk');
          expect(result.data).toHaveProperty('current_chunk_id');
          expect(result.data).toHaveProperty('current_node_id');
          expect(result.data).toHaveProperty('available_choices');
          expect(result.data).toHaveProperty('is_end');
          expect(result.data).toHaveProperty('time_blocks_spent');
          expect(result.data).toHaveProperty('time_blocks_remaining');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10c — chunk field has id, chunk_key, nodes, and leaves', () => {
    fc.assert(
      fc.property(
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (chunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildDialogueResponse(
            chunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          expect(result.data.chunk).toHaveProperty('id');
          expect(result.data.chunk).toHaveProperty('chunk_key');
          expect(result.data.chunk).toHaveProperty('nodes');
          expect(result.data.chunk).toHaveProperty('leaves');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10d — chunk.nodes matches input chunk nodes exactly (no extras, no drops)', () => {
    fc.assert(
      fc.property(
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (chunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildDialogueResponse(
            chunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          // Requirement 2.4: SHALL NOT include nodes outside the current chunk
          expect(Object.keys(result.data.chunk.nodes).sort()).toEqual(
            Object.keys(chunk.nodes).sort(),
          );
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10e — current_chunk_id equals the input currentChunkId', () => {
    fc.assert(
      fc.property(
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (chunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildDialogueResponse(
            chunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          // Requirement 2.2: SHALL return current_chunk_id
          expect(result.data.current_chunk_id).toBe(currentChunkId);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10f — current_node_id equals the input currentNodeId', () => {
    fc.assert(
      fc.property(
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (chunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildDialogueResponse(
            chunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          // Requirement 2.3: SHALL return current_node_id
          expect(result.data.current_node_id).toBe(currentNodeId);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10g — available_choices equals the input choices (Req 2.5)', () => {
    fc.assert(
      fc.property(
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (chunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildDialogueResponse(
            chunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          // Requirement 2.5: SHALL include available_choices filtered for current node
          expect(result.data.available_choices).toEqual(choices);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10h — is_end, time_blocks_spent, time_blocks_remaining equal inputs', () => {
    fc.assert(
      fc.property(
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (chunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildDialogueResponse(
            chunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          expect(result.data.is_end).toBe(isEnd);
          expect(result.data.time_blocks_spent).toBe(tbSpent);
          expect(result.data.time_blocks_remaining).toBe(tbRemaining);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10j — timestamp is a valid ISO 8601 UTC string', () => {
    fc.assert(
      fc.property(
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (chunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildDialogueResponse(
            chunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          expect(typeof result.timestamp).toBe('string');
          expect(ISO_8601_RE.test(result.timestamp)).toBe(true);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});

// ── Property 10: buildChooseResponse contract ─────────────────
//
// For ANY call to buildChooseResponse with a valid next chunk,
// the returned object SHALL have the required fields:
//   next_chunk, current_chunk_id, current_node_id, and receipt when TB spent.
//
// Sub-properties:
//   10k: success is exactly true
//   10l: data contains next_chunk, current_chunk_id, current_node_id
//   10m: next_chunk has id, chunk_key, nodes, leaves
//   10n: next_chunk.nodes exactly matches the input chunk's nodes (no extras)
//   10o: receipt is present when TB was spent (non-null receipt arg)
//   10p: receipt is absent when no TB spent (null receipt arg)
//   10q: is_chunk_boundary_crossing is included in response
//
// Validates: Requirements 2.1, 2.2, 2.3
// Feature: runtime-rewrite-dialogue-chunks, Property 10
// ─────────────────────────────────────────────────────────────

describe('Property 10: buildChooseResponse contract', () => {
  it('10k — success is exactly true', () => {
    fc.assert(
      fc.property(
        uuidArb(),          // dialogueId
        fc.string({ minLength: 1, maxLength: 40 }), // choiceId
        chunkPayloadArb(),  // nextChunk
        uuidArb(),          // currentChunkId
        nodeIdArb(),        // currentNodeId
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (dialogueId, choiceId, nextChunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildChooseResponse(
            dialogueId,
            choiceId,
            nextChunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10l — data contains next_chunk, current_chunk_id, current_node_id', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        fc.string({ minLength: 1, maxLength: 40 }),
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (dialogueId, choiceId, nextChunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildChooseResponse(
            dialogueId,
            choiceId,
            nextChunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          expect(result.data).toHaveProperty('next_chunk');
          expect(result.data).toHaveProperty('current_chunk_id');
          expect(result.data).toHaveProperty('current_node_id');
          expect(result.data).toHaveProperty('available_choices');
          expect(result.data).toHaveProperty('time_blocks_spent');
          expect(result.data).toHaveProperty('time_blocks_remaining');
          expect(result.data).toHaveProperty('is_chunk_boundary_crossing');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10m — next_chunk has id, chunk_key, nodes, leaves', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        fc.string({ minLength: 1, maxLength: 40 }),
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (dialogueId, choiceId, nextChunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildChooseResponse(
            dialogueId,
            choiceId,
            nextChunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          expect(result.data.next_chunk).toHaveProperty('id');
          expect(result.data.next_chunk).toHaveProperty('chunk_key');
          expect(result.data.next_chunk).toHaveProperty('nodes');
          expect(result.data.next_chunk).toHaveProperty('leaves');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10n — next_chunk.nodes exactly matches the input chunk nodes (no extras, no drops)', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        fc.string({ minLength: 1, maxLength: 40 }),
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (dialogueId, choiceId, nextChunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildChooseResponse(
            dialogueId,
            choiceId,
            nextChunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
          );

          expect(Object.keys(result.data.next_chunk.nodes).sort()).toEqual(
            Object.keys(nextChunk.nodes).sort(),
          );
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10o — receipt is present in data when TB was spent', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        fc.string({ minLength: 1, maxLength: 40 }),
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        fc.string({ minLength: 1, maxLength: 200 }), // receipt string
        (dialogueId, choiceId, nextChunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining, receipt) => {
          const result = buildChooseResponse(
            dialogueId,
            choiceId,
            nextChunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
            receipt, // non-null receipt
          );

          // When receipt is provided, it must appear in data
          expect(result.data).toHaveProperty('receipt');
          expect((result.data as { receipt?: string }).receipt).toBe(receipt);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10p — receipt is absent from data when null (no TB spent)', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        fc.string({ minLength: 1, maxLength: 40 }),
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        (dialogueId, choiceId, nextChunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining) => {
          const result = buildChooseResponse(
            dialogueId,
            choiceId,
            nextChunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
            null, // no receipt
          );

          // When receipt is null, it must NOT appear in data
          expect(result.data).not.toHaveProperty('receipt');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('10q — is_chunk_boundary_crossing is included and reflects the input flag', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        fc.string({ minLength: 1, maxLength: 40 }),
        chunkPayloadArb(),
        uuidArb(),
        nodeIdArb(),
        choicesArb(),
        fc.boolean(),
        tbAmountArb(),
        tbAmountArb(),
        fc.boolean(), // isBoundaryCrossing
        (dialogueId, choiceId, nextChunk, currentChunkId, currentNodeId, choices, isEnd, tbSpent, tbRemaining, isBoundaryCrossing) => {
          const result = buildChooseResponse(
            dialogueId,
            choiceId,
            nextChunk,
            currentChunkId,
            currentNodeId,
            choices,
            isEnd,
            tbSpent,
            tbRemaining,
            null,
            null,
            null,
            null,
            isBoundaryCrossing,
          );

          expect(result.data.is_chunk_boundary_crossing).toBe(isBoundaryCrossing);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});
