// api/planning/src/scene/compose-scene.test.ts
// SC-303b (m-60): composeScene golden tests — base-only, +1 overlay, +3 overlays at mixed
// priorities — plus ordering, folding and immutability.

import {
  FALSE,
  TRUE,
  and,
  createSceneDef,
  createSceneOverlay,
  flag,
  not,
  type SceneDef,
  type SceneOverlay,
} from '@las-flores/api-contracts';
import { composeScene, sortOverlays } from './compose-scene.js';
import { deepFreeze } from './test-support.js';

const base = (): SceneDef =>
  createSceneDef({
    id: 'c3000000-0000-4000-8000-000000000003',
    slug: 'vq_airport_gate',
    title: 'Airport gate',
    description: 'A gate.',
    location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    items: ['ticket'],
    dialogue_refs: ['dialogue_vq_endings'],
    role_slots: [
      { slot_id: 'valentina', cast: 'valentina_quan', position: 'left' },
      { slot_id: 'bystander', cast: null, position: 'right' },
    ],
  });

const BASE_PROVENANCE = {
  'dialogue_refs.dialogue_vq_endings': 'base',
  'items.ticket': 'base',
  'role_slots.bystander': 'base',
  'role_slots.bystander.cast': 'base',
  'role_slots.valentina': 'base',
  'role_slots.valentina.cast': 'base',
  time: 'base',
  weather: 'base',
};

const ov = (slug: string, priority: number, rest: Partial<SceneOverlay> = {}): SceneOverlay =>
  createSceneOverlay({ slug, base_scene_slug: 'vq_airport_gate', priority, ...rest });

describe('composeScene goldens (SC-303b m-60)', () => {
  test('base only', () => {
    const { scene, issues } = composeScene(deepFreeze(base()), []);
    expect(issues).toEqual([]);
    expect(scene).toEqual({
      scene_slug: 'vq_airport_gate',
      base: { ...base(), provenance: BASE_PROVENANCE },
      layers: [],
      flags: [],
      issues: [],
    });
  });

  test('+1 static overlay is folded into the base', () => {
    const rain = ov('always_rain', 5, {
      ops: [
        { op: 'set_weather', weather: 'rain' },
        { op: 'add_items', items: ['umbrella'] },
      ],
    });
    const { scene, issues } = composeScene(deepFreeze(base()), deepFreeze([rain]));
    expect(issues).toEqual([]);
    expect(scene.layers).toEqual([]);
    expect(scene.base).toEqual({
      ...base(),
      weather: 'rain',
      items: ['ticket', 'umbrella'],
      provenance: { ...BASE_PROVENANCE, 'items.umbrella': 'always_rain', weather: 'always_rain' },
    });
  });

  test('+1 flag-gated overlay stays a conditional layer', () => {
    const gated = ov('vq_pushed_away_rain', 10, {
      availability: flag('vq_pushed_away', true),
      ops: [{ op: 'set_weather', weather: 'rain' }],
    });
    const { scene, issues } = composeScene(deepFreeze(base()), deepFreeze([gated]));
    expect(issues).toEqual([]);
    expect(scene.base).toEqual({ ...base(), provenance: BASE_PROVENANCE });
    expect(scene.layers).toEqual([
      { slug: 'vq_pushed_away_rain', priority: 10, availability: flag('vq_pushed_away', true), ops: gated.ops },
    ]);
    expect(scene.flags).toEqual(['vq_pushed_away']);
  });

  test('+3 overlays at mixed priorities: highest exclusive wins, additive merges by identity', () => {
    const overlays = [
      ov('c_fog_high', 20, { ops: [{ op: 'set_weather', weather: 'fog' }, { op: 'cast_slot', slot_id: 'bystander', cast: 'lucia' }] }),
      ov('a_rain_low', 1, {
        ops: [
          { op: 'set_weather', weather: 'rain' },
          { op: 'add_dialogue_refs', refs: ['dialogue_vq_endings', 'dialogue_rain'] },
        ],
      }),
      ov('b_night_mid', 10, {
        ops: [
          { op: 'set_time', time: 'night' },
          { op: 'cast_slot', slot_id: 'bystander', cast: 'marco' },
          { op: 'add_role_slot', slot: { slot_id: 'guard', cast: 'officer_diaz', position: 'center' } },
        ],
      }),
    ];
    const { scene, issues } = composeScene(deepFreeze(base()), deepFreeze(overlays));
    expect(issues).toEqual([]);
    expect(scene.layers).toEqual([]);
    expect(scene.base).toEqual({
      ...base(),
      weather: 'fog',
      time: 'night',
      dialogue_refs: ['dialogue_vq_endings', 'dialogue_rain'],
      role_slots: [
        { slot_id: 'valentina', cast: 'valentina_quan', position: 'left' },
        { slot_id: 'bystander', cast: 'lucia', position: 'right' },
        { slot_id: 'guard', cast: 'officer_diaz', position: 'center' },
      ],
      provenance: {
        ...BASE_PROVENANCE,
        'dialogue_refs.dialogue_rain': 'a_rain_low',
        'role_slots.bystander.cast': 'c_fog_high',
        'role_slots.guard': 'b_night_mid',
        'role_slots.guard.cast': 'b_night_mid',
        time: 'b_night_mid',
        weather: 'c_fog_high',
      },
    });
  });
});

