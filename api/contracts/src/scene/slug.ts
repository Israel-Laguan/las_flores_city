// api/contracts/src/scene/slug.ts
// Shared slug rule for scene-model identifiers (scene slugs, item slugs, dialogue
// refs, cast slugs). One rule, defined once: the same identifier contract flags use
// (`FLAG_SLUG_PATTERN`, `MAX_SLUG_LENGTH`), so a slug is safe in SQL identifiers and
// JSON keys everywhere in the scene model.

import { FLAG_SLUG_PATTERN, MAX_SLUG_LENGTH } from '../flags/flag-definition.js';

/**
 * Checks whether `value` is a valid scene-model identifier slug.
 *
 * Uses the shared `FLAG_SLUG_PATTERN` and `MAX_SLUG_LENGTH` contract.
 *
 * @param value - Value to test
 * @returns true if `value` is a valid slug string
 */
export function isValidSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SLUG_LENGTH &&
    FLAG_SLUG_PATTERN.test(value)
  );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks whether `value` is a canonical 8-4-4-4-12 hex UUID.
 *
 * Accepts any version; fixtures may use non-RFC variants.
 *
 * @param value - Value to test
 * @returns true if `value` matches the UUID pattern
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
