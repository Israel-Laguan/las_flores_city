// api/contracts/src/scene/overlay-validate.ts
// SC-303a (m-55): tier-1 SceneOverlay validator.
//
// SHAPE ONLY, like `validateScene`: it never checks that `base_scene_slug` exists, that
// `cast_slot` targets a slot the base has, or that refs resolve — those need the base
// scene (composition, SC-303b) or other entities (tier 2, SC-604). Within ONE overlay it
// does reject ops that contradict each other (two `set_weather`, two `cast_slot` on one
// slot, two `add_role_slot` with one `slot_id`), since list order would silently decide.
//
// Pure, never throws, collects every issue in one pass. Issue format: contracts/validation.
//
// ── Issue code table ────────────────────────────────────────────────────────────────
// code                                    severity  path                    meaning
// SCENE_OVERLAY_NOT_OBJECT                error     ''                      input is not a plain object
// SCENE_OVERLAY_FIELD_UNKNOWN             error     <key> / ops[i].<key>    key not in the contract
//                                                   ops[i].slot.<key>
// SCENE_OVERLAY_FIELD_MISSING             error     same                    required key absent/undefined
// SCENE_OVERLAY_FIELD_TYPE                error     same                    wrong JS type
// SCENE_OVERLAY_SCHEMA_VERSION_MISMATCH   error     schema_version          != SCENE_OVERLAY_SCHEMA_VERSION
// SCENE_OVERLAY_SLUG_INVALID              error     slug                    not an identifier-valid slug
// SCENE_OVERLAY_BASE_SLUG_INVALID         error     base_scene_slug         not an identifier-valid slug
// SCENE_OVERLAY_PRIORITY_INVALID          error     priority                not an integer
// SCENE_OVERLAY_OPS_EMPTY                 warning   ops                     overlay changes nothing
// SCENE_OVERLAY_OP_UNKNOWN                error     ops[i].op               not in SCENE_OVERLAY_OPS
// SCENE_OVERLAY_OP_DUPLICATE              error     ops[i]                  repeats an exclusive op, a cast_slot
//                                                                           on the same slot, or an add_role_slot
//                                                                           with the same slot_id
// SCENE_OVERLAY_REF_SLUG_INVALID          error     ops[i].refs|items[j]    entry not an identifier-valid slug
// SCENE_OVERLAY_REF_DUPLICATE             warning   ops[i].refs|items[j]    same entry twice in one op
// SCENE_OVERLAY_SLOT_ID_INVALID           error     ops[i](.slot).slot_id   not an identifier-valid slug
// SCENE_OVERLAY_SLOT_CAST_INVALID         error     ops[i](.slot).cast      not null | a valid character slug
// SCENE_OVERLAY_SLOT_POSITION_INVALID     error     ops[i].slot.position    not left | center | right
// SCENE_OVERLAY_SLOT_LINE_INVALID         error     ops[i].lines[j](.<key>) shape problem in a slot line
// SCENE_OVERLAY_WEATHER_INVALID           error     ops[i].weather          not null | a WeatherTag
// SCENE_OVERLAY_TIME_INVALID              error     ops[i].time             not null | a SceneTime
// SCENE_OVERLAY_AVAILABILITY_INVALID      error     availability            not a valid ConditionExpr
// SCENE_OVERLAY_AVAILABILITY_UNKNOWN_FLAG warning   availability            flag outside `knownFlags`
// ────────────────────────────────────────────────────────────────────────────────────

import { extractFlagSlugs, isConditionExpr } from '../condition/expression.js';
import {
  createValidationResult,
  issuePath,
  type IssueSeverity,
  type ValidationIssue,
  type ValidationResult,
} from '../validation/issue.js';
import { WEATHER_TAGS, isWeatherTag } from '../weather/weather-tag.js';
import { SCENE_OVERLAY_JSON_KEYS, SCENE_OVERLAY_OPS, SCENE_OVERLAY_SCHEMA_VERSION, isSceneOverlayOpName } from './overlay-vocab.js';
import { checkSlotLine, slotLineKey } from './line.js';
import { ROLE_SLOT_JSON_KEYS, SLOT_POSITIONS, isSlotPosition } from './role-slot.js';
import { SCENE_TIMES, isSceneTime } from './scene-vocab.js';
import { isValidSlug } from './slug.js';

