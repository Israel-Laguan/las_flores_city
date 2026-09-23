// api/contracts/src/flags/flag-definition.ts
// SC-201: Flag definition shape in contracts/flags
// A flag is a stable boolean state declared in planning canon and
// evaluated at runtime. Two semantics: latching (persists after set),
// tracking (clears when condition falls below threshold).

/**
 * Semantics for how a flag behaves after being set.
 * - 'latching': Once set, persists until explicitly cleared by a planning operation.
 *   Does NOT auto-clear when the condition that set it becomes false.
 * - 'tracking': Automatically clears when the condition that set it becomes false.
 */
export type FlagSemantics = 'latching' | 'tracking';

/**
 * A flag definition declares a named boolean state that can be set
 * by planning and read by runtime. Slugs MUST be valid identifiers
 * (matching /^[a-zA-Z_][a-zA-Z0-9_]*$/ and <= 256 chars) for safe
 * use in SQL identifiers and JSON keys.
 */
export interface FlagDefinition {
  /**
   * Stable identifier. Must be a valid identifier:
   * - Starts with a letter or underscore
   * - Contains only letters, digits, underscores
   * - Max 256 characters
   */
  slug: string;

  /**
   * Human-readable description of what this flag means when set.
   * e.g., "Player has solved the Great Lithium Leak mystery"
   */
  meaning: string;

  /**
   * How the flag behaves after being set. Required, no default.
   */
  semantics: FlagSemantics;
}

/**
 * Runtime representation of a flag's current boolean state.
 * Used when evaluating conditions.
 */
export type FlagState = Record<string, boolean>;

/**
 * Validates that a slug string is a valid identifier for use in
 * SQL and JSON contexts.
 */
export const FLAG_SLUG_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const MAX_SLUG_LENGTH = 256;

/**
 * Validation error for invalid flag slugs.
 */
export class InvalidFlagSlugError extends Error {
  constructor(slug: string, message: string) {
    super(`Invalid flag slug '${slug}': ${message}`);
    this.name = 'InvalidFlagSlugError';
  }
}

/**
 * Validates a flag slug. Throws InvalidFlagSlugError if invalid.
 */
export function validateFlagSlug(slug: string): void {
  if (typeof slug !== 'string') {
    throw new InvalidFlagSlugError(String(slug), 'slug must be a string');
  }

  if (slug.length === 0) {
    throw new InvalidFlagSlugError(slug, 'slug must not be empty');
  }

  if (slug.length > MAX_SLUG_LENGTH) {
    throw new InvalidFlagSlugError(
      slug,
      `slug must be at most ${MAX_SLUG_LENGTH} characters`,
    );
  }

  if (!FLAG_SLUG_PATTERN.test(slug)) {
    throw new InvalidFlagSlugError(
      slug,
      'slug must start with a letter or underscore and contain only letters, digits, and underscores',
    );
  }

  // Reserved prefixes/suffixes that would conflict with internal naming
  const reservedPrefixes = ['_', '__'];
  if (reservedPrefixes.some((p) => slug.startsWith(p))) {
    throw new InvalidFlagSlugError(
      slug,
      'slug must not start with reserved prefixes (_, __)',
    );
  }
}

/**
 * Creates a validated FlagDefinition. Throws if the slug is invalid.
 */
export function createFlagDefinition(
  slug: string,
  meaning: string,
  semantics: FlagSemantics,
): FlagDefinition {
  validateFlagSlug(slug);
  return { slug, meaning, semantics };
}

/**
 * Type guard to check if a value is a valid FlagDefinition.
 */
export function isFlagDefinition(value: unknown): value is FlagDefinition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.slug === 'string' &&
    typeof obj.meaning === 'string' &&
    (obj.semantics === 'latching' || obj.semantics === 'tracking')
  );
}
