// api/contracts/src/scene/validate.ts
// SC-301b: tier-1 SceneDef validator.
//
// TIER 1 = SHAPE ONLY. `validateScene` checks the payload on its own: field presence,
// types, enums, slug/uuid format, in-scene uniqueness. It does NOT check anything that
// needs another entity — whether `location` exists, whether dialogue refs / items /
// cast slugs resolve, whether a flag is registered. Those are tier-2 reference checks
// (SC-604). The one registry-aware hook is the optional `knownFlags` (SC-310), which
// can only ever produce a warning.
//
// Pure, never throws, collects EVERY issue in one pass (no first-error exit).
//
// ── Issue code table ────────────────────────────────────────────────────────────────
// code                            severity  path                          meaning
// SCENE_NOT_OBJECT                error     ''                            input is not a plain object
// SCENE_FIELD_UNKNOWN             error     <key> / role_slots[i].<key>   key not in the contract
//                                                                         (a slot may never carry
//                                                                         personality/relationship data)
// SCENE_FIELD_MISSING             error     <key>                         required key absent or undefined
//                                                                         (use null, never undefined)
// SCENE_FIELD_TYPE                error     <key>                         wrong JS type (string/array/object)
// SCENE_SCHEMA_VERSION_MISMATCH   error     schema_version                != SCENE_SCHEMA_VERSION
// SCENE_SLUG_INVALID              error     slug                          not an identifier-valid slug
// SCENE_LOCATION_INVALID          error     location                      not a UUID
// SCENE_TIME_INVALID              error     time                          not null | day | sunset | night
// SCENE_WEATHER_INVALID           error     weather                       not null | a WeatherTag
// SCENE_PRIORITY_INVALID          error     priority                      not an integer
// SCENE_REF_SLUG_INVALID          error     items[i] / dialogue_refs[i]   entry not an identifier-valid slug
// SCENE_DIALOGUE_REF_DUPLICATE    warning   dialogue_refs[i]              same ref listed twice
// SCENE_SLOT_ID_INVALID           error     role_slots[i].slot_id         not an identifier-valid slug
// SCENE_SLOT_DUPLICATE            error     role_slots[i].slot_id         slot_id repeats an earlier slot
// SCENE_SLOT_CAST_INVALID         error     role_slots[i].cast            not null | a valid character slug
// SCENE_SLOT_POSITION_INVALID     error     role_slots[i].position        not left | center | right
// SCENE_SLOT_LINE_INVALID         error     slot_lines[i](.<key>)         shape problem in a slot line (unknown key,
//                                                                         bad slug, empty text, bad `when`)
// SCENE_SLOT_LINE_SLOT_UNKNOWN    error     slot_lines[i].slot_id         names a slot that is not in role_slots
// SCENE_SLOT_LINE_DUPLICATE       error     slot_lines[i]                 (slot_id, line_id) repeats an earlier line
// SCENE_AVAILABILITY_INVALID      error     availability                  not a valid ConditionExpr
// SCENE_AVAILABILITY_UNKNOWN_FLAG warning   availability                  reads a flag outside `knownFlags`
//                                                                         (only when `knownFlags` is given)
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
import { checkSlotLine } from './line.js';
import { ROLE_SLOT_JSON_KEYS, SLOT_POSITIONS, isSlotPosition } from './role-slot.js';
import { SCENE_JSON_KEYS, SCENE_SCHEMA_VERSION, SCENE_TIMES, isSceneTime } from './scene-vocab.js';
import { isUuid, isValidSlug } from './slug.js';

