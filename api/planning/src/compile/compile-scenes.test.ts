// api/planning/src/compile/compile-scenes.test.ts
// SC-402/403/405: compile -> content-addressed artifacts, idempotency, R10 report.

import {
  TRUE,
  createSceneDef,
  createSceneOverlay,
  flag,
  resolveSceneForPlayer,
  sceneArtifactPayloadFromJSON,
  stringifyCompileReport,
  type SceneDef,
  type SceneOverlay,
} from '@las-flores/api-contracts';
import { InMemorySceneDefRepository } from '../canon/scene-def-repository.js';
import { InMemorySceneOverlayRepository } from '../canon/scene-overlay-repository.js';
import { resolveWeather } from '../scene/resolve-weather.js';
import { InMemoryArtifactStore } from './artifact-store.js';
import { compileScenes, type CompileDeps } from './compile-scenes.js';
import { InMemoryContentLookup, type ContentLookup } from './content-lookup.js';

const LOCATION = 'a1b2c3d4-e5f6-7890-abcd-ef1234567001';
const FIXED = () => new Date('2026-10-10T00:00:00.000Z');

const scene = (slug: string, over: Partial<SceneDef> = {}): SceneDef =>
  createSceneDef({
    id: 'c3000000-0000-4000-8000-000000000003',
    slug,
    title: slug,
    description: 'd',
    location: LOCATION,
    dialogue_refs: ['dlg_gate'],
    role_slots: [{ slot_id: 'host', cast: 'valentina_quan', position: 'left' }],
    ...over,
  });

const rain = (base: string, slug = `${base}_rain`, priority = 10): SceneOverlay =>
  createSceneOverlay({
    slug,
    base_scene_slug: base,
    priority,
    availability: flag('pushed_away', true),
    ops: [{ op: 'set_weather', weather: 'rain' }],
  });

const content = (over: ConstructorParameters<typeof InMemoryContentLookup>[0] = {}) =>
  new InMemoryContentLookup({
    locations: { [LOCATION]: { districtWeather: 'overcast' } },
    characters: ['valentina_quan', 'marco_reyes'],
    dialogues: ['dlg_gate', 'dlg_other'],
    ...over,
  });

async function setup(content_: ContentLookup = content()) {
  const scenes = new InMemorySceneDefRepository();
  const overlays = new InMemorySceneOverlayRepository();
  const deps: CompileDeps = { scenes, overlays, content: content_, now: FIXED };
  return { scenes, overlays, deps };
}

describe('compileScenes: one scene with a flag-gated overlay (SC-M2 exit criterion 1)', () => {
  test('compiles to one verified content-addressed artifact that resolves differently as the flag flips', async () => {
    const { scenes, overlays, deps } = await setup();
    await scenes.create(scene('gate'));
    await overlays.create(rain('gate'));

    const { report, records } = await compileScenes(deps);
    expect(report.ok).toBe(true);
    expect(records).toHaveLength(1);
    const [rec] = records;
    expect(rec.artifact.artifact_id).toMatch(/^[0-9a-f]{64}$/);
    expect(report.scenes[0]).toMatchObject({ scene_slug: 'gate', status: 'compiled', artifact_id: rec.artifact.artifact_id });

    // Stored and read back through the port, then parsed strictly: this is what runtime would see.
    const store = new InMemoryArtifactStore();
    await store.putMany(records);
    const stored = await store.get(rec.artifact.artifact_id);
    const payload = sceneArtifactPayloadFromJSON(JSON.parse(stored!.payload));
    expect(payload.scene.layers.map((l) => l.slug)).toEqual(['gate_rain']);
    expect(payload.scene.flags).toEqual(['pushed_away']);

    const off = resolveSceneForPlayer(payload.scene, new Set());
    const on = resolveSceneForPlayer(payload.scene, new Set(['pushed_away']));
    expect(off.active_layers).toEqual([]);
    expect(resolveWeather(off.scene, payload.district_weather)).toEqual({ weather: 'overcast', source: 'district' });
    expect(on.active_layers).toEqual(['gate_rain']);
    expect(resolveWeather(on.scene, payload.district_weather)).toEqual({ weather: 'rain', source: 'overlay:gate_rain' });
  });

  test('the SAME artifact serves both flag states (no per-flag-assignment variants)', async () => {
    const { scenes, overlays, deps } = await setup();
    await scenes.create(scene('gate'));
    await overlays.create(rain('gate'));
    const { records } = await compileScenes(deps);
    expect(records).toHaveLength(1);
  });

  test('a constant-TRUE overlay is folded into the base, not kept as a layer', async () => {
    const { scenes, overlays, deps } = await setup();
    await scenes.create(scene('gate'));
    await overlays.create(createSceneOverlay({ slug: 'gate_static', base_scene_slug: 'gate', availability: TRUE, ops: [{ op: 'set_weather', weather: 'fog' }] }));
    const { records } = await compileScenes(deps);
    const payload = sceneArtifactPayloadFromJSON(JSON.parse(records[0].payload));
    expect(payload.scene.layers).toEqual([]);
    expect(payload.scene.base.weather).toBe('fog');
  });
});

