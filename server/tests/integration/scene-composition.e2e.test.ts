import { describe, test, expect, afterAll } from '@jest/globals';
import fs from 'node:fs';
import { oltpPool } from '@las-flores/infra';
import { createSceneDef, createSceneOverlay, flag, type SceneOverlay } from '@las-flores/api-contracts';
import { composeScene, resolveSceneForPlayer, resolveWeather } from '@las-flores/api-planning';
import { PgSceneDefRepository } from '../../src/planning/PgSceneDefRepository.js';
import { PgSceneOverlayRepository } from '../../src/planning/PgSceneOverlayRepository.js';
import { PgFlagRegistry } from '../../src/planning/PgFlagRegistry.js';

// SC-319: sprint-03 exit demo. Runs the four DoD behaviours end to end through the real
// Postgres adapters: persist -> read back -> compile -> per-player resolve.
//
//   1. Base scene + flag-gated rain overlay: flag off -> district weather; flag on -> rain,
//      provenance `overlay:<slug>`.
//   2. Two equal-priority exclusive overlays -> compile reports SCENE_EXCLUSIVE_CONFLICT.
//   3. Unchanged scene re-upserted -> `unchanged`, row updated_at untouched (SC-315 importer
//      is deferred, so the scene is written by hand).
//   4. Retire on a flag and an overlay keeps the row.
//
// Collision avoidance: every slug starts with `sc319_`, which no other suite uses; rows are
// removed in afterAll (overlays before scenes, FK).
//
// Evidence: when SC319_EVIDENCE_PATH is set, the run also writes its transcript there
// (docs/feat/scene-centric-backend/sprint-03/EVIDENCE.md is produced this way).

const LOCATION = 'e9900000-0000-4000-8000-0000000000a1';
const DISTRICT_WEATHER = 'overcast' as const;
const FLAG = 'sc319_pushed';
const FLAG_A = 'sc319_side_a';
const FLAG_B = 'sc319_side_b';

const scenes = new PgSceneDefRepository();
const overlays = new PgSceneOverlayRepository();
const flags = new PgFlagRegistry();

const transcript: string[] = [];
const log = (line: string) => transcript.push(line);

const rainOverlay = (): SceneOverlay =>
  createSceneOverlay({
    slug: 'sc319_rain',
    base_scene_slug: 'sc319_gate',
    priority: 10,
    availability: flag(FLAG, true),
    ops: [{ op: 'set_weather', weather: 'rain' }],
  });

const equalPair = (): SceneOverlay[] => [
  createSceneOverlay({
    slug: 'sc319_fog_a',
    base_scene_slug: 'sc319_gate',
    priority: 3,
    availability: flag(FLAG_A, true),
    ops: [{ op: 'set_weather', weather: 'fog' }],
  }),
  createSceneOverlay({
    slug: 'sc319_clear_b',
    base_scene_slug: 'sc319_gate',
    priority: 3,
    availability: flag(FLAG_B, true),
    ops: [{ op: 'set_weather', weather: 'clear' }],
  }),
];

const baseScene = () =>
  createSceneDef({
    id: 'e9900000-0000-4000-8000-0000000000c1',
    slug: 'sc319_gate',
    title: 'Demo gate',
    description: 'SC-319 exit demo base scene',
    location: LOCATION,
  });

const cleanup = async () => {
  await oltpPool.query('DELETE FROM planning.scene_overlays WHERE slug LIKE $1', ['sc319\\_%']);
  await oltpPool.query('DELETE FROM planning.scene_defs WHERE slug LIKE $1', ['sc319\\_%']);
  await oltpPool.query('DELETE FROM planning.flag_definitions WHERE slug LIKE $1', ['sc319\\_%']);
};

function renderEvidence(lines: string[]): string {
  return [
    '# Sprint 03 exit demo: scene composition (SC-319)',
    '',
    'Produced by `server/tests/integration/scene-composition.e2e.test.ts` against the real',
    '`planning.*` tables. Each line is one observed value from the run.',
    '',
    ...lines.map((l) => `- ${l}`),
    '',
  ].join('\n');
}

