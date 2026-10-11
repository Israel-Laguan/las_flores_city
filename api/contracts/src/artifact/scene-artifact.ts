// api/contracts/src/artifact/scene-artifact.ts
// SC-401/402: the payload of a compiled scene artifact, its canonical bytes and hash.
//
// Shape (SC-S13): the artifact is ONE `ResolvedScene` per scene — base plus ordered
// conditional layers plus the dependency flag list — not one artifact per flag
// assignment. `district_weather` is the compile-time snapshot of `districts.weather`
// (A6/SC-305): runtime resolves final weather from the pinned artifact alone and never
// reads a district row.
//
// Identity: `artifact_id === content_hash === sha256 hex of stringifySceneArtifact(...)`.
// The bytes are canonical (deep key-sorted JSON), so authoring order and construction
// order never change the hash. Timestamps and the artifact's own metadata are NOT part of
// the bytes — an unchanged scene recompiles to the identical id (SC-403).
//
// Pure data and pure functions (node:crypto is the only import beyond contracts).

import { createHash } from 'node:crypto';
import { extractFlagSlugs, fromJSON as conditionFromJSON, isConditionExpr, toJSON as conditionToJSON } from '../condition/expression.js';
import type { ComposedScene, ConditionalLayer, ResolvedScene } from '../scene/compose.js';
import { sceneDefFromJSON, sceneDefToJSON } from '../scene/scene-def.js';
import { sceneOverlayFromJSON, sceneOverlayOpToJSON } from '../scene/scene-overlay.js';
import { validateSceneOverlay } from '../scene/overlay-validate.js';
import { ISSUE_SEVERITIES, type ValidationIssue } from '../validation/issue.js';
import { isWeatherTag, type WeatherTag } from '../weather/weather-tag.js';
import { createArtifactId, type ArtifactId } from './artifact.js';

export const SCENE_ARTIFACT_SCHEMA_VERSION = 1 as const;

export interface SceneArtifactPayload {
  scene: ResolvedScene;
  /** `districts.weather` of the scene's district at compile time. */
  district_weather: WeatherTag;
}