describe('compileScenes: idempotency (SC-403)', () => {
  test('recompiling unchanged canon yields identical ids, and the store reports unchanged', async () => {
    const { scenes, overlays, deps } = await setup();
    await scenes.create(scene('gate'));
    await overlays.create(rain('gate'));
    const store = new InMemoryArtifactStore();

    const first = await compileScenes(deps);
    expect(await store.putMany(first.records)).toEqual({ created: [first.records[0].artifact.artifact_id], unchanged: [] });
    const second = await compileScenes({ ...deps, now: () => new Date('2030-01-01T00:00:00.000Z') });

    expect(second.records[0].artifact.artifact_id).toBe(first.records[0].artifact.artifact_id);
    expect(second.records[0].payload).toBe(first.records[0].payload);
    expect(await store.putMany(second.records)).toEqual({ created: [], unchanged: [first.records[0].artifact.artifact_id] });
    expect(store.size).toBe(1);
  });

  test.each([
    ['an overlay edit', async (c: Awaited<ReturnType<typeof setup>>) => void (await c.overlays.upsertIfChanged(rain('gate', 'gate_rain', 11)))],
    ['a scene edit', async (c: Awaited<ReturnType<typeof setup>>) => void (await c.scenes.upsertIfChanged(scene('gate', { title: 'changed' })))],
    ['a new overlay', async (c: Awaited<ReturnType<typeof setup>>) => void (await c.overlays.create(rain('gate', 'gate_rain2', 12)))],
  ])('%s changes the artifact id', async (_name, change) => {
    const ctx = await setup();
    await ctx.scenes.create(scene('gate'));
    await ctx.overlays.create(rain('gate'));
    const before = (await compileScenes(ctx.deps)).records[0].artifact.artifact_id;
    await change(ctx);
    const after = (await compileScenes(ctx.deps)).records[0].artifact.artifact_id;
    expect(after).not.toBe(before);
  });

  test('a retired overlay no longer contributes (and changes the id)', async () => {
    const { scenes, overlays, deps } = await setup();
    await scenes.create(scene('gate'));
    await overlays.create(rain('gate'));
    const before = (await compileScenes(deps)).records[0].artifact.artifact_id;
    await overlays.retire('gate_rain');
    const after = await compileScenes(deps);
    expect(sceneArtifactPayloadFromJSON(JSON.parse(after.records[0].payload)).scene.layers).toEqual([]);
    expect(after.records[0].artifact.artifact_id).not.toBe(before);
  });

  test('a district weather change changes the id (D8: snapshot at compile)', async () => {
    const a = await setup(content());
    const b = await setup(content({ locations: { [LOCATION]: { districtWeather: 'smog' } } }));
    for (const c of [a, b]) await c.scenes.create(scene('gate'));
    expect((await compileScenes(a.deps)).records[0].artifact.artifact_id).not.toBe(
      (await compileScenes(b.deps)).records[0].artifact.artifact_id,
    );
  });
});

describe('compileScenes: conflicts fail the compile (SC-304)', () => {
  test('equal-priority co-satisfiable exclusive overlays fail; no artifacts are returned for ANY scene', async () => {
    const { scenes, overlays, deps } = await setup();
    await scenes.create(scene('gate'));
    await scenes.create(scene('plaza'));
    await overlays.create(rain('gate', 'gate_a', 3));
    await overlays.create(createSceneOverlay({ slug: 'gate_b', base_scene_slug: 'gate', priority: 3, availability: flag('other', true), ops: [{ op: 'set_weather', weather: 'fog' }] }));

    const { report, records } = await compileScenes(deps);
    expect(report.ok).toBe(false);
    expect(records).toEqual([]);
    expect(report.scenes.map((s) => [s.scene_slug, s.status])).toEqual([
      ['gate', 'failed'],
      ['plaza', 'compiled'],
    ]);
    expect(report.scenes[0].issues).toContainEqual(expect.objectContaining({ code: 'SCENE_EXCLUSIVE_CONFLICT', severity: 'error', scene_slug: 'gate' }));
    expect(report.error_count).toBeGreaterThanOrEqual(1);
  });
});

