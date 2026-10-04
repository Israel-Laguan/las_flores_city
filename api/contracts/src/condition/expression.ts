// api/contracts/src/condition/expression.ts
// SC-203: Condition grammar type in contracts/condition
// A condition is a pure boolean expression over flag states.
// The grammar supports: flag test, negation, and, or, literal true/false.
// NO continuous-value comparison is representable (absent from type).
// Expressions serialize to/from JSON stably for content hashing.

// Single source of truth for the flag-slug contract: FlagDefinition enforces it,
// so a condition referencing a slug the registry could never declare is malformed.
import { validateFlagSlug } from '../flags/flag-definition.js';

/**
 * Base type for all condition expressions.
 * Discriminated union with a `type` field.
 */
export type ConditionExpr =
  | FlagCondition
  | NotCondition
  | AndCondition
  | OrCondition
  | TrueCondition
  | FalseCondition;

/**
 * Tests whether a specific flag is set to the expected boolean value.
 */
export interface FlagCondition {
  type: 'flag';
  /** The flag slug to test */
  flag: string;
  /** The expected boolean value of the flag */
  expected: boolean;
}

/**
 * Logical NOT of a sub-expression.
 */
export interface NotCondition {
  type: 'not';
  /** The expression to negate */
  expr: ConditionExpr;
}

/**
 * Logical AND of multiple sub-expressions.
 * All must evaluate to true for the AND to be true.
 * Empty list evaluates to true (identity for AND).
 */
export interface AndCondition {
  type: 'and';
  /** List of expressions to AND together */
  exprs: ReadonlyArray<ConditionExpr>;
}

/**
 * Logical OR of multiple sub-expressions.
 * Any one evaluating to true makes the OR true.
 * Empty list evaluates to false (identity for OR).
 */
export interface OrCondition {
  type: 'or';
  /** List of expressions to OR together */
  exprs: ReadonlyArray<ConditionExpr>;
}

/**
 * Literal true constant.
 */
export interface TrueCondition {
  type: 'true';
}

/**
 * Literal false constant.
 */
export interface FalseCondition {
  type: 'false';
}

/**
 * Type guard for ConditionExpr.
 *
 * A `flag` condition's slug is validated with the shared `validateFlagSlug`
 * contract (same one `FlagDefinition`/`createFlagDefinition` enforce) rather than
 * a bare `typeof === 'string'`. Otherwise a malformed reference such as
 * `{ flag: 'has key', expected: false }` passes the guard, can never be declared
 * in the flag registry, and evaluates as *true* whenever unset — a content typo
 * that silently reads as satisfied.
 */
export function isConditionExpr(value: unknown): value is ConditionExpr {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== 'string') {
    return false;
  }
  switch (type) {
    case 'flag':
      return (
        typeof obj.flag === 'string' &&
        isValidFlagSlug(obj.flag) &&
        typeof obj.expected === 'boolean'
      );
    case 'not':
      return isConditionExpr(obj.expr);
    case 'and':
      return Array.isArray(obj.exprs) && obj.exprs.every(isConditionExpr);
    case 'or':
      return Array.isArray(obj.exprs) && obj.exprs.every(isConditionExpr);
    case 'true':
      return Object.keys(obj).length === 1; // only 'type' field
    case 'false':
      return Object.keys(obj).length === 1; // only 'type' field
    default:
      return false;
  }
}

/**
 * Non-throwing form of `validateFlagSlug`, for use inside type guards.
 */
