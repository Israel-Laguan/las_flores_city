// api/contracts/src/condition/evaluate.ts
// SC-204: Condition evaluator
// Pure function, no DB/I/O. evaluate(expr: ConditionExpr, flags: Set<string>): boolean
// Total: every expression the type permits evaluates without throwing.

import {
  ConditionExpr,
  FlagCondition,
  NotCondition,
  AndCondition,
  OrCondition,
  TrueCondition,
  FalseCondition,
} from './expression.js';

/**
 * The set of currently active/true flag slugs.
 * A flag is "set" (true) if its slug is in this set.
 * A flag is "cleared" (false) if its slug is NOT in this set.
 */
export type FlagSet = Set<string> | ReadonlySet<string>;

/**
 * Evaluates a condition expression against a set of active flag slugs.
 * 
 * Pure function: no side effects, no I/O, no exceptions for valid inputs.
 * 
 * For a flag condition:
 * - If expected=true: returns true if flag is IN the set (flag is set/true)
 * - If expected=false: returns true if flag is NOT in the set (flag is cleared/false)
 * 
 * For AND: returns true if ALL sub-expressions evaluate to true.
 *   Empty AND evaluates to true (mathematical identity).
 * For OR: returns true if ANY sub-expression evaluates to true.
 *   Empty OR evaluates to false (mathematical identity).
 * For NOT: returns the negation of the sub-expression.
 * For TRUE: always returns true.
 * For FALSE: always returns false.
 * 
 * @param expr - The condition expression to evaluate
 * @param flags - Set of flag slugs that are currently true/set
 * @returns true if the condition evaluates to true, false otherwise
 */
export function evaluate(expr: ConditionExpr, flags: FlagSet): boolean {
  switch (expr.type) {
    case 'flag':
      return evaluateFlag(expr, flags);
    case 'not':
      return !evaluate(expr.expr, flags);
    case 'and':
      return evaluateAnd(expr, flags);
    case 'or':
      return evaluateOr(expr, flags);
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      // Should never happen with a valid ConditionExpr
      // But we must return boolean (total function)
      return false;
  }
}

function evaluateFlag(expr: FlagCondition, flags: FlagSet): boolean {
  const isSet = flags.has(expr.flag);
  return isSet === expr.expected;
}

function evaluateAnd(expr: AndCondition, flags: FlagSet): boolean {
  // Empty AND is identity: true
  if (expr.exprs.length === 0) {
    return true;
  }
  // Short-circuit: stop at first false
  for (const subExpr of expr.exprs) {
    if (!evaluate(subExpr, flags)) {
      return false;
    }
  }
  return true;
}

function evaluateOr(expr: OrCondition, flags: FlagSet): boolean {
  // Empty OR is identity: false
  if (expr.exprs.length === 0) {
    return false;
  }
  // Short-circuit: stop at first true
  for (const subExpr of expr.exprs) {
    if (evaluate(subExpr, flags)) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluates a condition expression against a flag state object
 * (Record<string, boolean> instead of Set<string>).
 * 
 * This is a convenience wrapper for when flag state is stored as an object.
 * Flags not present in the object are treated as false.
 */
export function evaluateWithFlagObject(
  expr: ConditionExpr,
  flagState: Record<string, boolean>,
): boolean {
  // Convert flag object to a Set of true flag slugs
  const trueFlags = new Set<string>();
  for (const [slug, isSet] of Object.entries(flagState)) {
    if (isSet) {
      trueFlags.add(slug);
    }
  }
  return evaluate(expr, trueFlags);
}

/**
 * Creates a flag set from a flag state object.
 * Useful for interop between Set-based and object-based flag representations.
 */
export function flagSetFromObject(
  flagState: Record<string, boolean>,
): Set<string> {
  const result = new Set<string>();
  for (const [slug, isSet] of Object.entries(flagState)) {
    if (isSet) {
      result.add(slug);
    }
  }
  return result;
}

/**
 * Creates a flag state object from a Set of flag slugs.
 * All flags in the set are true; all others are false.
 * Note: this only includes flags that are explicitly true.
 * For a complete state object, you'd need to know all possible flag slugs.
 */
export function flagObjectFromSet(flags: FlagSet): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const slug of flags) {
    result[slug] = true;
  }
  return result;
}