describe('compileScenes: required content (R10) and the report (SC-405)', () => {
  test('a missing location, character and dialogue are each reported with their path', async () => {
    const { scenes, overlays, deps } = await setup(
      content({ locations: {}, characters: [], dialogues: [] }),
    );
    await scenes.create(scene('gate'));
    await overlays.create(
      createSceneOverlay({
        slug: 'gate_more',
        base_scene_slug: 'gate',
        availability: flag('f', true),
        ops: [
          { op: 'add_dialogue_refs', refs: ['dlg_extra'] },
          { op: 'add_role_slot', slot: { slot_id: 'guard', cast: 'marco_reyes', position: 'right' } },
        ],
      }),
    );
    const { report, records } = await compileScenes(deps);
    expect(records).toEqual([]);
    const got = report.scenes[0].issues.map((i) => `${i.code}@${i.path}`).sort();
    expect(got).toEqual(
      [
        'COMPILE_CAST_CHARACTER_MISSING@gate_more.ops[1].slot.cast',
        'COMPILE_CAST_CHARACTER_MISSING@role_slots[0].cast',
        'COMPILE_DIALOGUE_REF_MISSING@dialogue_refs[0]',
        'COMPILE_DIALOGUE_REF_MISSING@gate_more.ops[0].refs[0]',
        'COMPILE_LOCATION_MISSING@location',
      ].sort(),
    );
  });

  test('a backend that cannot resolve dialogue slugs yields a hint, never a silent pass', async () => {
    const { scenes, deps } = await setup(content({ dialogues: undefined }));
    await scenes.create(scene('gate'));
    const { report, records } = await compileScenes(deps);
    expect(report.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(report.hint_count).toBe(1);
    expect(report.scenes[0].issues).toContainEqual(expect.objectContaining({ code: 'COMPILE_DIALOGUE_REFS_UNVERIFIED', severity: 'hint' }));
  });

  test('hints do not change the artifact id', async () => {
    const a = await setup(content());
    const b = await setup(content({ dialogues: undefined }));
    for (const c of [a, b]) await c.scenes.create(scene('gate'));
    expect((await compileScenes(a.deps)).records[0].artifact.artifact_id).toBe((await compileScenes(b.deps)).records[0].artifact.artifact_id);
  });

  test('unknown and retired scene slugs are reported, not thrown', async () => {
    const { scenes, deps } = await setup();
    await scenes.create(scene('old'));
    await scenes.retire('old');
    const { report, records } = await compileScenes(deps, { slugs: ['old', 'ghost'] });
    expect(records).toEqual([]);
    expect(report.scenes.map((s) => [s.scene_slug, s.issues[0].code])).toEqual([
      ['ghost', 'COMPILE_SCENE_NOT_FOUND'],
      ['old', 'COMPILE_SCENE_RETIRED'],
    ]);
  });

  test('default is every ACTIVE scene; duplicates in slugs are ignored; output sorted by slug', async () => {
    const { scenes, deps } = await setup();
    for (const s of ['b_scene', 'a_scene', 'gone']) await scenes.create(scene(s));
    await scenes.retire('gone');
    const all = await compileScenes(deps);
    expect(all.records.map((r) => r.artifact.name)).toEqual(['a_scene', 'b_scene']);
    const some = await compileScenes(deps, { slugs: ['b_scene', 'b_scene'] });
    expect(some.records).toHaveLength(1);
  });

  test('lookups are batched: one call per kind regardless of scene count', async () => {
    const calls = { locations: 0, characters: 0, dialogues: 0 };
    const inner = content();
    const spy: ContentLookup = {
      locations: async (ids) => (calls.locations++, inner.locations(ids)),
      characters: async (s) => (calls.characters++, inner.characters(s)),
      dialogues: async (s) => (calls.dialogues++, inner.dialogues!(s)),
    };
    const { scenes, deps } = await setup(spy);
    for (let i = 0; i < 20; i++) await scenes.create(scene(`s${String(i).padStart(2, '0')}`));
    await compileScenes(deps);
    expect(calls).toEqual({ locations: 1, characters: 1, dialogues: 1 });
  });

  test('the report is byte-stable across runs', async () => {
    const { scenes, deps } = await setup();
    for (const s of ['b_scene', 'a_scene']) await scenes.create(scene(s));
    expect(stringifyCompileReport((await compileScenes(deps)).report)).toBe(stringifyCompileReport((await compileScenes(deps)).report));
  });

  test('compile never writes: a failed compile leaves canon and any store untouched', async () => {
    const { scenes, deps } = await setup(content({ characters: [] }));
    await scenes.create(scene('gate'));
    const store = new InMemoryArtifactStore();
    const { records } = await compileScenes(deps);
    await store.putMany(records);
    expect(store.size).toBe(0);
  });
});