export const SCENE_OVERLAY_ISSUE_CODES = {
  SCENE_OVERLAY_NOT_OBJECT: 'SCENE_OVERLAY_NOT_OBJECT',
  SCENE_OVERLAY_FIELD_UNKNOWN: 'SCENE_OVERLAY_FIELD_UNKNOWN',
  SCENE_OVERLAY_FIELD_MISSING: 'SCENE_OVERLAY_FIELD_MISSING',
  SCENE_OVERLAY_FIELD_TYPE: 'SCENE_OVERLAY_FIELD_TYPE',
  SCENE_OVERLAY_SCHEMA_VERSION_MISMATCH: 'SCENE_OVERLAY_SCHEMA_VERSION_MISMATCH',
  SCENE_OVERLAY_SLUG_INVALID: 'SCENE_OVERLAY_SLUG_INVALID',
  SCENE_OVERLAY_BASE_SLUG_INVALID: 'SCENE_OVERLAY_BASE_SLUG_INVALID',
  SCENE_OVERLAY_PRIORITY_INVALID: 'SCENE_OVERLAY_PRIORITY_INVALID',
  SCENE_OVERLAY_OPS_EMPTY: 'SCENE_OVERLAY_OPS_EMPTY',
  SCENE_OVERLAY_OP_UNKNOWN: 'SCENE_OVERLAY_OP_UNKNOWN',
  SCENE_OVERLAY_OP_DUPLICATE: 'SCENE_OVERLAY_OP_DUPLICATE',
  SCENE_OVERLAY_REF_SLUG_INVALID: 'SCENE_OVERLAY_REF_SLUG_INVALID',
  SCENE_OVERLAY_REF_DUPLICATE: 'SCENE_OVERLAY_REF_DUPLICATE',
  SCENE_OVERLAY_SLOT_ID_INVALID: 'SCENE_OVERLAY_SLOT_ID_INVALID',
  SCENE_OVERLAY_SLOT_CAST_INVALID: 'SCENE_OVERLAY_SLOT_CAST_INVALID',
  SCENE_OVERLAY_SLOT_POSITION_INVALID: 'SCENE_OVERLAY_SLOT_POSITION_INVALID',
  SCENE_OVERLAY_SLOT_LINE_INVALID: 'SCENE_OVERLAY_SLOT_LINE_INVALID',
  SCENE_OVERLAY_WEATHER_INVALID: 'SCENE_OVERLAY_WEATHER_INVALID',
  SCENE_OVERLAY_TIME_INVALID: 'SCENE_OVERLAY_TIME_INVALID',
  SCENE_OVERLAY_AVAILABILITY_INVALID: 'SCENE_OVERLAY_AVAILABILITY_INVALID',
  SCENE_OVERLAY_AVAILABILITY_UNKNOWN_FLAG: 'SCENE_OVERLAY_AVAILABILITY_UNKNOWN_FLAG',
} as const;

export type SceneOverlayIssueCode = (typeof SCENE_OVERLAY_ISSUE_CODES)[keyof typeof SCENE_OVERLAY_ISSUE_CODES];
export type SceneOverlayIssue = ValidationIssue<SceneOverlayIssueCode>;
export type SceneOverlayValidationResult = ValidationResult<SceneOverlayIssueCode>;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

class Sink {
  readonly issues: SceneOverlayIssue[] = [];

  add(code: SceneOverlayIssueCode, path: string, message: string, severity: IssueSeverity = 'error'): void {
    this.issues.push({ code, path, message, severity });
  }

  checkKeys(obj: Record<string, unknown>, allowed: readonly string[], at: (key: string) => string): void {
    for (const key of Object.keys(obj)) {
      if (!allowed.includes(key)) this.add('SCENE_OVERLAY_FIELD_UNKNOWN', at(key), `unknown field '${key}'`);
    }
  }

  require(obj: Record<string, unknown>, key: string, path: string): boolean {
    if (obj[key] !== undefined) return true;
    this.add('SCENE_OVERLAY_FIELD_MISSING', path, `'${path}' is required (use null, not undefined, for "none")`);
    return false;
  }

  /** Required array at `obj[key]`; returns it, or undefined after recording an issue. */
  array(obj: Record<string, unknown>, key: string, path: string): unknown[] | undefined {
    if (!this.require(obj, key, path)) return undefined;
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
    this.add('SCENE_OVERLAY_FIELD_TYPE', path, `'${path}' must be an array`);
    return undefined;
  }
}

