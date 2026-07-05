import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// ReceiptRenderer Property-Based Tests
//
// Feature: runtime-rewrite-dialogue-chunks
//
// Properties under test:
//   Property 6: TB receipt format correctness
//
// Validates: Requirements 5.2, 5.4
//
// No mocking strategy needed: appendTBReceipt is a pure function
// that takes a node and returns a new node — no DB, no network.
// ============================================================

import { appendTBReceipt } from '../../src/services/ReceiptRenderer.js';
import type { DialogueNode } from '@las-flores/shared';

// ── Arbitraries ───────────────────────────────────────────────

/** Generates a valid DialogueNode id string. */
const nodeIdArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 40 });

/** Generates a valid DialogueNodeType. */
const nodeTypeArb = (): fc.Arbitrary<DialogueNode['type']> =>
  fc.constantFrom('narrator', 'character', 'choice', 'system', 'monologue');

/** Generates a base DialogueNode without a thought field. */
const nodeWithoutThoughtArb = (): fc.Arbitrary<DialogueNode> =>
  fc.record({
    id: nodeIdArb(),
    type: nodeTypeArb(),
    text: fc.string({ minLength: 0, maxLength: 200 }),
  }) as fc.Arbitrary<DialogueNode>;

/** Generates a base DialogueNode WITH an existing thought field. */
const nodeWithThoughtArb = (): fc.Arbitrary<DialogueNode & { thought: string }> =>
  fc.record({
    id: nodeIdArb(),
    type: nodeTypeArb(),
    text: fc.string({ minLength: 0, maxLength: 200 }),
    thought: fc.string({ minLength: 1, maxLength: 200 }),
  }) as fc.Arbitrary<DialogueNode & { thought: string }>;

/** Generates either a node with or without a thought field. */
const anyNodeArb = (): fc.Arbitrary<DialogueNode> =>
  fc.oneof(nodeWithoutThoughtArb(), nodeWithThoughtArb());

/** Generates a positive integer TB amount (1..24 per GUARDED leaf spec). */
const tbAmountArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 24 });

// ISO 8601 regex: matches the output of Date.toISOString() —
// e.g. "2025-01-20T12:34:56.789Z"
const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ── TB receipt format correctness ────────────────────────────
//
// For ANY TB expenditure, the receipt SHALL be formatted exactly
// as `[TB EXPENDED: {amount} — {timestamp}]` where timestamp is
// in ISO 8601 format.
//
// Sub-properties tested:
//   6a: The receipt string embeds in node.thought and matches the
//       exact format `[TB EXPENDED: {amount} — {timestamp}]`.
//   6b: When node has no thought, returned node.thought === receipt only.
//   6c: When node has existing thought, returned node.thought ===
//       `${existing}\n\n${receipt}`.
//   6d: The original node object is NOT mutated (runtime-only).
//   6e: The returned node is a new object (not same reference).
//
// Validates: Requirements 5.2, 5.4
// ─────────────────────────────────────────────────────────────

describe('TB receipt format correctness', () => {
  it('6a — receipt in thought matches exact format [TB EXPENDED: {amount} — {ISO timestamp}]', () => {
    fc.assert(
      fc.property(
        anyNodeArb(),
        tbAmountArb(),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2099-12-31') }),
        (node, tbAmount, now) => {
          const result = appendTBReceipt(node, tbAmount, now);

          // The thought field must exist on the result.
          expect(result.thought).toBeDefined();
          expect(typeof result.thought).toBe('string');

          // Extract the receipt portion — always the last line of thought.
          const thought = result.thought as string;
          const receiptMatch = thought.match(/\[TB EXPENDED: (\d+) — ([^\]]+)\]/);

          // There MUST be exactly one receipt bracket in the thought.
          expect(receiptMatch).not.toBeNull();

          const [, amountStr, timestampStr] = receiptMatch!;

          // The amount in the receipt MUST equal tbAmount exactly.
          expect(Number(amountStr)).toBe(tbAmount);

          // The timestamp MUST be a valid ISO 8601 UTC string.
          expect(ISO_8601_RE.test(timestampStr)).toBe(true);

          // The timestamp MUST equal the Date passed in as `now`.
          expect(timestampStr).toBe(now.toISOString());
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });

  it('6b — when node has no thought, returned thought is the receipt only', () => {
    fc.assert(
      fc.property(
        nodeWithoutThoughtArb(),
        tbAmountArb(),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2099-12-31') }),
        (node, tbAmount, now) => {
          const result = appendTBReceipt(node, tbAmount, now);

          const expectedReceipt = `[TB EXPENDED: ${tbAmount} — ${now.toISOString()}]`;

          // Thought MUST equal the receipt string exactly — nothing else.
          expect(result.thought).toBe(expectedReceipt);
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });

  it('6c — when node has existing thought, receipt is appended with blank-line separator', () => {
    fc.assert(
      fc.property(
        nodeWithThoughtArb(),
        tbAmountArb(),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2099-12-31') }),
        (node, tbAmount, now) => {
          const originalThought = node.thought;
          const result = appendTBReceipt(node, tbAmount, now);

          const expectedReceipt = `[TB EXPENDED: ${tbAmount} — ${now.toISOString()}]`;
          const expectedThought = `${originalThought}\n\n${expectedReceipt}`;

          // Thought MUST be original text + blank line + receipt.
          expect(result.thought).toBe(expectedThought);
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });

  it('6d — original node is NOT mutated (runtime-only, not persisted)', () => {
    fc.assert(
      fc.property(
        anyNodeArb(),
        tbAmountArb(),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2099-12-31') }),
        (node, tbAmount, now) => {
          // Capture original thought before the call.
          const originalThought = node.thought;

          appendTBReceipt(node, tbAmount, now);

          // The original node's thought field MUST be unchanged.
          expect(node.thought).toBe(originalThought);
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });

  it('6e — returned node is a new object (not the same reference)', () => {
    fc.assert(
      fc.property(
        anyNodeArb(),
        tbAmountArb(),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2099-12-31') }),
        (node, tbAmount, now) => {
          const result = appendTBReceipt(node, tbAmount, now);

          // Result MUST be a different object reference from the input.
          expect(result).not.toBe(node);
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });
});