/** Stable issue codes. Each key equals its value; tests enforce one case per code. */
export const SCENE_ISSUE_CODES = {
  SCENE_NOT_OBJECT: 'SCENE_NOT_OBJECT',
  SCENE_FIELD_UNKNOWN: 'SCENE_FIELD_UNKNOWN',
  SCENE_FIELD_MISSING: 'SCENE_FIELD_MISSING',
  SCENE_FIELD_TYPE: 'SCENE_FIELD_TYPE',
  SCENE_SCHEMA_VERSION_MISMATCH: 'SCENE_SCHEMA_VERSION_MISMATCH',
  SCENE_SLUG_INVALID: 'SCENE_SLUG_INVALID',
  SCENE_LOCATION_INVALID: 'SCENE_LOCATION_INVALID',
  SCENE_TIME_INVALID: 'SCENE_TIME_INVALID',
  SCENE_WEATHER_INVALID: 'SCENE_WEATHER_INVALID',
  SCENE_PRIORITY_INVALID: 'SCENE_PRIORITY_INVALID',
  SCENE_REF_SLUG_INVALID: 'SCENE_REF_SLUG_INVALID',
  SCENE_DIALOGUE_REF_DUPLICATE: 'SCENE_DIALOGUE_REF_DUPLICATE',
  SCENE_SLOT_ID_INVALID: 'SCENE_SLOT_ID_INVALID',
  SCENE_SLOT_DUPLICATE: 'SCENE_SLOT_DUPLICATE',
  SCENE_SLOT_CAST_INVALID: 'SCENE_SLOT_CAST_INVALID',
  SCENE_SLOT_POSITION_INVALID: 'SCENE_SLOT_POSITION_INVALID',
  SCENE_SLOT_LINE_INVALID: 'SCENE_SLOT_LINE_INVALID',
  SCENE_SLOT_LINE_SLOT_UNKNOWN: 'SCENE_SLOT_LINE_SLOT_UNKNOWN',
  SCENE_SLOT_LINE_DUPLICATE: 'SCENE_SLOT_LINE_DUPLICATE',
  SCENE_AVAILABILITY_INVALID: 'SCENE_AVAILABILITY_INVALID',
  SCENE_AVAILABILITY_UNKNOWN_FLAG: 'SCENE_AVAILABILITY_UNKNOWN_FLAG',
} as const;

export type SceneIssueCode = (typeof SCENE_ISSUE_CODES)[keyof typeof SCENE_ISSUE_CODES];
export type SceneIssue = ValidationIssue<SceneIssueCode>;
export type SceneValidationResult = ValidationResult<SceneIssueCode>;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

class IssueSink {
  readonly issues: SceneIssue[] = [];

  add(code: SceneIssueCode, path: string, message: string, severity: IssueSeverity = 'error'): void {
    this.issues.push({ code, path, message, severity });
  }

  /** Reports every key of `obj` that is not in `allowed`. */
  checkKeys(obj: Record<string, unknown>, allowed: readonly string[], at: (key: string) => string): void {
    for (const key of Object.keys(obj)) {
      if (!allowed.includes(key)) {
        this.add('SCENE_FIELD_UNKNOWN', at(key), `unknown field '${key}'`);
      }
    }
  }

  /** True when `obj[key]` is present; otherwise records SCENE_FIELD_MISSING. */
  require(obj: Record<string, unknown>, key: string, path: string): boolean {
    if (obj[key] !== undefined) return true;
    this.add('SCENE_FIELD_MISSING', path, `'${path}' is required (use null, not undefined, for "none")`);
    return false;
  }
}

/** Reads a required string field, reporting a type issue; returns it when it is a string. */
function stringField(sink: IssueSink, obj: Record<string, unknown>, key: string): string | undefined {
  if (!sink.require(obj, key, key)) return undefined;
  const v = obj[key];
  if (typeof v !== 'string') {
    sink.add('SCENE_FIELD_TYPE', key, `'${key}' must be a string`);
    return undefined;
  }
  return v;
}

function arrayField(sink: IssueSink, obj: Record<string, unknown>, key: string): unknown[] | undefined {
  if (!sink.require(obj, key, key)) return undefined;
  const v = obj[key];
  if (!Array.isArray(v)) {
    sink.add('SCENE_FIELD_TYPE', key, `'${key}' must be an array`);
    return undefined;
  }
  return v;
}

