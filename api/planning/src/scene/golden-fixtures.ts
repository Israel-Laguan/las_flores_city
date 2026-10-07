// api/planning/src/scene/golden-fixtures.ts
// SC-313 (m-71): parser for the composition golden fixtures in
// `api/planning/test-fixtures/scene-composition/*.json`.
//
// The fixtures are DATA ONLY so other suites (F3 server integration) can load them with
// their own I/O and call `parseGoldenFixture`. This module does no I/O itself: the base
// and overlays go through the strict contract readers (`sceneDefFromJSON`,
// `sceneOverlayFromJSON`), so a malformed fixture fails loudly at load time.

import {
  isWeatherTag,
  sceneDefFromJSON,
  sceneOverlayFromJSON,
  type RoleSlot,
  type SceneDef,
  type SceneOverlay,
  type WeatherTag,
} from '@las-flores/api-contracts';
import type { ConflictReport } from './conflicts.js';
import type { ResolvedWeather } from './resolve-weather.js';

export interface GoldenPlayerExpectation {
  flags: string[];
  active_layers: string[];
  weather: ResolvedWeather;
  items?: string[];
  role_slots?: RoleSlot[];
  dialogue_refs?: string[];
}

export interface GoldenCaseExpectation {
  /** Error-severity issue codes the compile reports, sorted. */
  error_codes: string[];
  report?: ConflictReport;
  layers?: string[];
  flags?: string[];
  players?: GoldenPlayerExpectation[];
}

export interface GoldenCase {
  name: string;
  overlays: SceneOverlay[];
  expect: GoldenCaseExpectation;
}

export interface GoldenFixture {
  name: string;
  description: string;
  district_weather: WeatherTag;
  base: SceneDef;
  cases: GoldenCase[];
}

export class InvalidGoldenFixtureError extends Error {
  constructor(message: string) {
    super(`Invalid golden fixture: ${message}`);
    this.name = 'InvalidGoldenFixtureError';
  }
}

const isRecord = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseCase(raw: unknown, i: number): GoldenCase {
  if (!isRecord(raw) || typeof raw.name !== 'string' || !Array.isArray(raw.overlays) || !isRecord(raw.expect)) {
    throw new InvalidGoldenFixtureError(`cases[${i}] needs name, overlays[] and expect{}`);
  }
  if (!Array.isArray(raw.expect.error_codes)) {
    throw new InvalidGoldenFixtureError(`cases[${i}].expect.error_codes must be an array`);
  }
  return {
    name: raw.name,
    overlays: raw.overlays.map((o: unknown) => sceneOverlayFromJSON(o)),
    expect: raw.expect as GoldenCaseExpectation,
  };
}

/** Parses and validates one fixture file's JSON. Throws on any malformed part. */
export function parseGoldenFixture(json: unknown): GoldenFixture {
  if (!isRecord(json)) throw new InvalidGoldenFixtureError('root must be an object');
  if (typeof json.name !== 'string' || typeof json.description !== 'string') {
    throw new InvalidGoldenFixtureError('name and description must be strings');
  }
  if (!isWeatherTag(json.district_weather)) throw new InvalidGoldenFixtureError('district_weather must be a WeatherTag');
  if (!Array.isArray(json.cases) || json.cases.length === 0) throw new InvalidGoldenFixtureError('cases must be a non-empty array');
  return {
    name: json.name,
    description: json.description,
    district_weather: json.district_weather,
    base: sceneDefFromJSON(json.base),
    cases: json.cases.map(parseCase),
  };
}
