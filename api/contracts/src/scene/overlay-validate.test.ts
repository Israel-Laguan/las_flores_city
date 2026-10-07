// api/contracts/src/scene/overlay-validate.test.ts
// SC-303a (m-55/m-56): validateSceneOverlay — one shape-valid and one shape-invalid case
// per op, one table-driven case per issue code, plus one-pass collection.

import { flag, TRUE } from '../condition/expression.js';
import { SCENE_OVERLAY_ISSUE_CODES, validateSceneOverlay } from './overlay-validate.js';
import {
  InvalidSceneOverlayError,
  createSceneOverlay,
  sceneOverlayFromJSON,
  sceneOverlayToJSON,
  stringifySceneOverlay,
  type SceneOverlay,
  type SceneOverlayOp,
} from './scene-overlay.js';

const overlay = (): SceneOverlay => ({
  slug: 'vq_pushed_away_rain',
  base_scene_slug: 'vq_airport_gate',
  priority: 10,
  availability: flag('vq_pushed_away', true),
  ops: [
    { op: 'add_dialogue_refs', refs: ['dialogue_vq_endings'] },
    { op: 'add_items', items: ['umbrella'] },
    { op: 'add_role_slot', slot: { slot_id: 'guard', cast: null, position: 'right' } },
    { op: 'cast_slot', slot_id: 'bystander', cast: 'marco_reyes' },
    { op: 'set_weather', weather: 'rain' },
    { op: 'set_time', time: 'night' },
  ],
});

const valid = (): Record<string, any> => sceneOverlayToJSON(overlay());

const mutate = (fn: (o: Record<string, any>) => void) => () => {
  const o = valid();
  fn(o);
  return o;
};

type Case = [
  code: string,
  path: string,
  severity: 'error' | 'warning' | 'hint',
  input: () => unknown,
  options?: { knownFlags: readonly string[] },
];

