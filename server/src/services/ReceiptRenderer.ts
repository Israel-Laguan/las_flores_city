// ============================================================
// ReceiptRenderer — Diegetic Time Block Expenditure Receipts
//
// Appends a TB expenditure receipt to a dialogue node's `thought`
// field at runtime. This is purely a display-time transformation:
// the stored node is never modified.
//
// Receipt format (Requirements 5.2):
//   [TB EXPENDED: {amount} — {timestamp}]
//
// Where {timestamp} is an ISO 8601 UTC string.
//
// If the node already has a `thought`, the receipt is appended
// on a new paragraph. If not, a new `thought` is created
// containing only the receipt.
//
// Requirements: 5.1, 5.2, 5.3
// ============================================================

import type { DialogueNode } from '@las-flores/shared';

/**
 * Append a TB expenditure receipt to a node's thought field.
 *
 * Returns a new node object (does not mutate the input) so the
 * stored node in `dialogue_chunks` is never modified — the receipt
 * exists only in the API response for the current request.
 *
 * @param node     - The target dialogue node to annotate
 * @param tbAmount - The number of Time Blocks spent
 * @param now      - Optional Date override (useful for deterministic tests)
 *
 * Requirements: 5.1, 5.2, 5.3
 */
export function appendTBReceipt(
  node: DialogueNode,
  tbAmount: number,
  now: Date = new Date()
): DialogueNode {
  const timestamp = now.toISOString();
  const receipt = `[TB EXPENDED: ${tbAmount} — ${timestamp}]`;

  // Requirement 5.3: if no thought field exists, create one with only the receipt
  if (!node.thought) {
    return { ...node, thought: receipt };
  }

  // Requirement 5.2: append to existing thought separated by a blank line
  return {
    ...node,
    thought: `${node.thought}\n\n${receipt}`,
  };
}