function checkTop(sink: Sink, obj: Record<string, unknown>): void {
  if (sink.require(obj, 'schema_version', 'schema_version') && obj.schema_version !== SCENE_OVERLAY_SCHEMA_VERSION) {
    sink.add(
      'SCENE_OVERLAY_SCHEMA_VERSION_MISMATCH',
      'schema_version',
      `'schema_version' must be ${SCENE_OVERLAY_SCHEMA_VERSION}`,
    );
  }
  if (sink.require(obj, 'slug', 'slug') && !isValidSlug(obj.slug)) {
    sink.add('SCENE_OVERLAY_SLUG_INVALID', 'slug', `'slug' must be an identifier-valid slug`);
  }
  if (sink.require(obj, 'base_scene_slug', 'base_scene_slug') && !isValidSlug(obj.base_scene_slug)) {
    sink.add('SCENE_OVERLAY_BASE_SLUG_INVALID', 'base_scene_slug', `'base_scene_slug' must be an identifier-valid slug`);
  }
  if (sink.require(obj, 'priority', 'priority') && !Number.isInteger(obj.priority)) {
    sink.add('SCENE_OVERLAY_PRIORITY_INVALID', 'priority', `'priority' must be an integer`);
  }
}

function checkAvailability(sink: Sink, obj: Record<string, unknown>, known: ReadonlySet<string> | undefined): void {
  if (!sink.require(obj, 'availability', 'availability')) return;
  if (!isConditionExpr(obj.availability)) {
    sink.add('SCENE_OVERLAY_AVAILABILITY_INVALID', 'availability', `'availability' must be a valid condition expression`);
    return;
  }
  if (known === undefined) return;
  for (const slug of extractFlagSlugs(obj.availability)) {
    if (!known.has(slug)) {
      sink.add(
        'SCENE_OVERLAY_AVAILABILITY_UNKNOWN_FLAG',
        'availability',
        `'availability' reads flag '${slug}', which is not in the flag registry`,
        'warning',
      );
    }
  }
}

function checkRefList(sink: Sink, op: Record<string, unknown>, key: 'refs' | 'items', at: string): void {
  const path = `${at}.${key}`;
  const list = sink.array(op, key, path);
  const seen = new Set<string>();
  list?.forEach((entry, j) => {
    const p = issuePath(path, j);
    if (!isValidSlug(entry)) {
      sink.add('SCENE_OVERLAY_REF_SLUG_INVALID', p, `'${p}' must be a valid slug`);
      return;
    }
    if (seen.has(entry)) sink.add('SCENE_OVERLAY_REF_DUPLICATE', p, `'${entry}' is listed more than once`, 'warning');
    seen.add(entry);
  });
}

function checkSlotId(sink: Sink, obj: Record<string, unknown>, path: string): string | undefined {
  if (!sink.require(obj, 'slot_id', path)) return undefined;
  if (isValidSlug(obj.slot_id)) return obj.slot_id;
  sink.add('SCENE_OVERLAY_SLOT_ID_INVALID', path, `'${path}' must be a valid slug`);
  return undefined;
}

function checkCast(sink: Sink, obj: Record<string, unknown>, path: string): void {
  if (sink.require(obj, 'cast', path) && obj.cast !== null && !isValidSlug(obj.cast)) {
    sink.add('SCENE_OVERLAY_SLOT_CAST_INVALID', path, `'${path}' must be null or a valid character slug`);
  }
}