export class InvalidSceneArtifactError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid scene artifact: ${problems.join('; ')}`);
    this.name = 'InvalidSceneArtifactError';
    this.problems = problems;
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep key-sorted copy of a JSON value; arrays keep their order (order is meaning there). */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  }
  return value;
}

const layerToJSON = (l: ConditionalLayer): Record<string, unknown> => ({
  availability: conditionToJSON(l.availability),
  ops: l.ops.map(sceneOverlayOpToJSON),
  priority: l.priority,
  slug: l.slug,
});

const issueToJSON = (i: ValidationIssue): Record<string, unknown> => ({
  code: i.code,
  message: i.message,
  path: i.path,
  severity: i.severity,
});

/** Canonical JSON form of a scene artifact payload (deep key-sorted). */
export function sceneArtifactPayloadToJSON(payload: SceneArtifactPayload): Record<string, unknown> {
  const { scene } = payload;
  return canonical({
    district_weather: payload.district_weather,
    scene: {
      base: { ...sceneDefToJSON(scene.base), provenance: { ...scene.base.provenance } },
      flags: [...scene.flags],
      issues: scene.issues.map(issueToJSON),
      layers: scene.layers.map(layerToJSON),
      scene_slug: scene.scene_slug,
    },
    schema_version: SCENE_ARTIFACT_SCHEMA_VERSION,
  }) as Record<string, unknown>;
}

/** Canonical bytes of a scene artifact payload. */
export function stringifySceneArtifact(payload: SceneArtifactPayload): string {
  return JSON.stringify(sceneArtifactPayloadToJSON(payload));
}

/** sha256 hex of arbitrary canonical bytes. */
export function sha256Hex(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Content hash (= artifact id) of a scene artifact payload. */
export function sceneArtifactContentHash(payload: SceneArtifactPayload): ArtifactId {
  return createArtifactId(sha256Hex(stringifySceneArtifact(payload)));
}

function exactKeys(obj: Record<string, unknown>, keys: readonly string[], at: string, problems: string[]): void {
  for (const k of Object.keys(obj)) if (!keys.includes(k)) problems.push(`${at}: unknown field '${k}'`);
  for (const k of keys) if (obj[k] === undefined) problems.push(`${at}: '${k}' is required`);
}

/**
 * Strict parse of an untrusted scene artifact payload (e.g. bytes read back from storage).
 * Everything is re-validated with the same validators authoring uses, and derived data
 * (`flags`, `scene_slug`) must agree with what it derives from.
 *
 * @param value - Untrusted JSON value
 * @returns A validated payload sharing no references with the input
 * @throws InvalidSceneArtifactError listing every problem found
 */
export function sceneArtifactPayloadFromJSON(value: unknown): SceneArtifactPayload {
  const problems: string[] = [];
  if (!isPlainObject(value)) throw new InvalidSceneArtifactError(['payload must be an object']);
  exactKeys(value, ['district_weather', 'scene', 'schema_version'], 'payload', problems);
  if (value.schema_version !== undefined && value.schema_version !== SCENE_ARTIFACT_SCHEMA_VERSION) {
    problems.push(`payload: schema_version must be ${SCENE_ARTIFACT_SCHEMA_VERSION}`);
  }
  if (value.district_weather !== undefined && !isWeatherTag(value.district_weather)) {
    problems.push(`payload: district_weather is not a weather tag`);
  }
  const rawScene = value.scene;
  if (rawScene !== undefined && !isPlainObject(rawScene)) problems.push('scene: must be an object');
  if (!isPlainObject(rawScene)) throw new InvalidSceneArtifactError(problems);

  exactKeys(rawScene, ['base', 'flags', 'issues', 'layers', 'scene_slug'], 'scene', problems);
  let base: ComposedScene | undefined;
  const rawBase = rawScene.base;
  if (isPlainObject(rawBase)) {
    const { provenance, ...def } = rawBase;
    if (!isPlainObject(provenance) || !Object.values(provenance).every((v) => typeof v === 'string')) {
      problems.push('scene.base.provenance: must map field -> string');
    } else {
      try {
        base = { ...sceneDefFromJSON(def), provenance: { ...(provenance as Record<string, string>) } };
      } catch (err) {
        problems.push(`scene.base: ${(err as Error).message}`);
      }
    }
  } else if (rawBase !== undefined) {
    problems.push('scene.base: must be an object');
  }
  if (base !== undefined && rawScene.scene_slug !== base.slug) problems.push('scene.scene_slug: must equal base.slug');

  const layers: ConditionalLayer[] = [];
  if (Array.isArray(rawScene.layers)) {
    rawScene.layers.forEach((raw, i) => {
      const at = `scene.layers[${i}]`;
      if (!isPlainObject(raw)) return void problems.push(`${at}: must be an object`);
      const extra = Object.keys(raw).filter((k) => !['availability', 'ops', 'priority', 'slug'].includes(k));
      if (extra.length > 0) problems.push(`${at}: unknown field '${extra[0]}'`);
      // A layer is an overlay minus its base pointer: validate it with the overlay validator.
      const asOverlay = { schema_version: 1, base_scene_slug: rawScene.scene_slug, ...raw };
      const result = validateSceneOverlay(asOverlay);
      for (const issue of result.issues.filter((x) => x.severity === 'error')) problems.push(`${at}.${issue.path}: ${issue.message}`);
      if (result.valid && isConditionExpr(raw.availability)) {
        const o = sceneOverlayFromJSON(asOverlay);
        layers.push({ slug: o.slug, priority: o.priority, availability: conditionFromJSON(conditionToJSON(o.availability)), ops: o.ops });
      }
    });
  } else if (rawScene.layers !== undefined) {
    problems.push('scene.layers: must be an array');
  }

  let flags: string[] = [];
  if (Array.isArray(rawScene.flags) && rawScene.flags.every((f) => typeof f === 'string')) {
    flags = [...(rawScene.flags as string[])];
    const derived = [...new Set(layers.flatMap((l) => extractFlagSlugs(l.availability)))].sort();
    if (problems.length === 0 && JSON.stringify(flags) !== JSON.stringify(derived)) {
      problems.push(`scene.flags: must equal the sorted union of layer flags (${derived.join(', ')})`);
    }
  } else if (rawScene.flags !== undefined) {
    problems.push('scene.flags: must be an array of strings');
  }

  const issues: ValidationIssue[] = [];
  if (Array.isArray(rawScene.issues)) {
    rawScene.issues.forEach((raw, i) => {
      const at = `scene.issues[${i}]`;
      if (
        !isPlainObject(raw) ||
        typeof raw.code !== 'string' ||
        typeof raw.message !== 'string' ||
        typeof raw.path !== 'string' ||
        !(ISSUE_SEVERITIES as readonly string[]).includes(raw.severity as string)
      ) {
        problems.push(`${at}: must be {code, message, path, severity}`);
        return;
      }
      if (raw.severity === 'error') problems.push(`${at}: an artifact never carries error issues`);
      issues.push({ code: raw.code, message: raw.message, path: raw.path, severity: raw.severity as ValidationIssue['severity'] });
    });
  } else if (rawScene.issues !== undefined) {
    problems.push('scene.issues: must be an array');
  }

  if (problems.length > 0 || base === undefined) throw new InvalidSceneArtifactError(problems);
  return {
    district_weather: value.district_weather as WeatherTag,
    scene: { scene_slug: base.slug, base, layers, flags, issues },
  };
}
