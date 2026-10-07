// api/contracts/src/scene/slug.ts
// Shared slug rule for scene-model identifiers (scene slugs, item slugs, dialogue
// refs, cast slugs). One rule, defined once: the same identifier contract flags use
// (`FLAG_SLUG_PATTERN`, `MAX_SLUG_LENGTH`), so a slug is safe in SQL identifiers and
// JSON keys everywhere in the scene model.

import { FLAG_SLUG_PATTERN, MAX_SLUG_LENGTH } from '../flags/flag-definition.js';

/** Non-throwing slug check for scene-model identifiers. */
export function isValidSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SLUG_LENGTH &&
    FLAG_SLUG_PATTERN.test(value)
  );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical 8-4-4-4-12 hex UUID (any version; fixtures use non-RFC variants). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
