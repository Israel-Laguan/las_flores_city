import { z } from 'zod';

/**
 * Relaxed UUID validator matching Zod v3 behavior.
 *
 * Zod v4 tightened `.uuid()` to require RFC 4122 version+variant bits,
 * which breaks existing content files and test fixtures that use plain
 * hex-format UUIDs. This helper accepts the original relaxed pattern:
 *   ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function zodUuid(message?: string) {
  return z.string().regex(UUID_REGEX, message ?? 'Invalid UUID');
}

/** Boolean type guard matching the same canonical UUID rule used by the schemas. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function zodUuidOptional(message?: string) {
  return zodUuid(message).optional();
}

export function zodUuidNullable(message?: string) {
  return zodUuid(message).nullable();
}

export function zodUuidArray(message?: string) {
  return z.array(zodUuid(message));
}