describe('SC-319 sprint-03 exit demo', () => {
  afterAll(cleanup);

  test('1. flag-gated rain overlay: flag off shows district weather, flag on shows rain', async () => {
    await cleanup();
    await scenes.upsertIfChanged(baseScene());
    await overlays.upsertIfChanged(rainOverlay());

    // Read back from Postgres, then compile.
    const base = await scenes.get('sc319_gate');
    const stored = await overlays.listByBase('sc319_gate');
    expect(base).toBeDefined();
    expect(stored.map((r) => r.slug)).toEqual(['sc319_rain']);
    log(`persisted scene \`sc319_gate\` and overlay \`sc319_rain\` (priority 10, gated on \`${FLAG}\`)`);

    const compiled = composeScene(base!.scene, stored.map((r) => r.overlay));
    const compileErrors = compiled.issues.filter((i) => i.severity === 'error');
    expect(compileErrors).toEqual([]);

    const off = resolveSceneForPlayer(compiled.scene, new Set());
    const offWeather = resolveWeather(off.scene, DISTRICT_WEATHER);
    expect(off.active_layers).toEqual([]);
    expect(offWeather).toEqual({ weather: 'overcast', source: 'district' });
    log(`flag off -> active layers [], weather \`${offWeather.weather}\` (source: ${offWeather.source})`);

    const on = resolveSceneForPlayer(compiled.scene, new Set([FLAG]));
    const onWeather = resolveWeather(on.scene, DISTRICT_WEATHER);
    expect(on.active_layers).toEqual(['sc319_rain']);
    expect(onWeather).toEqual({ weather: 'rain', source: 'overlay:sc319_rain' });
    log(`flag on -> active layers [sc319_rain], weather \`${onWeather.weather}\` (source: ${onWeather.source})`);
  });

  test('2. two equal-priority exclusive overlays compile to SCENE_EXCLUSIVE_CONFLICT', async () => {
    const pair = equalPair();
    for (const o of pair) await overlays.upsertIfChanged(o);
    const stored = await overlays.listByBase('sc319_gate');
    const compiled = composeScene(
      (await scenes.get('sc319_gate'))!.scene,
      stored.filter((r) => r.slug.startsWith('sc319_fog') || r.slug.startsWith('sc319_clear')).map((r) => r.overlay),
    );
    const codes = compiled.issues.filter((i) => i.severity === 'error').map((i) => i.code);
    expect(codes).toContain('SCENE_EXCLUSIVE_CONFLICT');
    log(`two overlays at priority 3 both set weather -> compile errors: ${codes.join(', ')}`);
  });

  test('3. unchanged scene re-upserted is a skip: updated_at is untouched', async () => {
    const before = await scenes.get('sc319_gate');
    const again = await scenes.upsertIfChanged(baseScene());
    const after = await scenes.get('sc319_gate');
    expect(again.status).toBe('unchanged');
    expect(after?.updatedAt).toBe(before?.updatedAt);
    log(`re-upsert of unchanged \`sc319_gate\` -> status \`${again.status}\`, updated_at unchanged (${after?.updatedAt})`);
  });

  test('4. retire on a flag and an overlay keeps the row', async () => {
    await flags.create({ slug: FLAG, meaning: 'SC-319 demo: pushed the person away', semantics: 'latching' });
    expect((await flags.retire(FLAG)).success).toBe(true);
    expect((await flags.get(FLAG))?.slug).toBe(FLAG);

    expect((await overlays.retire('sc319_clear_b')).success).toBe(true);
    const kept = await overlays.get('sc319_clear_b');
    expect(kept).toBeDefined();
    expect(kept?.retiredAt).not.toBeNull();
    log(`retired flag \`${FLAG}\` and overlay \`sc319_clear_b\`; both rows kept (retired_at set)`);

    const out = process.env.SC319_EVIDENCE_PATH;
    if (out) fs.writeFileSync(out, renderEvidence(transcript));
  });
});
