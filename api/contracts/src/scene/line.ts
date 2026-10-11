// api/contracts/src/scene/line.ts
// SC-307/306: the line shape shared by scene slot lines and (SC-306) personality pools.
//
// A line is text plus an optional context filter (`when`). Each `when` key is an
// allow-list: an ABSENT key leaves that dimension unconstrained; a present key must be a
// non-empty list (an empty list would match nothing, so it is rejected, not tolerated).
// Lists are sets: the canonical JSON sorts and de-duplicates them so a content hash does
// not depend on authoring order. Pure data and pure functions; contracts is a leaf module.

import { WEATHER_TAGS, isWeatherTag, type WeatherTag } from '../weather/weather-tag.js';
import { SCENE_TIMES, isSceneTime, type SceneTime } from './scene-vocab.js';
import { isValidSlug } from './slug.js';

export interface LineWhen {
  time?: SceneTime[];
  weather?: WeatherTag[];
}

/** A line spoken by whoever is cast in `slot_id` (keyed by slot, never by character). */
export interface SlotLine {
  slot_id: string;
  line_id: string;
  text: string;
  when: LineWhen;
}

export const LINE_WHEN_KEYS = ['time', 'weather'] as const;
export const SLOT_LINE_JSON_KEYS = ['line_id', 'slot_id', 'text', 'when'] as const;

/** A shape problem found by the shared checkers; each validator maps it to its own code. */
export interface LineProblem {
  path: string;
  message: string;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const sortedUnique = <T extends string>(values: readonly T[]): T[] => [...new Set(values)].sort();

/** Canonical JSON form of a `when`: sorted keys, sorted de-duplicated lists, absent keys omitted. */
export function lineWhenToJSON(when: LineWhen): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (when.time !== undefined) out.time = sortedUnique(when.time);
  if (when.weather !== undefined) out.weather = sortedUnique(when.weather);
  return out;
}

/** Copy of a validated `when` (no aliasing). Call only after `checkLineWhen` found no problems. */
export function lineWhenFromJSON(raw: Record<string, any>): LineWhen {
  const when: LineWhen = {};
  if (raw.time !== undefined) when.time = [...raw.time];
  if (raw.weather !== undefined) when.weather = [...raw.weather];
  return when;
}

/**
 * Number of dimensions a `when` constrains. The specificity ladder (SC-308) prefers the
 * candidate that constrains more dimensions.
 */
export function lineWhenSpecificity(when: LineWhen): number {
  return (when.time !== undefined ? 1 : 0) + (when.weather !== undefined ? 1 : 0);
}

/** Shape check of an untrusted `when` at `path`. */
export function checkLineWhen(value: unknown, path: string): LineProblem[] {
  if (!isPlainObject(value)) return [{ path, message: `'${path}' must be an object (use {} for unconstrained)` }];
  const problems: LineProblem[] = [];
  for (const key of Object.keys(value)) {
    if (!(LINE_WHEN_KEYS as readonly string[]).includes(key)) {
      problems.push({ path: `${path}.${key}`, message: `unknown field '${key}'` });
    }
  }
  const dims = [
    ['time', SCENE_TIMES, isSceneTime],
    ['weather', WEATHER_TAGS, isWeatherTag],
  ] as const;
  for (const [key, vocab, guard] of dims) {
    const list = value[key];
    if (list === undefined) continue;
    const at = `${path}.${key}`;
    if (!Array.isArray(list) || list.length === 0) {
      problems.push({ path: at, message: `'${at}' must be a non-empty array (omit the key to leave it unconstrained)` });
    } else if (!list.every(guard)) {
      problems.push({ path: at, message: `'${at}' entries must be one of: ${vocab.join(', ')}` });
    }
  }
  return problems;
}