describe('composeScene ordering and folding', () => {
  test('sortOverlays orders (priority asc, slug asc) without mutating input', () => {
    const input = deepFreeze([ov('b', 1), ov('a', 1), ov('z', 0)]);
    expect(sortOverlays(input).map((o) => o.slug)).toEqual(['z', 'a', 'b']);
  });

  test('equal priority: slug order decides which exclusive write is last', () => {
    const overlays = [ov('b_rain', 5, { ops: [{ op: 'set_weather', weather: 'rain' }] }), ov('a_fog', 5, { ops: [{ op: 'set_weather', weather: 'fog' }] })];
    expect(composeScene(base(), overlays).scene.base.weather).toBe('rain');
    expect(composeScene(base(), [...overlays].reverse()).scene.base.weather).toBe('rain');
  });

  test('a static overlay that sorts AFTER a layer stays a layer (order is preserved)', () => {
    const gated = ov('gated_rain', 1, { availability: flag('raining', true), ops: [{ op: 'set_weather', weather: 'rain' }] });
    const late = ov('static_fog', 9, { ops: [{ op: 'set_weather', weather: 'fog' }] });
    const early = ov('static_items', 0, { ops: [{ op: 'add_items', items: ['map'] }] });
    const { scene } = composeScene(base(), [late, gated, early]);
    expect(scene.base.items).toEqual(['ticket', 'map']);
    expect(scene.base.weather).toBeNull();
    expect(scene.layers.map((l) => l.slug)).toEqual(['gated_rain', 'static_fog']);
    expect(scene.flags).toEqual(['raining']);
  });

  test('a constant-false overlay is dropped with a hint', () => {
    const { scene, issues } = composeScene(base(), [ov('never', 1, { availability: and([TRUE, not(TRUE)]), ops: [{ op: 'add_items', items: ['x'] }] })]);
    expect(scene.base.items).toEqual(['ticket']);
    expect(scene.layers).toEqual([]);
    expect(issues).toEqual([expect.objectContaining({ code: 'SCENE_OVERLAY_NEVER_APPLIES', path: 'never', severity: 'hint' })]);
    expect(scene.issues).toEqual(issues);
    expect(composeScene(base(), [ov('never2', 1, { availability: FALSE })]).scene.layers).toEqual([]);
  });

  test('an overlay for another base scene is rejected', () => {
    const other = createSceneOverlay({ slug: 'elsewhere', base_scene_slug: 'other_scene', ops: [{ op: 'add_items', items: ['x'] }] });
    const { scene, issues } = composeScene(base(), [other]);
    expect(scene.base.items).toEqual(['ticket']);
    expect(issues).toEqual([expect.objectContaining({ code: 'SCENE_OVERLAY_BASE_MISMATCH', path: 'elsewhere', severity: 'error' })]);
    expect(scene.issues).toEqual([]);
  });

  test('cast_slot on a missing slot is an issue, not a throw — static and layered', () => {
    const missing = { op: 'cast_slot', slot_id: 'ghost', cast: 'x' } as const;
    expect(composeScene(base(), [ov('s', 0, { ops: [missing] })]).issues.map((i) => i.code)).toEqual(['SCENE_SLOT_MISSING']);
    const layered = composeScene(base(), [ov('l', 0, { availability: flag('f', true), ops: [missing] })]);
    expect(layered.issues).toEqual([expect.objectContaining({ code: 'SCENE_SLOT_MISSING', path: 'l.ops[0]' })]);
  });

  test('a layer may cast a slot added by an earlier layer only when its availability implies the adder', () => {
    const add = ov('a_add', 0, { availability: flag('f', true), ops: [{ op: 'add_role_slot', slot: { slot_id: 'guard', cast: null, position: 'left' } }] });
    const implied = ov('b_cast', 0, { availability: and([flag('f', true), flag('g', true)]), ops: [{ op: 'cast_slot', slot_id: 'guard', cast: 'x' }] });
    expect(composeScene(base(), [implied, add]).issues).toEqual([]);
    const loose = { ...implied, availability: flag('g', true) };
    expect(composeScene(base(), [loose, add]).issues).toEqual([
      expect.objectContaining({ code: 'SCENE_SLOT_MISSING', path: 'b_cast.ops[0]', severity: 'error' }),
    ]);
    const sameLayer = ov('c_both', 0, {
      availability: flag('g', true),
      ops: [
        { op: 'add_role_slot', slot: { slot_id: 'guard2', cast: null, position: 'left' } },
        { op: 'cast_slot', slot_id: 'guard2', cast: 'x' },
      ],
    });
    expect(composeScene(base(), [sameLayer]).issues).toEqual([]);
  });

  test('adding a base slot again from a layer is an error', () => {
    const dup = ov('dup', 0, { availability: flag('f', true), ops: [{ op: 'add_role_slot', slot: { slot_id: 'valentina', cast: null, position: 'left' } }] });
    expect(composeScene(base(), [dup]).issues.map((i) => i.code)).toEqual(['SCENE_SLOT_ALREADY_EXISTS']);
  });

  test('inputs are never mutated', () => {
    const b = deepFreeze(base());
    const overlays = deepFreeze([ov('x', 0, { ops: [{ op: 'add_items', items: ['y'] }, { op: 'cast_slot', slot_id: 'bystander', cast: 'z' }] })]);
    expect(() => composeScene(b, overlays)).not.toThrow();
    expect(b.items).toEqual(['ticket']);
  });
});
