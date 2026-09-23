// api/contracts/src/condition/expression.ts
// SC-203: Condition grammar type in contracts/condition
// A condition is a pure boolean expression over flag states.
// The grammar supports: flag test, negation, and, or, literal true/false.
// NO continuous-value comparison is representable (absent from type).
// Expressions serialize to/from JSON stably for content hashing.

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
 * Creates a flag condition.
 */
export function flag(flag: string, expected: boolean): FlagCondition {
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

  switch (a.type) {
    case 'flag':
      return a.flag === b.flag && a.expected === b.expected;
    case 'not':
      return equals(a.expr, b.expr);
    case 'and':
      return (
        a.exprs.length === b.exprs.length &&
        a.exprs.every((expr, i) => equals(expr, b.exprs[i]))
      );
    case 'or':
      return (
        a.exprs.length === b.exprs.length &&
        a.exprs.every((expr, i) => equals(expr, b.exprs[i]))
      );
    case 'true':
    case 'false':
      return true; // Both are the same singleton
    default:
      return false;
  }
}