/** Returns the dedupe identity of the op (for SCENE_OVERLAY_OP_DUPLICATE), if any. */
function checkOpBody(sink: Sink, op: Record<string, unknown>, name: keyof typeof SCENE_OVERLAY_OPS, at: string): string | undefined {
  switch (name) {
    case 'add_dialogue_refs':
      checkRefList(sink, op, 'refs', at);
      return undefined;
    case 'add_items':
      checkRefList(sink, op, 'items', at);
      return undefined;
    case 'add_role_slot': {
      const path = `${at}.slot`;
      if (!sink.require(op, 'slot', path)) return undefined;
      const slot = op.slot;
      if (!isPlainObject(slot)) {
        sink.add('SCENE_OVERLAY_FIELD_TYPE', path, `'${path}' must be an object`);
        return undefined;
      }
      sink.checkKeys(slot, ROLE_SLOT_JSON_KEYS, (k) => `${path}.${k}`);
      const id = checkSlotId(sink, slot, `${path}.slot_id`);
      checkCast(sink, slot, `${path}.cast`);
      if (sink.require(slot, 'position', `${path}.position`) && !isSlotPosition(slot.position)) {
        sink.add('SCENE_OVERLAY_SLOT_POSITION_INVALID', `${path}.position`, `must be one of: ${SLOT_POSITIONS.join(', ')}`);
      }
      return id === undefined ? undefined : `add_role_slot:${id}`;
    }
    case 'add_slot_lines': {
      const path = `${at}.lines`;
      const lines = sink.array(op, 'lines', path);
      const seen = new Set<string>();
      lines?.forEach((entry, j) => {
        const p = issuePath(path, j);
        const problems = checkSlotLine(entry, p);
        for (const prob of problems) sink.add('SCENE_OVERLAY_SLOT_LINE_INVALID', prob.path, prob.message);
        if (problems.length > 0) return;
        const key = slotLineKey(entry as { slot_id: string; line_id: string });
        if (seen.has(key)) sink.add('SCENE_OVERLAY_REF_DUPLICATE', p, `'${key}' is listed more than once`, 'warning');
        seen.add(key);
      });
      return undefined;
    }
    case 'cast_slot': {
      const id = checkSlotId(sink, op, `${at}.slot_id`);
      checkCast(sink, op, `${at}.cast`);
      return id === undefined ? undefined : `cast_slot:${id}`;
    }
    case 'set_weather':
      if (sink.require(op, 'weather', `${at}.weather`) && op.weather !== null && !isWeatherTag(op.weather)) {
        sink.add('SCENE_OVERLAY_WEATHER_INVALID', `${at}.weather`, `must be null or one of: ${WEATHER_TAGS.join(', ')}`);
      }
      return 'set_weather';
    case 'set_time':
      if (sink.require(op, 'time', `${at}.time`) && op.time !== null && !isSceneTime(op.time)) {
        sink.add('SCENE_OVERLAY_TIME_INVALID', `${at}.time`, `must be null or one of: ${SCENE_TIMES.join(', ')}`);
      }
      return 'set_time';
  }
}

function checkOps(sink: Sink, obj: Record<string, unknown>): void {
  const ops = sink.array(obj, 'ops', 'ops');
  if (ops === undefined) return;
  if (ops.length === 0) sink.add('SCENE_OVERLAY_OPS_EMPTY', 'ops', 'overlay has no ops and changes nothing', 'warning');
  const identities = new Set<string>();
  ops.forEach((op, i) => {
    const at = issuePath('ops', i);
    if (!isPlainObject(op)) {
      sink.add('SCENE_OVERLAY_FIELD_TYPE', at, `'${at}' must be an object`);
      return;
    }
    if (!isSceneOverlayOpName(op.op)) {
      sink.add('SCENE_OVERLAY_OP_UNKNOWN', `${at}.op`, `'${at}.op' must be one of: ${Object.keys(SCENE_OVERLAY_OPS).join(', ')}`);
      return;
    }
    sink.checkKeys(op, SCENE_OVERLAY_OPS[op.op].keys, (k) => `${at}.${k}`);
    const identity = checkOpBody(sink, op, op.op, at);
    if (identity === undefined) return;
    if (identities.has(identity)) {
      sink.add('SCENE_OVERLAY_OP_DUPLICATE', at, `'${identity}' already appears in this overlay; list order must not decide`);
    }
    identities.add(identity);
  });
}

export interface ValidateSceneOverlayOptions {
  /** Registered flag slugs; unknown availability flags become a warning. */
  knownFlags?: ReadonlySet<string> | readonly string[];
}

/** Validates an untrusted value as a SceneOverlay (tier 1, shape only).
 *
 * Never throws. Collects every issue in one pass. Within a single
 * overlay it rejects ops that contradict each other (two `set_weather`,
 * two `cast_slot` on one slot, two `add_role_slot` with one `slot_id`).
 *
 * @param input - Untrusted value to validate
 * @param options - Optional `knownFlags` registry for availability-flag warnings
 * @returns Validation result with all issues found
 */
export function validateSceneOverlay(
  input: unknown,
  options: ValidateSceneOverlayOptions = {},
): SceneOverlayValidationResult {
  const sink = new Sink();
  if (!isPlainObject(input)) {
    sink.add('SCENE_OVERLAY_NOT_OBJECT', '', 'scene overlay must be an object');
    return createValidationResult(sink.issues);
  }
  sink.checkKeys(input, SCENE_OVERLAY_JSON_KEYS, (k) => k);
  checkTop(sink, input);
  checkOps(sink, input);
  checkAvailability(sink, input, options.knownFlags === undefined ? undefined : new Set(options.knownFlags));
  return createValidationResult(sink.issues);
}
