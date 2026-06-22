import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// payloadStripping Property-Based Tests
//
// Feature: sprint-7-dialogue-engine-overhaul
//
// Properties under test:
//   Property 9: Structural invariant for stripGuardedTargetChunks
//
// Validates: Requirement 9.5
//
// No mocking strategy needed: stripGuardedTargetChunks is a pure
// function — no DB, no network.
// ============================================================

import { stripGuardedTargetChunks } from '../../src/routes/dialogue-response-helpers.js';
import type { Leaf } from '@las-flores/shared';

// ── Arbitraries ───────────────────────────────────────────────

/** Generates a valid chunk key string used as a leaf key. */
const leafKeyArb = (): fc.Arbitrary<string> =>
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'), {
    minLength: 3,
    maxLength: 20,
  });

/** Generates a valid target_chunk string (a node-id-like value). */
const targetChunkArb = (): fc.Arbitrary<string> =>
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'), {
    minLength: 3,
    maxLength: 40,
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

/** Generates a FREE leaf (type === 'FREE', has target_chunk). */
const freeLeafArb = (): fc.Arbitrary<Leaf> =>
  targetChunkArb().map((target_chunk) => ({
    type: 'FREE' as const,
    target_chunk,
  }));

/** Generates a GUARDED leaf (type === 'GUARDED', has target_chunk + reasons). */
const guardedLeafArb = (): fc.Arbitrary<Leaf> =>
  fc
    .record({
      target_chunk: targetChunkArb(),
      reasons: fc.array(boundaryReasonArb(), { minLength: 1, maxLength: 3 }),
      tb_cost: fc.option(fc.integer({ min: 1, max: 24 }), { nil: undefined }),
    })
    .map(({ target_chunk, reasons, tb_cost }) => {
      const leaf: Leaf = {
        type: 'GUARDED' as const,
        target_chunk,
        reasons: reasons as any,
        ...(tb_cost !== undefined && { tb_cost }),
      };
      return leaf;
    });

/** Generates a mixed leaves record containing both FREE and GUARDED leaves. */
const mixedLeavesArb = (): fc.Arbitrary<Record<string, Leaf>> =>
  fc
    .array(
      fc.tuple(
        leafKeyArb(),
        fc.oneof(freeLeafArb(), guardedLeafArb()),
      ),
      { minLength: 1, maxLength: 10 },
    )
    .map((pairs) => {
      const record: Record<string, Leaf> = {};
      for (const [k, v] of pairs) {
        record[k] = v;
      }
      return record;
    });

/** Generates a leaves record guaranteed to have at least one FREE and one GUARDED leaf. */
const leavesWithBothTypesArb = (): fc.Arbitrary<Record<string, Leaf>> =>
  fc
    .record({
      freeKey: leafKeyArb(),
      guardedKey: leafKeyArb(),
      freeLeaf: freeLeafArb(),
      guardedLeaf: guardedLeafArb(),
      extraPairs: fc.array(
        fc.tuple(leafKeyArb(), fc.oneof(freeLeafArb(), guardedLeafArb())),
        { minLength: 0, maxLength: 6 },
      ),
    })
    .filter(({ freeKey, guardedKey }) => freeKey !== guardedKey)
    .map(({ freeKey, guardedKey, freeLeaf, guardedLeaf, extraPairs }) => {
      const record: Record<string, Leaf> = { [freeKey]: freeLeaf, [guardedKey]: guardedLeaf };
      for (const [k, v] of extraPairs) {
        if (k !== freeKey && k !== guardedKey) {
          record[k] = v;
        }
      }
      return record;
    });

// ── Property 9: Structural invariant ─────────────────────────
//
// For all ChunkPayload leaves objects with a mix of FREE and GUARDED leaves,
// stripGuardedTargetChunks() SHALL produce a record where:
//
//   9a: Every leaf with type === 'GUARDED' has NO target_chunk property
//   9b: Every leaf with type === 'FREE' retains its target_chunk property exactly
//   9c: The set of leaf keys is unchanged (no keys added or removed)
//   9d: The function is pure — the original input leaves are not mutated
//   9e: Calling the function twice produces the same result (idempotency)
//
// Validates: Requirement 9.5
// ─────────────────────────────────────────────────────────────

describe('Property 9: stripGuardedTargetChunks structural invariant', () => {
  it('9a — GUARDED leaves in output have no target_chunk property', () => {
    fc.assert(
      fc.property(
        leavesWithBothTypesArb(),
        (leaves) => {
          const stripped = stripGuardedTargetChunks(leaves);

          for (const leaf of Object.values(stripped)) {
            if (leaf.type === 'GUARDED') {
              expect(leaf).not.toHaveProperty('target_chunk');
            }
          }
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  it('9b — FREE leaves in output retain their target_chunk value unchanged', () => {
    fc.assert(
      fc.property(
        leavesWithBothTypesArb(),
        (leaves) => {
          const stripped = stripGuardedTargetChunks(leaves);

          for (const [key, original] of Object.entries(leaves)) {
            if (original.type === 'FREE') {
              const result = stripped[key];
              expect(result).toBeDefined();
              expect(result.type).toBe('FREE');
              expect((result as { type: 'FREE'; target_chunk: string }).target_chunk)
                .toBe(original.target_chunk);
            }
          }
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  it('9c — leaf key set is identical between input and output', () => {
    fc.assert(
      fc.property(
        mixedLeavesArb(),
        (leaves) => {
          const stripped = stripGuardedTargetChunks(leaves);

          expect(Object.keys(stripped).sort()).toEqual(Object.keys(leaves).sort());
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  it('9d — original input leaves record is not mutated', () => {
    fc.assert(
      fc.property(
        leavesWithBothTypesArb(),
        (leaves) => {
          // Deep-copy the originals so we can compare after stripping
          const snapshot = JSON.parse(JSON.stringify(leaves)) as Record<string, Leaf>;

          stripGuardedTargetChunks(leaves);

          // Input must be identical to pre-call snapshot
          expect(leaves).toEqual(snapshot);
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  it('9e — function is idempotent: stripping twice equals stripping once', () => {
    fc.assert(
      fc.property(
        mixedLeavesArb(),
        (leaves) => {
          const once = stripGuardedTargetChunks(leaves);
          const twice = stripGuardedTargetChunks(once);

          expect(twice).toEqual(once);
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  it('9f — all-FREE leaves record passes through unchanged', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.tuple(leafKeyArb(), freeLeafArb()), { minLength: 1, maxLength: 10 })
          .map((pairs) => {
            const record: Record<string, Leaf> = {};
            for (const [k, v] of pairs) record[k] = v;
            return record;
          }),
        (freeOnlyLeaves) => {
          const stripped = stripGuardedTargetChunks(freeOnlyLeaves);

          // All FREE: output should deeply equal input
          expect(stripped).toEqual(freeOnlyLeaves);
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  it('9g — all-GUARDED leaves record has target_chunk stripped from every entry', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.tuple(leafKeyArb(), guardedLeafArb()), { minLength: 1, maxLength: 10 })
          .map((pairs) => {
            const record: Record<string, Leaf> = {};
            for (const [k, v] of pairs) record[k] = v;
            return record;
          }),
        (guardedOnlyLeaves) => {
          const stripped = stripGuardedTargetChunks(guardedOnlyLeaves);

          for (const leaf of Object.values(stripped)) {
            expect(leaf.type).toBe('GUARDED');
            expect(leaf).not.toHaveProperty('target_chunk');
          }
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });
});
