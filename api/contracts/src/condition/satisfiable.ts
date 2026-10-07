// api/contracts/src/condition/satisfiable.ts
// SC-304 (m-62): can two conditions be true at the same time?
//
// Decision procedure (SC-S13): truth table over `vars = extractFlagSlugs(a) ∪
// extractFlagSlugs(b)`; the pair is co-satisfiable iff some assignment makes both
// `evaluate` true. Assignments are enumerated in a fixed order (bit i of the counter =
// the i-th sorted var), so the witness is deterministic.
//
// Known limits, by design:
// - Flags are treated as INDEPENDENT booleans. Flags that canon never sets separately
//   are still assumed independently settable, so this may over-report co-satisfiability
//   — it never under-reports. Authors narrow conditions (e.g. `a AND NOT b`) instead.
// - More than `maxVars` (default MAX_SAT_VARS = 16) variables → `'unknown'`. Callers
//   must treat unknown as co-satisfiable (conservative) and say so in a `hint`.
//
// Pure, total, never throws.

import { evaluate } from './evaluate.js';
import { extractFlagSlugs, type ConditionExpr } from './expression.js';

export const MAX_SAT_VARS = 16;

export type CoSatisfiableResult =
  /** `witness` = the flags set true in the first satisfying assignment, sorted. */
  | { result: true; witness: string[] }
  | { result: false; witness: null }
  | { result: 'unknown'; witness: null; vars: number };

export interface CoSatisfiableOptions {
  maxVars?: number;
}

/**
 * Determines whether two conditions can be true simultaneously.
 *
 * Decision procedure (SC-S13): truth table over `vars = extractFlagSlugs(a) ∪
 * extractFlagSlugs(b)`; the pair is co-satisfiable iff some assignment makes both
 * `evaluate` true. Assignments are enumerated in a fixed order (bit i of the counter =
 * the i-th sorted var), so the witness is deterministic.
 *
 * Known limits, by design:
 * - Flags are treated as INDEPENDENT booleans. Flags that canon never sets separately
 *   are still assumed independently settable, so this may over-report co-satisfiability
 *   — it never under-reports. Authors narrow conditions (e.g. `a AND NOT b`) instead.
 * - More than `maxVars` (default MAX_SAT_VARS = 16) variables → `'unknown'`. Callers
 *   must treat unknown as co-satisfiable (conservative) and say so in a `hint`.
 *
 * Pure, total, never throws.
 *
 * @param a - First condition expression
 * @param b - Second condition expression
 * @param options - Optional maxVars override (default MAX_SAT_VARS = 16)
 * @returns CoSatisfiableResult: `{result: true, witness}` if both can be true,
 *   `{result: false, witness: null}` if they always conflict, or
 *   `{result: 'unknown', vars}` when the variable count exceeds the limit
 */
export function coSatisfiable(a: ConditionExpr, b: ConditionExpr, options: CoSatisfiableOptions = {}): CoSatisfiableResult {
  const maxVars = options.maxVars ?? MAX_SAT_VARS;
  const vars = [...new Set([...extractFlagSlugs(a), ...extractFlagSlugs(b)])].sort();
  if (vars.length > maxVars) return { result: 'unknown', witness: null, vars: vars.length };

  // Highest mask first so the all-true assignment is tried first: it makes "a / b"
  // style overlaps report the intuitive witness (both flags set).
  for (let mask = 2 ** vars.length - 1; mask >= 0; mask--) {
    const set = new Set(vars.filter((_, i) => (mask & (1 << i)) !== 0));
    if (evaluate(a, set) && evaluate(b, set)) return { result: true, witness: [...set] };
  }
  return { result: false, witness: null };
}
