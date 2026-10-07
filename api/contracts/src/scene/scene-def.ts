// api/contracts/src/scene/scene-def.ts
// SC-301a: SceneDef core contract.
//
// Naming (SC-S12): the new situation-level entity is `SceneDef` in code; "Scene" stays
// the prose/product word. A bare `scene`/`scenes` identifier in code means the LEGACY
// location row (`public.scenes`), which is never renamed or extended.
//
// Pure data + pure functions. contracts is a leaf module: no imports from planning,
// runtime or shared.
//
// Runtime responsibility (SC-S13): `availability` (SC-310) is evaluated per player at
// runtime with the shared `evaluate`; overlay ordering/conflicts are settled at compile.

import type { WeatherTag } from '../weather/weather-tag.js';
import type { ValidationIssue } from '../validation/issue.js';
import { roleSlotToJSON, type RoleSlot } from './role-slot.js';
import { SCENE_SCHEMA_VERSION, SCENE_TIMES, isSceneTime, type SceneTime } from './scene-vocab.js';
import { validateScene } from './validate.js';

// Re-exported so `scene-def.js` stays the single entry point for the contract.
export { SCENE_SCHEMA_VERSION, SCENE_TIMES, isSceneTime };
export type { SceneTime };

/**
 * A scene definition: a situation at a location (as opposed to the legacy location
 * row, which is only a place/backdrop).
 */
export interface SceneDef {
  /** Stable identity (UUID-shaped string); `slug` is the authoring handle. */
  id: string;
  /** Identifier-valid authoring handle, unique per scene (see `isValidSlug`). */
  slug: string;
  title: string;
  description: string;
  /** Hard reference by UUID `id` to a legacy `public.scenes` location row (SC-S12). */
  location: string;
  /** Time-of-day constraint; `null` = any time. */
  time: SceneTime | null;
  /** Weather override; `null` = inherit the district default. */
  weather: WeatherTag | null;
  /**
   * Item slugs. SC-S9 has not decided props-only vs obtainable items — until it does
   * this is a plain list of slugs; do NOT grow an inventory ledger here.
   */
  items: string[];
  /** Dialogue tree/chunk slugs (not UUIDs, so scenes survive re-imports). Ordered. */
  dialogue_refs: string[];
  /** Cast positions (SC-302). `slot_id` is unique within the scene. */
  role_slots: RoleSlot[];
  /** Overlay precedence; base scenes use 0. */
  priority: number;
}

/** Thrown by `sceneDefFromJSON`; `issues` holds every error found (see `validateScene`). */
export class InvalidSceneDefError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(`Invalid SceneDef: ${issues.map((i) => i.message).join('; ')}`);
    this.name = 'InvalidSceneDefError';
    this.issues = issues;
  }
}

/**
 * Serializes a SceneDef to a plain JSON-compatible object with sorted keys and no
 * `undefined` (absent weather/time become `null`). Stable for content hashing (SC-403).
 */
export function sceneDefToJSON(scene: SceneDef): Record<string, unknown> {
  return {
    description: scene.description,
    dialogue_refs: [...scene.dialogue_refs],
    id: scene.id,
    items: [...scene.items],
    location: scene.location,
    priority: scene.priority,
    role_slots: scene.role_slots.map(roleSlotToJSON),
    schema_version: SCENE_SCHEMA_VERSION,
    slug: scene.slug,
    time: scene.time ?? null,
    title: scene.title,
    weather: scene.weather ?? null,
  };
}

/** Canonical bytes of a SceneDef: `JSON.stringify` of the sorted-key form. */
export function stringifySceneDef(scene: SceneDef): string {
  return JSON.stringify(sceneDefToJSON(scene));
}

/**
 * Deserializes a JSON-compatible object to a SceneDef. Same strictness as the
 * condition grammar's `fromJSON`: anything invalid — unknown or missing keys, wrong
 * types, `undefined`, a schema_version mismatch — throws `InvalidSceneDefError`
 * carrying every error issue from `validateScene` (warnings do not throw).
 */
export function sceneDefFromJSON(value: unknown): SceneDef {
  const { issues } = validateScene(value);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) throw new InvalidSceneDefError(errors);

  // validateScene vouched for the shape; copy field by field so no alias to the input survives.
  const obj = value as Record<string, any>;
  return {
    id: obj.id,
    slug: obj.slug,
    title: obj.title,
    description: obj.description,
    location: obj.location,
    time: obj.time,
    weather: obj.weather,
    items: [...obj.items],
    dialogue_refs: [...obj.dialogue_refs],
    role_slots: obj.role_slots.map((s: RoleSlot) => ({ slot_id: s.slot_id, cast: s.cast, position: s.position })),
    priority: obj.priority,
  };
}