/** Shape check of an untrusted slot line at `path`. */
export function checkSlotLine(value: unknown, path: string): LineProblem[] {
  if (!isPlainObject(value)) return [{ path, message: `'${path}' must be an object` }];
  const problems: LineProblem[] = [];
  for (const key of Object.keys(value)) {
    if (!(SLOT_LINE_JSON_KEYS as readonly string[]).includes(key)) {
      problems.push({ path: `${path}.${key}`, message: `unknown field '${key}'` });
    }
  }
  if (!isValidSlug(value.slot_id)) problems.push({ path: `${path}.slot_id`, message: `'${path}.slot_id' must be a valid slug` });
  if (!isValidSlug(value.line_id)) problems.push({ path: `${path}.line_id`, message: `'${path}.line_id' must be a valid slug` });
  if (typeof value.text !== 'string' || value.text.trim() === '') {
    problems.push({ path: `${path}.text`, message: `'${path}.text' must be a non-empty string` });
  }
  if (value.when === undefined) {
    problems.push({ path: `${path}.when`, message: `'${path}.when' is required (use {} for unconstrained)` });
  } else {
    problems.push(...checkLineWhen(value.when, `${path}.when`));
  }
  return problems;
}

/** Canonical JSON form of a slot line (sorted keys). */
export function slotLineToJSON(line: SlotLine): Record<string, unknown> {
  return { line_id: line.line_id, slot_id: line.slot_id, text: line.text, when: lineWhenToJSON(line.when) };
}

/** Copy of a validated slot line (no aliasing). Call only after `checkSlotLine` found no problems. */
export function slotLineFromJSON(raw: Record<string, any>): SlotLine {
  return { slot_id: raw.slot_id, line_id: raw.line_id, text: raw.text, when: lineWhenFromJSON(raw.when) };
}

/** `slot_id` + `line_id`: the identity additive composition merges on. */
export const slotLineKey = (line: Pick<SlotLine, 'slot_id' | 'line_id'>): string => `${line.slot_id}.${line.line_id}`;

// ── Personality pool lines (SC-306) ─────────────────────────────────────────────────────
// A pool line is a slot line without a slot: text + `when`, identified by `line_id` within its
// pool. It can only ever carry these keys, so a pool can never hold traits, stats or
// relationship data (R7, proposal §2.5): an extra key is a validation error.

export interface PoolLine {
  line_id: string;
  text: string;
  when: LineWhen;
}

export const POOL_LINE_JSON_KEYS = ['line_id', 'text', 'when'] as const;

/** Shape check of an untrusted pool line at `path`. */
export function checkPoolLine(value: unknown, path: string): LineProblem[] {
  if (!isPlainObject(value)) return [{ path, message: `'${path}' must be an object` }];
  const problems: LineProblem[] = [];
  for (const key of Object.keys(value)) {
    if (!(POOL_LINE_JSON_KEYS as readonly string[]).includes(key)) {
      problems.push({ path: `${path}.${key}`, message: `unknown field '${key}' (a pool line is only line_id, text, when)` });
    }
  }
  if (!isValidSlug(value.line_id)) problems.push({ path: `${path}.line_id`, message: `'${path}.line_id' must be a valid slug` });
  if (typeof value.text !== 'string' || value.text.trim() === '') {
    problems.push({ path: `${path}.text`, message: `'${path}.text' must be a non-empty string` });
  }
  if (value.when === undefined) problems.push({ path: `${path}.when`, message: `'${path}.when' is required (use {} for unconstrained)` });
  else problems.push(...checkLineWhen(value.when, `${path}.when`));
  return problems;
}

/** Canonical JSON form of a pool line (sorted keys). */
export function poolLineToJSON(line: PoolLine): Record<string, unknown> {
  return { line_id: line.line_id, text: line.text, when: lineWhenToJSON(line.when) };
}

/** Copy of a validated pool line (no aliasing). Call only after `checkPoolLine` found no problems. */
export function poolLineFromJSON(raw: Record<string, any>): PoolLine {
  return { line_id: raw.line_id, text: raw.text, when: lineWhenFromJSON(raw.when) };
}
