import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// Telemetry Property-Based Tests
//
// Feature: runtime-rewrite-dialogue-chunks
//
// Properties under test:
//   Property 9: Telemetry includes chunk context
//
// Validates: Requirements 9.1, 9.3, 9.4
//
// No mocking strategy needed: buildChoiceTelemetryEventData is a
// pure function — no DB, no network. All OLAP insertion happens
// in dialogue.ts; only the payload construction is tested here.
// ============================================================

import {
  buildChoiceTelemetryEventData,
  type ChoiceTelemetryEventData,
} from '../../src/routes/dialogue-response-helpers.js';

// ── Arbitraries ───────────────────────────────────────────────

/** Generates a valid UUID. */
const uuidArb = (): fc.Arbitrary<string> => fc.uuid();

/** Generates a valid choice ID string. */
const choiceIdArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 40 });

/** Generates a 'FREE' or 'GUARDED' leaf type. */
const leafTypeArb = (): fc.Arbitrary<'FREE' | 'GUARDED'> =>
  fc.constantFrom('FREE', 'GUARDED');

// ── Property 9: Telemetry includes chunk context ──────────────
//
// For ANY dialogue choice event, the OLAP event_data SHALL include:
//   9a: chunk_id (Requirement 9.1)
//   9b: is_chunk_boundary_crossing boolean flag (Requirement 9.3)
//   9c: leaf_type — 'FREE' or 'GUARDED' (Requirement 9.4)
//
// Additional sub-properties:
//   9d: event_data is a plain object (JSON-serialisable)
//   9e: all five required fields are present (no extras dropped)
//   9f: chunk_id equals the input chunkId exactly
//   9g: dialogue_tree_id equals the input dialogueTreeId exactly
//   9h: choice_id equals the input choiceId exactly
//   9i: is_chunk_boundary_crossing reflects the input boolean exactly
//   9j: leaf_type is exactly 'FREE' or 'GUARDED' — no other value
//
// Validates: Requirements 9.1, 9.3, 9.4
// Feature: runtime-rewrite-dialogue-chunks, Property 9
// ─────────────────────────────────────────────────────────────

describe('Property 9: Telemetry includes chunk context', () => {
  it('9a — event_data contains chunk_id (Req 9.1)', () => {
    fc.assert(
      fc.property(
        uuidArb(),   // dialogueTreeId
        choiceIdArb(),
        uuidArb(),   // chunkId
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          // Requirement 9.1: chunk_id MUST be present in event_data
          expect(data).toHaveProperty('chunk_id');
          expect(typeof data.chunk_id).toBe('string');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('9b — event_data contains is_chunk_boundary_crossing boolean (Req 9.3)', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          // Requirement 9.3: is_chunk_boundary_crossing MUST be present and boolean
          expect(data).toHaveProperty('is_chunk_boundary_crossing');
          expect(typeof data.is_chunk_boundary_crossing).toBe('boolean');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('9c — event_data contains leaf_type (Req 9.4)', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          // Requirement 9.4: leaf_type MUST be present in event_data
          expect(data).toHaveProperty('leaf_type');
          expect(typeof data.leaf_type).toBe('string');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('9d — event_data is JSON-serialisable (no circular refs, no functions)', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          // Must serialise and deserialise without throwing or losing fields
          const serialised = JSON.stringify(data);
          const deserialised = JSON.parse(serialised) as ChoiceTelemetryEventData;

          expect(deserialised.chunk_id).toBe(data.chunk_id);
          expect(deserialised.is_chunk_boundary_crossing).toBe(data.is_chunk_boundary_crossing);
          expect(deserialised.leaf_type).toBe(data.leaf_type);
          expect(deserialised.dialogue_tree_id).toBe(data.dialogue_tree_id);
          expect(deserialised.choice_id).toBe(data.choice_id);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('9e — all five required fields are present (no field dropped)', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          const requiredFields: (keyof ChoiceTelemetryEventData)[] = [
            'dialogue_tree_id',
            'choice_id',
            'chunk_id',
            'is_chunk_boundary_crossing',
            'leaf_type',
          ];

          for (const field of requiredFields) {
            expect(data).toHaveProperty(field);
          }
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('9f — chunk_id equals the input chunkId exactly (Req 9.1)', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          // Requirement 9.1: recorded chunk_id must be the exact chunk where the choice occurred
          expect(data.chunk_id).toBe(chunkId);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('9g — dialogue_tree_id equals the input dialogueTreeId exactly', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          expect(data.dialogue_tree_id).toBe(dialogueTreeId);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('9h — choice_id equals the input choiceId exactly', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          expect(data.choice_id).toBe(choiceId);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('9i — is_chunk_boundary_crossing reflects the input boolean exactly (Req 9.3)', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          // Requirement 9.3: the boolean must round-trip exactly
          expect(data.is_chunk_boundary_crossing).toBe(isChunkBoundaryCrossing);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  it('9j — leaf_type is exactly FREE or GUARDED — no other value (Req 9.4)', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          // Requirement 9.4: leaf_type MUST be one of the two valid leaf types
          expect(['FREE', 'GUARDED']).toContain(data.leaf_type);

          // And it must equal the input exactly — no coercion
          expect(data.leaf_type).toBe(leafType);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  // ── Boundary: FREE leaf produces leaf_type === 'FREE' ────────
  it('9j-free — FREE leaf type is faithfully recorded as FREE', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            'FREE',
          );

          expect(data.leaf_type).toBe('FREE');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  // ── Boundary: GUARDED leaf produces leaf_type === 'GUARDED' ──
  it('9j-guarded — GUARDED leaf type is faithfully recorded as GUARDED', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing) => {
          const data = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            'GUARDED',
          );

          expect(data.leaf_type).toBe('GUARDED');
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });

  // ── Requirement 15.5: round-trip serialisation property ──────
  //
  // For ALL valid (dialogueTreeId, choiceId, chunkId,
  // isChunkBoundaryCrossing, leafType) inputs, the output of
  // buildChoiceTelemetryEventData must deeply equal the object
  // produced by JSON.parse(JSON.stringify(output)).
  //
  // This is the dedicated property referenced in Requirement 15.5.
  // (Property 9d above also covers this; this test makes the
  // 15.5 contract explicit for CI traceability.)
  it('15.5 — round-trip: JSON.parse(JSON.stringify(result)) deeply equals original', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        fc.boolean(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, isChunkBoundaryCrossing, leafType) => {
          const original = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            isChunkBoundaryCrossing,
            leafType,
          );

          const roundTripped = JSON.parse(
            JSON.stringify(original),
          ) as ChoiceTelemetryEventData;

          // Deep equality: every field must survive JSON round-trip unchanged
          expect(roundTripped).toStrictEqual(original);
        },
      ),
      { numRuns: 200, verbose: false },
    );
  });

  // ── Boundary: boundary crossing true/false symmetry ──────────
  it('9i-symmetry — is_chunk_boundary_crossing is true when input is true', () => {
    fc.assert(
      fc.property(
        uuidArb(),
        choiceIdArb(),
        uuidArb(),
        leafTypeArb(),
        (dialogueTreeId, choiceId, chunkId, leafType) => {
          const crossing = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            true,
            leafType,
          );
          const notCrossing = buildChoiceTelemetryEventData(
            dialogueTreeId,
            choiceId,
            chunkId,
            false,
            leafType,
          );

          expect(crossing.is_chunk_boundary_crossing).toBe(true);
          expect(notCrossing.is_chunk_boundary_crossing).toBe(false);
        },
      ),
      { numRuns: 100, verbose: false },
    );
  });
});
