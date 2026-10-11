// api/contracts/src/scene/scene-vocab.ts
// Constants shared by scene-def.ts (type + serialization) and validate.ts. Kept in a
// leaf file so the two can depend on it without importing each other.

/**
 * Version of the serialized SceneDef shape. Stamped into every `toJSON` output (and
 * therefore into content hashes) and checked on read. Bump on any shape change that
 * old payloads cannot satisfy.
 *
 * v2 (SC-307): adds `slot_lines` (dialogue keyed by role slot). No v1 payloads were ever
 * persisted outside tests (planning.scene_defs held 0 rows when this landed), so v1 is
 * rejected rather than migrated.
 */
export const SCENE_SCHEMA_VERSION = 2 as const;

/**
 * Time-of-day tags a scene can pin. Matches `client/src/utils/time.ts`
 * (`day` / `sunset`-for-dusk / `night`). `null` = not time-constrained.
 */
export const SCENE_TIMES = ['day', 'sunset', 'night'] as const;
export type SceneTime = (typeof SCENE_TIMES)[number];

/**
 * Type guard for a scene time value.
 *
 * @param value - Value to test
 * @returns true if `value` is 'day', 'sunset', or 'night'
 */
export function isSceneTime(value: unknown): value is SceneTime {
  return typeof value === 'string' && (SCENE_TIMES as readonly string[]).includes(value);
}

/** Every key of the serialized form, in the sorted order `toJSON` emits them. */
export const SCENE_JSON_KEYS = [
  'availability',
  'description',
  'dialogue_refs',
  'id',
  'items',
  'location',
  'priority',
  'role_slots',
  'schema_version',
  'slot_lines',
  'slug',
  'time',
  'title',
  'weather',
] as const;