function checkScalars(sink: IssueSink, obj: Record<string, unknown>): void {
  if (sink.require(obj, 'schema_version', 'schema_version') && obj.schema_version !== SCENE_SCHEMA_VERSION) {
    sink.add('SCENE_SCHEMA_VERSION_MISMATCH', 'schema_version', `'schema_version' must be ${SCENE_SCHEMA_VERSION}`);
  }
  stringField(sink, obj, 'id');
  const slug = stringField(sink, obj, 'slug');
  if (slug !== undefined && !isValidSlug(slug)) {
    sink.add('SCENE_SLUG_INVALID', 'slug', `'${slug}' is not a valid slug (identifier: letters, digits, underscore)`);
  }
  stringField(sink, obj, 'title');
  stringField(sink, obj, 'description');
  const location = stringField(sink, obj, 'location');
  if (location !== undefined && !isUuid(location)) {
    sink.add('SCENE_LOCATION_INVALID', 'location', `'location' must be a legacy location row UUID`);
  }
  if (sink.require(obj, 'time', 'time') && obj.time !== null && !isSceneTime(obj.time)) {
    sink.add('SCENE_TIME_INVALID', 'time', `'time' must be null or one of: ${SCENE_TIMES.join(', ')}`);
  }
  if (sink.require(obj, 'weather', 'weather') && obj.weather !== null && !isWeatherTag(obj.weather)) {
    sink.add('SCENE_WEATHER_INVALID', 'weather', `'weather' must be null (inherit) or one of: ${WEATHER_TAGS.join(', ')}`);
  }
  if (sink.require(obj, 'priority', 'priority') && !Number.isInteger(obj.priority)) {
    sink.add('SCENE_PRIORITY_INVALID', 'priority', `'priority' must be an integer`);
  }
}

function checkRefList(sink: IssueSink, obj: Record<string, unknown>, key: 'items' | 'dialogue_refs'): void {
  const list = arrayField(sink, obj, key);
  const seen = new Set<string>();
  list?.forEach((entry, i) => {
    const path = issuePath(key, i);
    if (!isValidSlug(entry)) {
      sink.add('SCENE_REF_SLUG_INVALID', path, `'${path}' must be a valid slug`);
      return;
    }
    if (key === 'dialogue_refs' && seen.has(entry)) {
      sink.add('SCENE_DIALOGUE_REF_DUPLICATE', path, `dialogue ref '${entry}' is listed more than once`, 'warning');
    }
    seen.add(entry);
  });
}

function checkRoleSlots(sink: IssueSink, obj: Record<string, unknown>): void {
  const slots = arrayField(sink, obj, 'role_slots');
  const seenIds = new Set<string>();
  slots?.forEach((entry, i) => {
    const base = issuePath('role_slots', i);
    if (!isPlainObject(entry)) {
      sink.add('SCENE_FIELD_TYPE', base, `'${base}' must be an object`);
      return;
    }
    sink.checkKeys(entry, ROLE_SLOT_JSON_KEYS, (key) => issuePath('role_slots', i, key));

    const idPath = issuePath('role_slots', i, 'slot_id');
    if (sink.require(entry, 'slot_id', idPath)) {
      const id = entry.slot_id;
      if (!isValidSlug(id)) {
        sink.add('SCENE_SLOT_ID_INVALID', idPath, `'${idPath}' must be a valid slug`);
      } else if (seenIds.has(id)) {
        sink.add('SCENE_SLOT_DUPLICATE', idPath, `duplicate slot_id '${id}' in 'role_slots'`);
      } else {
        seenIds.add(id);
      }
    }

    const castPath = issuePath('role_slots', i, 'cast');
    if (sink.require(entry, 'cast', castPath) && entry.cast !== null && !isValidSlug(entry.cast)) {
      sink.add('SCENE_SLOT_CAST_INVALID', castPath, `'${castPath}' must be null or a valid character slug`);
    }

    const posPath = issuePath('role_slots', i, 'position');
    if (sink.require(entry, 'position', posPath) && !isSlotPosition(entry.position)) {
      sink.add('SCENE_SLOT_POSITION_INVALID', posPath, `'${posPath}' must be one of: ${SLOT_POSITIONS.join(', ')}`);
    }
  });
}