const CASES: Case[] = [
  ['SCENE_OVERLAY_NOT_OBJECT', '', 'error', () => []],
  ['SCENE_OVERLAY_FIELD_UNKNOWN', 'patch', 'error', mutate((o) => (o.patch = {}))],
  ['SCENE_OVERLAY_FIELD_UNKNOWN', 'ops[0].extra', 'error', mutate((o) => (o.ops[0].extra = 1))],
  ['SCENE_OVERLAY_FIELD_UNKNOWN', 'ops[2].slot.mood', 'error', mutate((o) => (o.ops[2].slot.mood = 'x'))],
  ['SCENE_OVERLAY_FIELD_MISSING', 'priority', 'error', mutate((o) => delete o.priority)],
  ['SCENE_OVERLAY_FIELD_MISSING', 'ops[4].weather', 'error', mutate((o) => delete o.ops[4].weather)],
  ['SCENE_OVERLAY_FIELD_MISSING', 'ops[2].slot.position', 'error', mutate((o) => delete o.ops[2].slot.position)],
  ['SCENE_OVERLAY_FIELD_TYPE', 'ops', 'error', mutate((o) => (o.ops = {}))],
  ['SCENE_OVERLAY_FIELD_TYPE', 'ops[0]', 'error', mutate((o) => (o.ops[0] = 'add'))],
  ['SCENE_OVERLAY_FIELD_TYPE', 'ops[0].refs', 'error', mutate((o) => (o.ops[0].refs = 'a'))],
  ['SCENE_OVERLAY_FIELD_TYPE', 'ops[2].slot', 'error', mutate((o) => (o.ops[2].slot = 'guard'))],
  ['SCENE_OVERLAY_SCHEMA_VERSION_MISMATCH', 'schema_version', 'error', mutate((o) => (o.schema_version = 2))],
  ['SCENE_OVERLAY_SLUG_INVALID', 'slug', 'error', mutate((o) => (o.slug = '1bad'))],
  ['SCENE_OVERLAY_BASE_SLUG_INVALID', 'base_scene_slug', 'error', mutate((o) => (o.base_scene_slug = 'no good'))],
  ['SCENE_OVERLAY_PRIORITY_INVALID', 'priority', 'error', mutate((o) => (o.priority = '10'))],
  ['SCENE_OVERLAY_OPS_EMPTY', 'ops', 'warning', mutate((o) => (o.ops = []))],
  ['SCENE_OVERLAY_OP_UNKNOWN', 'ops[0].op', 'error', mutate((o) => (o.ops[0] = { op: 'jsonb_merge', patch: {} }))],
  ['SCENE_OVERLAY_OP_UNKNOWN', 'ops[0].op', 'error', mutate((o) => delete o.ops[0].op)],
  ['SCENE_OVERLAY_OP_DUPLICATE', 'ops[6]', 'error', mutate((o) => o.ops.push({ op: 'set_weather', weather: 'fog' }))],
  [
    'SCENE_OVERLAY_OP_DUPLICATE',
    'ops[6]',
    'error',
    mutate((o) => o.ops.push({ op: 'cast_slot', slot_id: 'bystander', cast: null })),
  ],
  [
    'SCENE_OVERLAY_OP_DUPLICATE',
    'ops[6]',
    'error',
    mutate((o) => o.ops.push({ op: 'add_role_slot', slot: { slot_id: 'guard', cast: null, position: 'left' } })),
  ],
  ['SCENE_OVERLAY_REF_SLUG_INVALID', 'ops[0].refs[0]', 'error', mutate((o) => (o.ops[0].refs = ['no good']))],
  ['SCENE_OVERLAY_REF_SLUG_INVALID', 'ops[1].items[1]', 'error', mutate((o) => o.ops[1].items.push(5))],
  ['SCENE_OVERLAY_REF_DUPLICATE', 'ops[1].items[1]', 'warning', mutate((o) => (o.ops[1].items = ['a', 'a']))],
  ['SCENE_OVERLAY_SLOT_ID_INVALID', 'ops[2].slot.slot_id', 'error', mutate((o) => (o.ops[2].slot.slot_id = 'x y'))],
  ['SCENE_OVERLAY_SLOT_ID_INVALID', 'ops[3].slot_id', 'error', mutate((o) => (o.ops[3].slot_id = ''))],
  ['SCENE_OVERLAY_SLOT_CAST_INVALID', 'ops[2].slot.cast', 'error', mutate((o) => (o.ops[2].slot.cast = 'x y'))],
  ['SCENE_OVERLAY_SLOT_CAST_INVALID', 'ops[3].cast', 'error', mutate((o) => (o.ops[3].cast = 42))],
  ['SCENE_OVERLAY_SLOT_POSITION_INVALID', 'ops[2].slot.position', 'error', mutate((o) => (o.ops[2].slot.position = 'up'))],
  ['SCENE_OVERLAY_WEATHER_INVALID', 'ops[4].weather', 'error', mutate((o) => (o.ops[4].weather = 'hail'))],
  ['SCENE_OVERLAY_TIME_INVALID', 'ops[5].time', 'error', mutate((o) => (o.ops[5].time = 'dawn'))],
  ['SCENE_OVERLAY_AVAILABILITY_INVALID', 'availability', 'error', mutate((o) => (o.availability = { type: 'xor' }))],
  [
    'SCENE_OVERLAY_AVAILABILITY_UNKNOWN_FLAG',
    'availability',
    'warning',
    () => valid(),
    { knownFlags: ['vq_gave_space'] },
  ],
];

