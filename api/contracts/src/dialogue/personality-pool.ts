// api/contracts/src/dialogue/personality-pool.ts
// SC-306: a personality pool — a named set of context-filtered lines that MANY characters
// can share (proposal §2.6: "20 vendors share a pool"). A pool is keyed on coarse world
// state only (time, weather via each line's `when`); it knows nothing about any one character,
// the player, or relationships, and carries no traits or stats (R7). Which characters use a
// pool is a link, stored separately (planning.character_pools), never a field here.
//
// Pure data + pure functions; contracts is a leaf module.

import { createValidationResult, issuePath, type IssueSeverity, type ValidationIssue, type ValidationResult } from '../validation/issue.js';
import { checkPoolLine, poolLineFromJSON, poolLineToJSON, type PoolLine } from '../scene/line.js';
import { isValidSlug } from '../scene/slug.js';

export const PERSONALITY_POOL_SCHEMA_VERSION = 1 as const;

export const PERSONALITY_POOL_JSON_KEYS = ['lines', 'schema_version', 'slug'] as const;

export interface PersonalityPool {
  /** Identifier-valid authoring handle, unique across pools. */
  slug: string;
  /** At least one line; `line_id` unique within the pool. */
  lines: PoolLine[];
}

export type PersonalityPoolInput = Pick<PersonalityPool, 'slug'> & Partial<Omit<PersonalityPool, 'slug'>>;

export function createPersonalityPool(input: PersonalityPoolInput): PersonalityPool {
  return { slug: input.slug, lines: input.lines ?? [] };
}

export const POOL_ISSUE_CODES = {
  POOL_NOT_OBJECT: 'POOL_NOT_OBJECT',
  POOL_FIELD_UNKNOWN: 'POOL_FIELD_UNKNOWN',
  POOL_FIELD_MISSING: 'POOL_FIELD_MISSING',
  POOL_FIELD_TYPE: 'POOL_FIELD_TYPE',
  POOL_SCHEMA_VERSION_MISMATCH: 'POOL_SCHEMA_VERSION_MISMATCH',
  POOL_SLUG_INVALID: 'POOL_SLUG_INVALID',
  POOL_LINES_EMPTY: 'POOL_LINES_EMPTY',
  POOL_LINE_INVALID: 'POOL_LINE_INVALID',
  POOL_LINE_DUPLICATE: 'POOL_LINE_DUPLICATE',
} as const;

export type PoolIssueCode = (typeof POOL_ISSUE_CODES)[keyof typeof POOL_ISSUE_CODES];
export type PoolIssue = ValidationIssue<PoolIssueCode>;
export type PoolValidationResult = ValidationResult<PoolIssueCode>;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Tier-1 validation of an untrusted value as a PersonalityPool (shape only; never throws;
 * collects every issue in one pass).
 *
 * | code                         | severity | meaning                                              |
 * | POOL_NOT_OBJECT              | error    | input is not a plain object                          |
 * | POOL_FIELD_UNKNOWN           | error    | key outside {lines, schema_version, slug}: a pool    |
 * |                              |          | can never carry traits, stats or character data      |
 * | POOL_FIELD_MISSING           | error    | required key absent                                  |
 * | POOL_FIELD_TYPE              | error    | `lines` is not an array                              |
 * | POOL_SCHEMA_VERSION_MISMATCH | error    | schema_version != PERSONALITY_POOL_SCHEMA_VERSION    |
 * | POOL_SLUG_INVALID            | error    | slug is not identifier-valid                         |
 * | POOL_LINES_EMPTY             | error    | a pool needs at least one line                       |
 * | POOL_LINE_INVALID            | error    | shape problem in a line (key, slug, text, `when`)    |
 * | POOL_LINE_DUPLICATE          | error    | `line_id` repeats an earlier line                    |
 */
export function validatePersonalityPool(input: unknown): PoolValidationResult {
  const issues: PoolIssue[] = [];
  const add = (code: PoolIssueCode, path: string, message: string, severity: IssueSeverity = 'error') => issues.push({ code, path, message, severity });
  if (!isPlainObject(input)) {
    add('POOL_NOT_OBJECT', '', 'personality pool must be an object');
    return createValidationResult(issues);
  }
  for (const key of Object.keys(input)) {
    if (!(PERSONALITY_POOL_JSON_KEYS as readonly string[]).includes(key)) add('POOL_FIELD_UNKNOWN', key, `unknown field '${key}' (a pool has no traits, stats or character data)`);
  }
  for (const key of PERSONALITY_POOL_JSON_KEYS) {
    if (input[key] === undefined) add('POOL_FIELD_MISSING', key, `'${key}' is required`);
  }
  if (input.schema_version !== undefined && input.schema_version !== PERSONALITY_POOL_SCHEMA_VERSION) {
    add('POOL_SCHEMA_VERSION_MISMATCH', 'schema_version', `'schema_version' must be ${PERSONALITY_POOL_SCHEMA_VERSION}`);
  }
  if (input.slug !== undefined && !isValidSlug(input.slug)) add('POOL_SLUG_INVALID', 'slug', `'slug' must be an identifier-valid slug`);
  if (input.lines !== undefined) {
    if (!Array.isArray(input.lines)) {
      add('POOL_FIELD_TYPE', 'lines', `'lines' must be an array`);
    } else {
      if (input.lines.length === 0) add('POOL_LINES_EMPTY', 'lines', 'a pool needs at least one line');
      const seen = new Set<string>();
      input.lines.forEach((line, i) => {
        const path = issuePath('lines', i);
        const problems = checkPoolLine(line, path);
        for (const p of problems) add('POOL_LINE_INVALID', p.path, p.message);
        if (problems.length > 0 || !isPlainObject(line)) return;
        const id = line.line_id as string;
        if (seen.has(id)) add('POOL_LINE_DUPLICATE', path, `duplicate line_id '${id}'`);
        seen.add(id);
      });
    }
  }
  return createValidationResult(issues);
}

export class InvalidPersonalityPoolError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(`Invalid PersonalityPool: ${issues.map((i) => i.message).join('; ')}`);
    this.name = 'InvalidPersonalityPoolError';
    this.issues = issues;
  }
}

/** Sorted-key, `undefined`-free JSON; stable for content hashing. Lines keep their authored order. */
export function personalityPoolToJSON(pool: PersonalityPool): Record<string, unknown> {
  return { lines: pool.lines.map(poolLineToJSON), schema_version: PERSONALITY_POOL_SCHEMA_VERSION, slug: pool.slug };
}

export function stringifyPersonalityPool(pool: PersonalityPool): string {
  return JSON.stringify(personalityPoolToJSON(pool));
}

/** Strict deserialization; throws InvalidPersonalityPoolError carrying every error. */
export function personalityPoolFromJSON(value: unknown): PersonalityPool {
  const { issues } = validatePersonalityPool(value);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) throw new InvalidPersonalityPoolError(errors);
  const obj = value as Record<string, any>;
  return { slug: obj.slug, lines: obj.lines.map((l: Record<string, any>) => poolLineFromJSON(l)) };
}
