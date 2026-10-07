// api/planning/src/scene/flag-gated.test.ts
// SC-312 (m-66/m-67): flag-gated composition — the SC-M2 exit-criterion demo at the
// pure-function level: ONE compiled artifact resolves differently as a flag flips.

import {
  createSceneDef,
  createSceneOverlay,
  flag,
  resolveSceneForPlayer,
  selectActiveOverlays,
  type SceneOverlay,
} from '@las-flores/api-contracts';
import { composeScene } from './compose-scene.js';
import { deepFreeze } from './test-support.js';

const base = createSceneDef({
  id: 'c3000000-0000-4000-8000-000000000003',
  slug: 'vq_airport_gate',
  title: 'Airport gate',
  description: 'A gate.',
  location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
  weather: 'clear',
  dialogue_refs: ['dialogue_vq_gate'],
  role_slots: [{ slot_id: 'bystander', cast: null, position: 'right' }],
});

const pushedAway: SceneOverlay = createSceneOverlay({
  slug: 'vq_pushed_away_rain',
  base_scene_slug: 'vq_airport_gate',
  priority: 10,
  availability: flag('vq_pushed_away', true),
  ops: [
    { op: 'set_weather', weather: 'rain' },
    { op: 'cast_slot', slot_id: 'bystander', cast: 'marco_reyes' },
    { op: 'add_dialogue_refs', refs: ['dialogue_vq_endings'] },
  ],
});

describe('flag-gated composition (SC-312)', () => {
  const compiled = composeScene(deepFreeze(base), deepFreeze([pushedAway]));

  test('compile keeps the overlay as a layer and records its flag dependency', () => {
    expect(compiled.issues).toEqual([]);
    expect(compiled.scene.layers.map((l) => l.slug)).toEqual(['vq_pushed_away_rain']);
    expect(compiled.scene.flags).toEqual(['vq_pushed_away']);
  });

  test('flag flip true → false → true changes weather, cast and dialogue_refs', () => {
    const states = [true, false, true].map((on) =>
      resolveSceneForPlayer(compiled.scene, new Set(on ? ['vq_pushed_away'] : [])).scene,
    );
    const view = states.map((s) => ({ weather: s.weather, cast: s.role_slots[0].cast, refs: s.dialogue_refs }));
    const on = { weather: 'rain', cast: 'marco_reyes', refs: ['dialogue_vq_gate', 'dialogue_vq_endings'] };
    const off = { weather: 'clear', cast: null, refs: ['dialogue_vq_gate'] };
    expect(view).toEqual([on, off, on]);
    expect(states[0].provenance.weather).toBe('vq_pushed_away_rain');
    expect(states[1].provenance.weather).toBe('base');
  });

  test('composeScene(…, { flags }) skips overlays whose availability is false', () => {
    expect(composeScene(base, [pushedAway], { flags: new Set() }).scene.base.weather).toBe('clear');
    const on = composeScene(base, [pushedAway], { flags: new Set(['vq_pushed_away']) }).scene;
    expect(on.base.weather).toBe('rain');
    expect(on.layers).toEqual([]);
  });

  test('player-mode composeScene equals runtime selection over the compiled artifact', () => {
    for (const flags of [new Set<string>(), new Set(['vq_pushed_away'])]) {
      expect(composeScene(base, [pushedAway], { flags }).scene.base).toEqual(resolveSceneForPlayer(compiled.scene, flags).scene);
    }
  });

  test('selectActiveOverlays is re-exported for runtime from contracts', () => {
    expect(selectActiveOverlays(compiled.scene.layers, new Set(['vq_pushed_away']))).toHaveLength(1);
  });
});