function isValidFlagSlug(slug: string): boolean {
  try {
    validateFlagSlug(slug);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a flag condition.
 *
 * Validates the slug with the shared contract so `flag()` cannot build a
 * reference that `FlagDefinition` would refuse to declare.
 */
export function flag(flag: string, expected: boolean): FlagCondition {
  validateFlagSlug(flag);
  return { type: 'flag', flag, expected };
}

/**
 * Creates a NOT condition.
 */
export function not(expr: ConditionExpr): NotCondition {
  return { type: 'not', expr };
}

/**
 * Creates an AND condition from an array of expressions.
 */
export function and(exprs: ReadonlyArray<ConditionExpr>): AndCondition {
  return { type: 'and', exprs };
}

/**
 * Creates an OR condition from an array of expressions.
 */
export function or(exprs: ReadonlyArray<ConditionExpr>): OrCondition {
  return { type: 'or', exprs };
}

/**
 * The literal true condition.
 */
export const TRUE: TrueCondition = { type: 'true' };

/**
 * The literal false condition.
 */
export const FALSE: FalseCondition = { type: 'false' };

/**
 * Statically extracts all referenced flag slugs from a condition expression.
 * Returns an array of unique flag slugs in deterministic order (sorted).
 * This is used for dependency analysis and validation.
 */
export function extractFlagSlugs(expr: ConditionExpr): string[] {
  const slugs = new Set<string>();
  extractFlagSlugsInternal(expr, slugs);
  return Array.from(slugs).sort();
}

function extractFlagSlugsInternal(
  expr: ConditionExpr,
  slugs: Set<string>,
): void {
  switch (expr.type) {
    case 'flag':
      slugs.add(expr.flag);
      break;
    case 'not':
      extractFlagSlugsInternal(expr.expr, slugs);
      break;
    case 'and':
    case 'or':
      for (const subExpr of expr.exprs) {
        extractFlagSlugsInternal(subExpr, slugs);
      }
      break;
    case 'true':
    case 'false':
      // No flags referenced
      break;
    default:
      // Should never happen if expr is a valid ConditionExpr
      break;
  }
}

/**
 * Serializes a condition expression to a JSON-compatible object.
 * Stable serialization for content hashing.
 * Keys are ordered for deterministic output.
 */
export function toJSON(expr: ConditionExpr): unknown {
  switch (expr.type) {
    case 'flag':
      return { type: 'flag', flag: expr.flag, expected: expr.expected };
    case 'not':
      return { type: 'not', expr: toJSON(expr.expr) };
    case 'and':
      return { type: 'and', exprs: expr.exprs.map(toJSON) };
    case 'or':
      return { type: 'or', exprs: expr.exprs.map(toJSON) };
    case 'true':
      return { type: 'true' };
    case 'false':
      return { type: 'false' };
    default:
      // Should never happen
      return null;
  }
}

/**
 * Deserializes a JSON-compatible object to a ConditionExpr.
 * Throws if the input is not a valid condition expression.
 */
export function fromJSON(value: unknown): ConditionExpr {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Invalid condition expression: expected object, got ${typeof value}`);
  }

  const obj = value as Record<string, unknown>;
  const type = obj.type;

  if (typeof type !== 'string') {
    throw new Error(`Invalid condition expression: missing or invalid 'type' field`);
  }

  switch (type) {
    case 'flag': {
      if (typeof obj.flag !== 'string') {
        throw new Error("Invalid flag condition: 'flag' must be a string");
      }
      // Same slug contract as `flag()` / `isConditionExpr` — deserialising a typo
      // from content JSON must not produce a reference the registry could not hold.
      try {
        validateFlagSlug(obj.flag);
      } catch (err) {
        throw new Error(`Invalid flag condition: 'flag' is not a valid flag slug (${String(err)})`);
      }
      if (typeof obj.expected !== 'boolean') {
        throw new Error("Invalid flag condition: 'expected' must be a boolean");
      }
      return { type: 'flag', flag: obj.flag, expected: obj.expected };
    }
    case 'not': {
      if (!isConditionExpr(obj.expr)) {
        throw new Error("Invalid not condition: 'expr' must be a valid condition expression");
      }
      return { type: 'not', expr: fromJSON(obj.expr) };
    }
    case 'and': {
      if (!Array.isArray(obj.exprs)) {
        throw new Error("Invalid and condition: 'exprs' must be an array");
      }
      return { type: 'and', exprs: obj.exprs.map(fromJSON) };
    }
    case 'or': {
      if (!Array.isArray(obj.exprs)) {
        throw new Error("Invalid or condition: 'exprs' must be an array");
      }
      return { type: 'or', exprs: obj.exprs.map(fromJSON) };
    }
    case 'true': {
      if (Object.keys(obj).length !== 1) {
        throw new Error("Invalid true condition: must have only 'type' field");
      }
      return { type: 'true' };
    }
    case 'false': {
      if (Object.keys(obj).length !== 1) {
        throw new Error("Invalid false condition: must have only 'type' field");
      }
      return { type: 'false' };
    }
    default:
      throw new Error(`Invalid condition expression: unknown type '${type}'`);
  }
}

/**
 * Deep equality check for condition expressions.
 * Useful for testing and caching.
 */
export function equals(a: ConditionExpr, b: ConditionExpr): boolean {
  if (a.type !== b.type) {
    return false;
  }

  // `b` is not narrowed by the switch on `a.type` alone — the early
  // `a.type !== b.type` guard does not narrow `b` on this TS version — so each
  // case re-checks the discriminant before touching `b`'s fields.
  switch (a.type) {
    case 'flag':
      return (
        a.flag === (b as FlagCondition).flag &&
        a.expected === (b as FlagCondition).expected
      );
    case 'not':
      return equals(a.expr, (b as NotCondition).expr);
    case 'and':
      return equalsExprLists(a.exprs, (b as AndCondition).exprs);
    case 'or':
      return equalsExprLists(a.exprs, (b as OrCondition).exprs);
    case 'true':
    case 'false':
      return true; // Both are the same singleton
    default:
      return false;
  }
}

function equalsExprLists(
  a: ReadonlyArray<ConditionExpr>,
  b: ReadonlyArray<ConditionExpr>,
): boolean {
  return (
    a.length === b.length && a.every((expr, i) => equals(expr, b[i]))
  );
}