function checkSlotLines(sink: IssueSink, obj: Record<string, unknown>): void {
  const lines = arrayField(sink, obj, 'slot_lines');
  if (lines === undefined) return;
  const slotIds = new Set<string>();
  if (Array.isArray(obj.role_slots)) {
    for (const s of obj.role_slots) if (isPlainObject(s) && isValidSlug(s.slot_id)) slotIds.add(s.slot_id);
  }
  const seen = new Set<string>();
  lines.forEach((entry, i) => {
    const base = issuePath('slot_lines', i);
    const problems = checkSlotLine(entry, base);
    for (const p of problems) sink.add('SCENE_SLOT_LINE_INVALID', p.path, p.message);
    if (problems.length > 0 || !isPlainObject(entry)) return;
    const slotId = entry.slot_id as string;
    if (!slotIds.has(slotId)) {
      sink.add('SCENE_SLOT_LINE_SLOT_UNKNOWN', `${base}.slot_id`, `slot_lines[${i}] targets slot '${slotId}', which is not in 'role_slots'`);
    }
    const key = `${slotId}.${entry.line_id as string}`;
    if (seen.has(key)) sink.add('SCENE_SLOT_LINE_DUPLICATE', base, `duplicate slot line '${key}'`);
    seen.add(key);
  });
}

function checkAvailability(sink: IssueSink, obj: Record<string, unknown>, known: ReadonlySet<string> | undefined): void {
  if (!sink.require(obj, 'availability', 'availability')) return;
  const cond = obj.availability;
  if (!isConditionExpr(cond)) {
    sink.add('SCENE_AVAILABILITY_INVALID', 'availability', `'availability' must be a valid condition expression`);
    return;
  }
  if (known === undefined) return;
  for (const slug of extractFlagSlugs(cond)) {
    if (!known.has(slug)) {
      sink.add(
        'SCENE_AVAILABILITY_UNKNOWN_FLAG',
        'availability',
        `'availability' reads flag '${slug}', which is not in the flag registry`,
        'warning',
      );
    }
  }
}

export interface ValidateSceneOptions {
  /**
   * Registered flag slugs. When given, availability flags outside it produce a
   * SCENE_AVAILABILITY_UNKNOWN_FLAG warning (never an error — tier-2, SC-604, decides
   * what an unknown flag means). Omitted = no registry check.
   */
  knownFlags?: ReadonlySet<string> | readonly string[];
}

/**
 * Validates an untrusted value as a SceneDef (tier 1, shape only).
 *
 * Never throws; collects every issue in one pass. Tier 1 checks field presence,
 * types, enums, slug/uuid format, and in-scene uniqueness. Reference checks
 * (whether `location` exists, refs resolve, flags are registered) are tier 2.
 *
 * @param input - Untrusted value to validate
 * @param options - Optional `knownFlags` registry for availability-flag warnings
 * @returns Validation result with all issues found
 */
export function validateScene(input: unknown, options: ValidateSceneOptions = {}): SceneValidationResult {
  const sink = new IssueSink();
  if (!isPlainObject(input)) {
    sink.add('SCENE_NOT_OBJECT', '', 'scene must be an object');
    return createValidationResult(sink.issues);
  }
  sink.checkKeys(input, SCENE_JSON_KEYS, (key) => key);
  checkScalars(sink, input);
  checkRefList(sink, input, 'items');
  checkRefList(sink, input, 'dialogue_refs');
  checkRoleSlots(sink, input);
  checkSlotLines(sink, input);
  checkAvailability(sink, input, options.knownFlags === undefined ? undefined : new Set(options.knownFlags));
  return createValidationResult(sink.issues);
}
