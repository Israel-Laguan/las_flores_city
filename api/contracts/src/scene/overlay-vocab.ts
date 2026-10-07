// api/contracts/src/scene/overlay-vocab.ts
// Constants shared by scene-overlay.ts (type + serialization) and overlay-validate.ts.
// Leaf file so the two can depend on it without importing each other.

/** Version of the serialized SceneOverlay shape; stamped by `toJSON`, checked on read. */
export const SCENE_OVERLAY_SCHEMA_VERSION = 1 as const;

/** Every key of the serialized overlay, in the sorted order `toJSON` emits them. */
export const SCENE_OVERLAY_JSON_KEYS = [
  'availability',
  'base_scene_slug',
  'ops',
  'priority',
  'schema_version',
  'slug',
] as const;

/**
 * The closed op set (SC-303a) — no free-form patch language. Each op's serialized
 * keys, sorted. The merge kind drives composition (SC-303b) and conflicts (SC-304):
 * - `additive`    — merged by identity (ref slug / slot_id), never positional.
 * - `conflicting` — targets one existing slot; equal-priority disagreement is a conflict.
 * - `exclusive`   — replaces one scene property; highest priority wins.
 */
export const SCENE_OVERLAY_OPS = {
  add_dialogue_refs: { kind: 'additive', keys: ['op', 'refs'] },
  add_items: { kind: 'additive', keys: ['items', 'op'] },
  add_role_slot: { kind: 'additive', keys: ['op', 'slot'] },
  cast_slot: { kind: 'conflicting', keys: ['cast', 'op', 'slot_id'] },
  set_weather: { kind: 'exclusive', keys: ['op', 'weather'] },
  set_time: { kind: 'exclusive', keys: ['op', 'time'] },
} as const;

export type SceneOverlayOpName = keyof typeof SCENE_OVERLAY_OPS;
export type SceneOverlayOpKind = (typeof SCENE_OVERLAY_OPS)[SceneOverlayOpName]['kind'];

export const SCENE_OVERLAY_OP_NAMES = Object.keys(SCENE_OVERLAY_OPS) as SceneOverlayOpName[];

export function isSceneOverlayOpName(value: unknown): value is SceneOverlayOpName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCENE_OVERLAY_OPS, value);
}
