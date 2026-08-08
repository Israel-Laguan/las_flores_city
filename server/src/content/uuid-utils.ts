/**
 * Shared handling for the zero-UUID "no reference" placeholder.
 *
 * Content files sometimes use the all-zero UUID to mean "this FK intentionally
 * points at nothing" (e.g. `scene_id` on a dialogue tree). That value does not
 * exist in the referenced table, so it must be normalized to NULL before it
 * reaches the database or it will violate the foreign-key constraint.
 *
 * Both the upsert path (content-upserts.ts) and the migration scrub
 * (migrate.ts) depend on this exact value, so it lives here to keep them from
 * drifting apart.
 */
export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Normalize a UUID-ish value for FK columns: empty/missing values and the
 * zero-UUID placeholder both become NULL.
 */
export function normalizeUuid(value: any): string | null {
  if (!value || value === ZERO_UUID) return null;
  return value;
}