describe('validateSceneOverlay (SC-303a)', () => {
  test('a valid overlay has no issues', () => {
    expect(validateSceneOverlay(valid())).toEqual({ valid: true, issues: [] });
  });

  test.each(CASES)('%s at %p (%s)', (...row: Case) => {
    const [code, path, severity, input, options] = row;
    const { issues, valid: ok } = validateSceneOverlay(input(), options);
    expect(issues).toContainEqual(expect.objectContaining({ code, path, severity }));
    const hit = issues.find((i) => i.code === code && i.path === path);
    expect(hit?.message.length).toBeGreaterThan(0);
    expect(ok).toBe(severity !== 'error');
  });

  test('every documented code has at least one case', () => {
    const covered = new Set(CASES.map(([code]) => code));
    for (const code of Object.values(SCENE_OVERLAY_ISSUE_CODES)) expect(covered).toContain(code);
  });

  test('codes are stable string constants equal to their key', () => {
    for (const [key, code] of Object.entries(SCENE_OVERLAY_ISSUE_CODES)) expect(code).toBe(key);
  });

  // m-56: one shape-valid and one shape-invalid case per op.
  const OPS: Array<[name: string, good: SceneOverlayOp, bad: Record<string, unknown>]> = [
    ['add_dialogue_refs', { op: 'add_dialogue_refs', refs: ['a', 'b'] }, { op: 'add_dialogue_refs', refs: [''] }],
    ['add_items', { op: 'add_items', items: ['knife'] }, { op: 'add_items' }],
    [
      'add_role_slot',
      { op: 'add_role_slot', slot: { slot_id: 's', cast: 'c', position: 'center' } },
      { op: 'add_role_slot', slot: { slot_id: 's', cast: null } },
    ],
    ['cast_slot', { op: 'cast_slot', slot_id: 's', cast: null }, { op: 'cast_slot', slot_id: 's' }],
    ['set_weather', { op: 'set_weather', weather: null }, { op: 'set_weather', weather: 'snow' }],
    ['set_time', { op: 'set_time', time: null }, { op: 'set_time', time: 'noon' }],
  ];

  test.each(OPS)('op %s: shape-valid passes, shape-invalid fails', (_name, good, bad) => {
    const withOp = (op: unknown) => ({ ...valid(), ops: [op] });
    expect(validateSceneOverlay(withOp(good)).issues).toEqual([]);
    expect(validateSceneOverlay(withOp(bad)).valid).toBe(false);
  });

  test('null weather/time are allowed (explicitly clear back to inherit / any time)', () => {
    const o = createSceneOverlay({
      slug: 'clear_it',
      base_scene_slug: 'vq_airport_gate',
      ops: [
        { op: 'set_weather', weather: null },
        { op: 'set_time', time: null },
      ],
    });
    expect(validateSceneOverlay(sceneOverlayToJSON(o)).issues).toEqual([]);
  });

  test('collects all issues in one pass', () => {
    const { issues } = validateSceneOverlay({
      ...valid(),
      slug: 'bad slug',
      priority: 0.5,
      ops: [{ op: 'set_weather', weather: 'hail' }, { op: 'nope' }],
    });
    expect(issues.map((i) => i.code).sort()).toEqual(
      [
        'SCENE_OVERLAY_OP_UNKNOWN',
        'SCENE_OVERLAY_PRIORITY_INVALID',
        'SCENE_OVERLAY_SLUG_INVALID',
        'SCENE_OVERLAY_WEATHER_INVALID',
      ].sort(),
    );
  });

  test('does not throw on hostile input', () => {
    for (const input of [null, undefined, 'x', 3, { ops: [null, 3, [], { op: 'add_role_slot', slot: [] }] }]) {
      expect(() => validateSceneOverlay(input)).not.toThrow();
      expect(validateSceneOverlay(input).valid).toBe(false);
    }
  });
});

describe('SceneOverlay serialization (SC-303a m-54)', () => {
  test('toJSON emits sorted keys, schema_version, and sorted op keys', () => {
    const json = sceneOverlayToJSON(overlay());
    expect(Object.keys(json)).toEqual(['availability', 'base_scene_slug', 'ops', 'priority', 'schema_version', 'slug']);
    for (const op of json.ops as Record<string, unknown>[]) {
      const keys = Object.keys(op);
      expect(keys).toEqual([...keys].sort());
    }
    expect(json.schema_version).toBe(1);
  });

  test('round-trips through JSON text', () => {
    const o = overlay();
    expect(sceneOverlayFromJSON(JSON.parse(stringifySceneOverlay(o)))).toEqual(o);
  });

  test('createSceneOverlay defaults availability=TRUE, priority=0, ops=[]', () => {
    expect(createSceneOverlay({ slug: 'a', base_scene_slug: 'b' })).toEqual({
      slug: 'a',
      base_scene_slug: 'b',
      priority: 0,
      availability: TRUE,
      ops: [],
    });
  });

  test('fromJSON copies — no alias to the input survives', () => {
    const json = valid();
    const o = sceneOverlayFromJSON(json);
    json.ops[0].refs.push('mutated');
    json.ops[2].slot.cast = 'mutated';
    expect(o).toEqual(overlay());
  });

  test('fromJSON throws InvalidSceneOverlayError carrying every error', () => {
    try {
      sceneOverlayFromJSON({ ...valid(), slug: 'bad slug', priority: 'x' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSceneOverlayError);
      expect((err as InvalidSceneOverlayError).issues.map((i) => i.code).sort()).toEqual([
        'SCENE_OVERLAY_PRIORITY_INVALID',
        'SCENE_OVERLAY_SLUG_INVALID',
      ]);
    }
  });

  test('warnings do not make fromJSON throw', () => {
    expect(() => sceneOverlayFromJSON({ ...valid(), ops: [] })).not.toThrow();
  });
});
