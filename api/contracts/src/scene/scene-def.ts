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
import { WEATHER_TAGS, isWeatherTag } from '../weather/weather-tag.js';
import { isUuid, isValidSlug } from './slug.js';
import {
  ROLE_SLOT_JSON_KEYS,
  SLOT_POSITIONS,
  findDuplicateSlotIds,
  isSlotPosition,
  roleSlotToJSON,
  type RoleSlot,
} from './role-slot.js';

/**
 * Version of the serialized SceneDef shape. Stamped into every `toJSON` output (and
 * therefore into content hashes) and checked by `fromJSON`. Bump on any shape change
 * that old payloads cannot satisfy.
 */
export const SCENE_SCHEMA_VERSION = 1 as const;

/**
 * Time-of-day tags a scene can pin. Matches `client/src/utils/time.ts`
 * (`day` / `sunset`-for-dusk / `night`). `null` = not time-constrained.
 */
export const SCENE_TIMES = ['day', 'sunset', 'night'] as const;
export type SceneTime = (typeof SCENE_TIMES)[number];

export function isSceneTime(value: unknown): value is SceneTime {
  return typeof value === 'string' && (SCENE_TIMES as readonly string[]).includes(value);
}

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

/** Thrown by `sceneDefFromJSON` when a payload is not a valid SceneDef. */
export class InvalidSceneDefError extends Error {
  constructor(message: string) {
    super(`Invalid SceneDef: ${message}`);
    this.name = 'InvalidSceneDefError';
  }
}

/** Every key of the serialized form, in the sorted order `toJSON` emits them. */
const SCENE_JSON_KEYS = [
  'description',
  'dialogue_refs',
  'id',
  'items',
  'location',
  'priority',
  'role_slots',
  'schema_version',
  'slug',
  'time',
  'title',
  'weather',
] as const;

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

function fail(path: string, expected: string): never {
  throw new InvalidSceneDefError(`'${path}' ${expected}`);
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string') fail(key, 'must be a string');
  return v;
}

function readSlugList(obj: Record<string, unknown>, key: string): string[] {
  const v = obj[key];
  if (!Array.isArray(v)) fail(key, 'must be an array');
  return v.map((entry, i) => {
    if (!isValidSlug(entry)) fail(`${key}[${i}]`, 'must be a valid slug');
    return entry;
  });
}

function readRoleSlots(obj: Record<string, unknown>): RoleSlot[] {
  const raw = obj.role_slots;
  if (!Array.isArray(raw)) fail('role_slots', 'must be an array');
  const slots = raw.map((entry, i): RoleSlot => {
    const path = `role_slots[${i}]`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) fail(path, 'must be an object');
    const slot = entry as Record<string, unknown>;
    for (const key of Object.keys(slot)) {
      if (!(ROLE_SLOT_JSON_KEYS as readonly string[]).includes(key)) {
        throw new InvalidSceneDefError(`unknown field '${key}' in '${path}'`);
      }
    }
    if (!isValidSlug(slot.slot_id)) fail(`${path}.slot_id`, 'must be a valid slug');
    if (slot.cast !== null && !isValidSlug(slot.cast)) fail(`${path}.cast`, 'must be null or a valid character slug');
    if (!isSlotPosition(slot.position)) fail(`${path}.position`, `must be one of: ${SLOT_POSITIONS.join(', ')}`);
    return { slot_id: slot.slot_id, cast: slot.cast, position: slot.position };
  });
  const [dupe] = findDuplicateSlotIds(slots);
  if (dupe !== undefined) throw new InvalidSceneDefError(`duplicate slot_id '${dupe}' in 'role_slots'`);
  return slots;
}

/**
 * Deserializes a JSON-compatible object to a SceneDef. Same strictness as the
 * condition grammar's `fromJSON`: anything unexpected — unknown or missing keys, wrong
 * types, `undefined`, a schema_version mismatch — throws `InvalidSceneDefError`.
 */
export function sceneDefFromJSON(value: unknown): SceneDef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidSceneDefError('expected an object');
  }
  const obj = value as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!(SCENE_JSON_KEYS as readonly string[]).includes(key)) {
      throw new InvalidSceneDefError(`unknown field '${key}'`);
    }
  }
  for (const key of SCENE_JSON_KEYS) {
    if (obj[key] === undefined) fail(key, 'is required');
  }

  if (obj.schema_version !== SCENE_SCHEMA_VERSION) {
    fail('schema_version', `must be ${SCENE_SCHEMA_VERSION}`);
  }

  const id = readString(obj, 'id');
  const slug = readString(obj, 'slug');
  if (!isValidSlug(slug)) fail('slug', 'must be a valid slug');
  const location = readString(obj, 'location');
  if (!isUuid(location)) fail('location', 'must be a UUID');

  const time = obj.time;
  if (time !== null && !isSceneTime(time)) fail('time', `must be null or one of: ${SCENE_TIMES.join(', ')}`);

  const weather = obj.weather;
  if (weather !== null && !isWeatherTag(weather)) {
    fail('weather', `must be null or one of: ${WEATHER_TAGS.join(', ')}`);
  }

  const priority = obj.priority;
  if (typeof priority !== 'number' || !Number.isInteger(priority)) fail('priority', 'must be an integer');

  return {
    id,
    slug,
    title: readString(obj, 'title'),
    description: readString(obj, 'description'),
    location,
    time,
    weather,
    items: readSlugList(obj, 'items'),
    dialogue_refs: readSlugList(obj, 'dialogue_refs'),
    role_slots: readRoleSlots(obj),
    priority,
  };
}
