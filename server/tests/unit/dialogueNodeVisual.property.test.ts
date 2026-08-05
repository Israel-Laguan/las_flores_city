import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { stringOf } from './__utils__/fastCheckV4';

// ============================================================
// DialogueNodeVisualSchema Round-Trip Property-Based Tests
//
// Feature: visual-novel-dialogue-mode
//
// Properties under test:
//   - Valid DialogueNodeVisual objects round-trip losslessly
//     through JSON.parse(JSON.stringify()) and DialogueNodeVisualSchema.parse
//   - Invalid mood / position / transition enum values are rejected
//   - A DialogueNode carrying `visual` validates through
//     DialogueNodeSchema (proving the field is not stripped)
//   - A Chunk whose nodes carry `visual` validates through
//     ChunkSchema.parse (proving it survives chunk compilation)
//
// No mocking strategy needed: schema .parse() is pure — no DB/network.
// ============================================================

import {
  DialogueNodeSchema,
  DialogueNodeVisualSchema,
  ChunkSchema,
} from '@las-flores/shared';

// ── Arbitraries ───────────────────────────────────────────────

const MOODS = ['rain', 'tense', 'night', 'soft_bloom', 'alert', 'none'] as const;
const POSITIONS = ['left', 'center', 'right'] as const;
const TRANSITIONS = ['fade', 'slide', 'flash', 'none'] as const;

/** Generates a short lowercase/hyphen word (safe for max-length checks). */
const wordArb = (max = 50): fc.Arbitrary<string> =>
  stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'), {
    minLength: 1,
    maxLength: max,
  });

/** Generates a valid DialogueNodeVisual. */
const visualArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc
    .record({
      expression: fc.option(wordArb(50), { nil: undefined }),
      background: fc.option(wordArb(255), { nil: undefined }),
      mood: fc.option(fc.constantFrom(...MOODS), { nil: undefined }),
      position: fc.option(fc.constantFrom(...POSITIONS), { nil: undefined }),
      transition: fc.option(fc.constantFrom(...TRANSITIONS), { nil: undefined }),
      cinematic: fc.option(fc.boolean(), { nil: undefined }),
    })
    // fc.record emits every key even when a field is nil (undefined), so
    // without this filter the generated objects never exercise the realistic
    // missing-key case. JSON.stringify drops undefined keys and toEqual treats
    // undefined as equal to absent, so a regression that drops an absent
    // optional field would otherwise slip through. Drop the nil keys to mirror
    // what actually reaches the schema over the wire.
    .map((record) => {
      const present: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (value !== undefined) present[key] = value;
      }
      return present;
    });

// ── Tests ─────────────────────────────────────────────────────

describe('DialogueNodeVisualSchema', () => {
  it('round-trips valid visual objects through JSON losslessly', () => {
    fc.assert(
      fc.property(visualArb(), (visual) => {
        const parsed1 = DialogueNodeVisualSchema.parse(visual);
        const deserialized = JSON.parse(JSON.stringify(parsed1));
        const parsed2 = DialogueNodeVisualSchema.parse(deserialized);
        expect(parsed2).toEqual(parsed1);
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('accepts all valid visual shapes without throwing', () => {
    fc.assert(
      fc.property(visualArb(), (visual) => {
        expect(() => DialogueNodeVisualSchema.parse(visual)).not.toThrow();
      }),
      { numRuns: 200, verbose: false },
    );
  });

  it('rejects an invalid mood enum value', () => {
    expect(() =>
      DialogueNodeVisualSchema.parse({ mood: 'thunderstorm' }),
    ).toThrow();
  });

  it('rejects an invalid position enum value', () => {
    expect(() =>
      DialogueNodeVisualSchema.parse({ position: 'top' }),
    ).toThrow();
  });

  it('rejects an invalid transition enum value', () => {
    expect(() =>
      DialogueNodeVisualSchema.parse({ transition: 'zoom' }),
    ).toThrow();
  });

  it('preserves `visual` through DialogueNodeSchema.parse (not stripped)', () => {
    fc.assert(
      fc.property(visualArb(), (visual) => {
        const node = {
          id: 'root',
          type: 'character',
          speaker_id: 'char-1',
          text: 'Hello',
          visual,
        };
        const parsed = DialogueNodeSchema.parse(node);
        expect(parsed.visual).toEqual(visual);
      }),
      { numRuns: 100, verbose: false },
    );
  });

  it('preserves `visual` through ChunkSchema.parse (survives chunk compilation)', () => {
    fc.assert(
      fc.property(visualArb(), (visual) => {
        const chunk = {
          tree_id: '00000000-0000-4000-8000-000000000001',
          chunk_key: 'root',
          nodes: {
            root: { id: 'root', type: 'character', text: 'Hello', visual },
          },
          leaves: {},
        };
        const parsed = ChunkSchema.parse(chunk);
        expect(parsed.nodes.root.visual).toEqual(visual);
      }),
      { numRuns: 100, verbose: false },
    );
  });
});