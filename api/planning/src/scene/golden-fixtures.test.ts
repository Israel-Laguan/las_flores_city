// api/planning/src/scene/golden-fixtures.test.ts
// SC-313 (m-71): run every golden fixture in test-fixtures/scene-composition through
// compile (composeScene + conflict report) and per-player runtime selection.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSceneForPlayer } from '@las-flores/api-contracts';
import { composeScene } from './compose-scene.js';
import { detectConflicts, formatConflictReport } from './conflicts.js';
import { InvalidGoldenFixtureError, parseGoldenFixture } from './golden-fixtures.js';
import { resolveWeather } from './resolve-weather.js';

const DIR = join(__dirname, '..', '..', 'test-fixtures', 'scene-composition');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const fixtures = files.map((f) => parseGoldenFixture(JSON.parse(readFileSync(join(DIR, f), 'utf8'))));

describe('composition golden fixtures (SC-313)', () => {
  test('at least the two required fixtures are present', () => {
    expect(fixtures.map((f) => f.name).sort()).toEqual(['exclusive_conflict_and_near_miss', 'flag_gated_rain_and_cast']);
  });

  const cases = fixtures.flatMap((fx) => fx.cases.map((c) => [`${fx.name} / ${c.name}`, fx, c] as const));

  test.each(cases)('%s', (_name, fx, c) => {
    const { scene, issues } = composeScene(fx.base, c.overlays);
    expect(issues.filter((i) => i.severity === 'error').map((i) => i.code).sort()).toEqual(c.expect.error_codes);
    if (c.expect.report) {
      expect(formatConflictReport(fx.base.slug, detectConflicts(c.overlays))).toEqual(c.expect.report);
    }
    if (c.expect.layers) expect(scene.layers.map((l) => l.slug)).toEqual(c.expect.layers);
    if (c.expect.flags) expect(scene.flags).toEqual(c.expect.flags);
    for (const p of c.expect.players ?? []) {
      const player = resolveSceneForPlayer(scene, new Set(p.flags));
      expect(player.issues).toEqual([]);
      expect(player.active_layers).toEqual(p.active_layers);
      expect(resolveWeather(player.scene, fx.district_weather)).toEqual(p.weather);
      if (p.items) expect(player.scene.items).toEqual(p.items);
      if (p.role_slots) expect(player.scene.role_slots).toEqual(p.role_slots);
      if (p.dialogue_refs) expect(player.scene.dialogue_refs).toEqual(p.dialogue_refs);
    }
  });

  test('parser rejects malformed fixtures loudly', () => {
    expect(() => parseGoldenFixture(null)).toThrow(InvalidGoldenFixtureError);
    const good = JSON.parse(readFileSync(join(DIR, files[0]), 'utf8'));
    expect(() => parseGoldenFixture({ ...good, district_weather: 'hail' })).toThrow(InvalidGoldenFixtureError);
    expect(() => parseGoldenFixture({ ...good, cases: [] })).toThrow(InvalidGoldenFixtureError);
    expect(() => parseGoldenFixture({ ...good, base: { ...good.base, slug: 'bad slug' } })).toThrow(/Invalid SceneDef/);
  });
});
