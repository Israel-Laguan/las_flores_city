// api/contracts/src/scene/scene-overlay.ts
// SC-303a: SceneOverlay contract — a layer applied on top of a base SceneDef.
//
// NOT the dialogue overlay. `shared/src/schemas/overlay.ts` (`OverlaySchema`) patches a
// dialogue tree, keyed by `target_tree_id`, with node-level modifications. A
// `SceneOverlay` targets a scene by `base_scene_slug` and changes it only through a
// small CLOSED op set (`SCENE_OVERLAY_OPS`) — there is no free-form patch language.
// Array-valued properties merge by identity (ref slug / `slot_id`), never positionally
// (SC-S3: naive `jsonb ||` is wrong for arrays).
//
// Runtime responsibility (SC-S13): `availability` is evaluated per player at runtime
// with the shared `evaluate`. Overlays whose availability is constant are folded into
// the base at compile; flag-gated overlays stay as ordered conditional layers and are
// selected at runtime. Ordering `(priority asc, slug asc)` and equal-priority conflicts
// are settled at compile (SC-304).
//
// Pure data + pure functions; contracts is a leaf module.

import type { ConditionExpr } from '../condition/expression.js';
import { TRUE, fromJSON as conditionFromJSON, toJSON as conditionToJSON } from '../condition/expression.js';
import type { ValidationIssue } from '../validation/issue.js';
import type { WeatherTag } from '../weather/weather-tag.js';
import { roleSlotToJSON, type RoleSlot } from './role-slot.js';
import { SCENE_OVERLAY_SCHEMA_VERSION } from './overlay-vocab.js';
import type { SceneTime } from './scene-vocab.js';
import { validateSceneOverlay } from './overlay-validate.js';

export type AddDialogueRefsOp = { op: 'add_dialogue_refs'; refs: string[] };
export type AddItemsOp = { op: 'add_items'; items: string[] };
/** Adds a new slot; composing it onto a scene that already has `slot_id` is an issue. */
export type AddRoleSlotOp = { op: 'add_role_slot'; slot: RoleSlot };
/** Assigns `cast` on an existing slot (`null` = reopen it). */
export type CastSlotOp = { op: 'cast_slot'; slot_id: string; cast: string | null };
/** `null` = explicitly clear back to "inherit the district default". */
export type SetWeatherOp = { op: 'set_weather'; weather: WeatherTag | null };
/** `null` = explicitly clear back to "any time". */
export type SetTimeOp = { op: 'set_time'; time: SceneTime | null };

export type SceneOverlayOp = AddDialogueRefsOp | AddItemsOp | AddRoleSlotOp | CastSlotOp | SetWeatherOp | SetTimeOp;

export interface SceneOverlay {
  /** Identifier-valid authoring handle, unique across overlays. */
  slug: string;
  /** Slug of the SceneDef this overlay layers onto. */
  base_scene_slug: string;
  /** Precedence among overlays on the same base; higher wins. Integer. */
  priority: number;
  /** Same condition grammar as scenes/dialogue/missions. `TRUE` = always applies. */
  availability: ConditionExpr;
  /** Applied in list order; at most one exclusive op per property (validated). */
  ops: SceneOverlayOp[];
}

export type SceneOverlayInput = Pick<SceneOverlay, 'slug' | 'base_scene_slug'> &
  Partial<Omit<SceneOverlay, 'slug' | 'base_scene_slug'>>;

/** Builds a SceneOverlay, defaulting availability = TRUE, priority = 0, ops = []. */
export function createSceneOverlay(input: SceneOverlayInput): SceneOverlay {
  return {
    slug: input.slug,
    base_scene_slug: input.base_scene_slug,
    priority: input.priority ?? 0,
    availability: input.availability ?? TRUE,
    ops: input.ops ?? [],
  };
}

/** Thrown by `sceneOverlayFromJSON`; `issues` holds every error found. */
export class InvalidSceneOverlayError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(`Invalid SceneOverlay: ${issues.map((i) => i.message).join('; ')}`);
    this.name = 'InvalidSceneOverlayError';
    this.issues = issues;
  }
}

/** Copies an op into its canonical form: sorted keys, fresh arrays/objects. */
export function sceneOverlayOpToJSON(op: SceneOverlayOp): Record<string, unknown> {
  switch (op.op) {
    case 'add_dialogue_refs':
      return { op: op.op, refs: [...op.refs] };
    case 'add_items':
      return { items: [...op.items], op: op.op };
    case 'add_role_slot':
      return { op: op.op, slot: roleSlotToJSON(op.slot) };
    case 'cast_slot':
      return { cast: op.cast ?? null, op: op.op, slot_id: op.slot_id };
    case 'set_weather':
      return { op: op.op, weather: op.weather ?? null };
    case 'set_time':
      return { op: op.op, time: op.time ?? null };
  }
}

/** Sorted-key, `undefined`-free JSON form; stable for content hashing (SC-403). */
export function sceneOverlayToJSON(overlay: SceneOverlay): Record<string, unknown> {
  return {
    availability: conditionToJSON(overlay.availability),
    base_scene_slug: overlay.base_scene_slug,
    ops: overlay.ops.map(sceneOverlayOpToJSON),
    priority: overlay.priority,
    schema_version: SCENE_OVERLAY_SCHEMA_VERSION,
    slug: overlay.slug,
  };
}

/** Canonical bytes of a SceneOverlay. */
export function stringifySceneOverlay(overlay: SceneOverlay): string {
  return JSON.stringify(sceneOverlayToJSON(overlay));
}

function opFromJSON(raw: Record<string, any>): SceneOverlayOp {
  switch (raw.op as SceneOverlayOp['op']) {
    case 'add_dialogue_refs':
      return { op: 'add_dialogue_refs', refs: [...raw.refs] };
    case 'add_items':
      return { op: 'add_items', items: [...raw.items] };
    case 'add_role_slot':
      return {
        op: 'add_role_slot',
        slot: { slot_id: raw.slot.slot_id, cast: raw.slot.cast, position: raw.slot.position },
      };
    case 'cast_slot':
      return { op: 'cast_slot', slot_id: raw.slot_id, cast: raw.cast };
    case 'set_weather':
      return { op: 'set_weather', weather: raw.weather };
    case 'set_time':
      return { op: 'set_time', time: raw.time };
  }
}

/**
 * Strict deserialization: any error issue from `validateSceneOverlay` throws
 * `InvalidSceneOverlayError` (warnings do not throw). The result shares no references
 * with the input.
 */
export function sceneOverlayFromJSON(value: unknown): SceneOverlay {
  const { issues } = validateSceneOverlay(value);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) throw new InvalidSceneOverlayError(errors);

  const obj = value as Record<string, any>;
  return {
    slug: obj.slug,
    base_scene_slug: obj.base_scene_slug,
    priority: obj.priority,
    availability: conditionFromJSON(obj.availability),
    ops: obj.ops.map(opFromJSON),
  };
}
