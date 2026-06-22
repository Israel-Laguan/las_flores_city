import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// ChunkSchema Round-Trip Property-Based Tests
//
// Feature: sprint-7-dialogue-engine-overhaul
//
// Properties under test:
//   Property: Round-trip consistency for ChunkSchema
//
// Validates: Requirement 4.7
//
// No mocking strategy needed: ChunkSchema.parse is a pure
// function — no DB, no network.
// ============================================================

import { ChunkSchema } from '@las-flores/shared';

// ── Arbitraries ───────────────────────────────────────────────

/** Generates a valid UUID v4 string (lowercase). */
const uuidArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.hexaString({ minLength: 8, maxLength: 8 }),
    fc.hexaString({ minLength: 4, maxLength: 4 }),
    fc.constant('4'),
    fc.hexaString({ minLength: 3, maxLength: 3 }),
    fc.constantFrom('8', '9', 'a', 'b'),
    fc.hexaString({ minLength: 3, maxLength: 3 }),
    fc.hexaString({ minLength: 12, maxLength: 12 }),
  ).map(([p1, p2, p3, p4, p5, p6, p7]) => 
    `${p1}-${p2}-${p3}${p4}-${p5}${p6}-${p7}`
  );

/** Generates a valid chunk key string (node-id-like value). */
const chunkKeyArb = (): fc.Arbitrary<string> =>
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'), {
    minLength: 3,
    maxLength: 40,
  });

/** Generates a node ID string. */
const nodeIdArb = (): fc.Arbitrary<string> =>
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'), {
    minLength: 3,
    maxLength: 20,
  });

/** Generates a choice ID string. */
const choiceIdArb = (): fc.Arbitrary<string> =>
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'), {
    minLength: 3,
    maxLength: 20,
  });

/** Generates a node type. */
const nodeTypeArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('narrator', 'character', 'choice', 'system', 'monologue');

/** Generates a valid FREE leaf. */
const freeLeafArb = () =>
  fc.record({
    type: fc.constant('FREE' as const),
    target_chunk: chunkKeyArb(),
  });

/** Generates a BoundaryReason value. */
const boundaryReasonArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'time_block_cost',
    'effects',
    'conditional',
    'mystery_solve',
    'overlay_gate',
    'vault_unlock',
    'relationship_change',
  );

/** Generates a valid GUARDED leaf. */
const guardedLeafArb = () =>
  fc.record({
    type: fc.constant('GUARDED' as const),
    target_chunk: chunkKeyArb(),
    reasons: fc.array(boundaryReasonArb(), { minLength: 1, maxLength: 3 }),
    tb_cost: fc.option(fc.integer({ min: 1, max: 24 }), { nil: undefined }),
  });

/** Generates a valid leaf (FREE or GUARDED). */
const leafArb = () => fc.oneof(freeLeafArb(), guardedLeafArb());

/** Generates a valid DialogueNode. */
const dialogueNodeArb = () =>
  fc.record({
    id: nodeIdArb(),
    type: nodeTypeArb(),
    text: fc.string({ minLength: 1, maxLength: 200 }),
    choices: fc.option(
      fc.array(
        fc.record({
          id: choiceIdArb(),
          text: fc.string({ minLength: 1, maxLength: 100 }),
          next_node_id: nodeIdArb(), // Required, not optional
        }),
        { minLength: 1, maxLength: 5 },
      ),
      { nil: undefined },
    ),
    is_end: fc.option(fc.boolean(), { nil: undefined }),
  });

/** Generates a valid Chunk object. */
const chunkArb = () =>
  fc.record({
    tree_id: uuidArb(),
    chunk_key: chunkKeyArb(),
    nodes: fc.dictionary(nodeIdArb(), dialogueNodeArb(), { minKeys: 1, maxKeys: 15 }),
    leaves: fc.dictionary(chunkKeyArb(), leafArb(), { minKeys: 0, maxKeys: 10 }),
  });

// ── Property: Round-trip consistency ─────────────────────────
//
// For all valid Chunk objects, parsing the object with ChunkSchema.parse()
// then re-serialising with JSON.stringify() then parsing again with
// ChunkSchema.parse() must produce an object deeply equal to the original.
//
// This property ensures that:
//   1. ChunkSchema accepts all valid Chunk-shaped inputs
//   2. JSON serialization does not lose or corrupt data
//   3. The schema is consistent with the TypeScript type system
//
// Validates: Requirement 4.7
// ─────────────────────────────────────────────────────────────

describe('Property: ChunkSchema round-trip consistency', () => {
  it('round-trip through JSON.parse(JSON.stringify()) preserves the object', () => {
    fc.assert(
      fc.property(chunkArb(), (chunk) => {
        // First parse validates the input
        const parsed1 = ChunkSchema.parse(chunk);

        // Serialize and deserialize
        const serialized = JSON.stringify(parsed1);
        const deserialized = JSON.parse(serialized);

        // Second parse should produce identical result
        const parsed2 = ChunkSchema.parse(deserialized);

        // Deep equality check
        expect(parsed2).toEqual(parsed1);
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('ChunkSchema accepts all valid Chunk-shaped inputs without throwing', () => {
    fc.assert(
      fc.property(chunkArb(), (chunk) => {
        // Should not throw
        expect(() => ChunkSchema.parse(chunk)).not.toThrow();
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('serializing then parsing produces a valid Chunk', () => {
    fc.assert(
      fc.property(chunkArb(), (chunk) => {
        const parsed = ChunkSchema.parse(chunk);
        const serialized = JSON.stringify(parsed);
        const deserialized = JSON.parse(serialized);

        // Should be a valid chunk after round-trip
        expect(() => ChunkSchema.parse(deserialized)).not.toThrow();
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('preserves tree_id, chunk_key, nodes, and leaves keys', () => {
    fc.assert(
      fc.property(chunkArb(), (chunk) => {
        const parsed1 = ChunkSchema.parse(chunk);
        const serialized = JSON.stringify(parsed1);
        const deserialized = JSON.parse(serialized);
        const parsed2 = ChunkSchema.parse(deserialized);

        // Verify key structural properties are preserved
        expect(parsed2.tree_id).toBe(parsed1.tree_id);
        expect(parsed2.chunk_key).toBe(parsed1.chunk_key);
        expect(Object.keys(parsed2.nodes).sort()).toEqual(Object.keys(parsed1.nodes).sort());
        expect(Object.keys(parsed2.leaves).sort()).toEqual(Object.keys(parsed1.leaves).sort());
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('preserves leaf types (FREE vs GUARDED) through round-trip', () => {
    fc.assert(
      fc.property(chunkArb(), (chunk) => {
        const parsed1 = ChunkSchema.parse(chunk);
        const serialized = JSON.stringify(parsed1);
        const deserialized = JSON.parse(serialized);
        const parsed2 = ChunkSchema.parse(deserialized);

        // Verify leaf types are preserved
        for (const [key, leaf1] of Object.entries(parsed1.leaves)) {
          const leaf2 = parsed2.leaves[key];
          expect(leaf2).toBeDefined();
          expect(leaf2.type).toBe(leaf1.type);
        }
      }),
      { numRuns: 200, verbose: false },
    );
  });
});
