// api/contracts/src/scene/validate.test.ts
// SC-301b: validateScene — one table-driven case per issue code, plus one-pass collection.

import { flag, TRUE } from '../condition/expression.js';
import { SCENE_ISSUE_CODES, validateScene } from './validate.js';
import { InvalidSceneDefError, sceneDefFromJSON, sceneDefToJSON, type SceneDef } from './scene-def.js';

const valid = (): Record<string, unknown> =>
  sceneDefToJSON({
    id: 'c3000000-0000-4000-8000-000000000003',
    slug: 'vq_airport_gate',
    title: 'Airport gate',
    description: 'A gate.',
    location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    time: 'night',
    weather: null,
    items: ['umbrella'],
    dialogue_refs: ['dialogue_a'],
    role_slots: [{ slot_id: 'valentina', cast: 'valentina_quan', position: 'left' }],
    availability: flag('vq_gave_space', true),
    priority: 0,
  } satisfies SceneDef);

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
  ['SCENE_NOT_OBJECT', '', 'error', () => 'scene'],
  ['SCENE_FIELD_UNKNOWN', 'mood', 'error', mutate((o) => (o.mood = 'tense'))],
  ['SCENE_FIELD_UNKNOWN', 'role_slots[0].personality', 'error', mutate((o) => (o.role_slots[0].personality = 'x'))],
  ['SCENE_FIELD_MISSING', 'title', 'error', mutate((o) => delete o.title)],
  ['SCENE_FIELD_MISSING', 'weather', 'error', mutate((o) => (o.weather = undefined))],
  ['SCENE_FIELD_MISSING', 'role_slots[0].cast', 'error', mutate((o) => delete o.role_slots[0].cast)],
  ['SCENE_FIELD_TYPE', 'title', 'error', mutate((o) => (o.title = 7))],
  ['SCENE_FIELD_TYPE', 'items', 'error', mutate((o) => (o.items = 'umbrella'))],
  ['SCENE_FIELD_TYPE', 'role_slots[0]', 'error', mutate((o) => (o.role_slots[0] = 'valentina'))],
  ['SCENE_SCHEMA_VERSION_MISMATCH', 'schema_version', 'error', mutate((o) => (o.schema_version = 99))],
  ['SCENE_SLUG_INVALID', 'slug', 'error', mutate((o) => (o.slug = 'has space'))],
  ['SCENE_LOCATION_INVALID', 'location', 'error', mutate((o) => (o.location = 'central_plaza'))],
  ['SCENE_TIME_INVALID', 'time', 'error', mutate((o) => (o.time = 'dawn'))],
  ['SCENE_WEATHER_INVALID', 'weather', 'error', mutate((o) => (o.weather = 'hail'))],
  ['SCENE_PRIORITY_INVALID', 'priority', 'error', mutate((o) => (o.priority = 1.5))],
  ['SCENE_REF_SLUG_INVALID', 'items[1]', 'error', mutate((o) => o.items.push('no good'))],
  ['SCENE_REF_SLUG_INVALID', 'dialogue_refs[0]', 'error', mutate((o) => (o.dialogue_refs = [3]))],
  ['SCENE_DIALOGUE_REF_DUPLICATE', 'dialogue_refs[1]', 'warning', mutate((o) => (o.dialogue_refs = ['a', 'a']))],
  ['SCENE_SLOT_ID_INVALID', 'role_slots[0].slot_id', 'error', mutate((o) => (o.role_slots[0].slot_id = 'no good'))],
  [
    'SCENE_SLOT_DUPLICATE',
    'role_slots[1].slot_id',
    'error',
    mutate((o) => o.role_slots.push({ slot_id: 'valentina', cast: null, position: 'right' })),
  ],
  ['SCENE_SLOT_CAST_INVALID', 'role_slots[0].cast', 'error', mutate((o) => (o.role_slots[0].cast = 'no good'))],
  ['SCENE_SLOT_POSITION_INVALID', 'role_slots[0].position', 'error', mutate((o) => (o.role_slots[0].position = 'top'))],
  ['SCENE_FIELD_MISSING', 'availability', 'error', mutate((o) => delete o.availability)],
  ['SCENE_AVAILABILITY_INVALID', 'availability', 'error', mutate((o) => (o.availability = { type: 'maybe' }))],
  [
    'SCENE_AVAILABILITY_INVALID',
    'availability',
    'error',
    mutate((o) => (o.availability = { type: 'flag', flag: 'has key', expected: true })),
  ],
  [
    'SCENE_AVAILABILITY_UNKNOWN_FLAG',
    'availability',
    'warning',
    mutate((o) => (o.availability = { type: 'flag', flag: 'vq_typo', expected: true })),
    { knownFlags: ['vq_gave_space'] },
  ],
];

describe('validateScene (SC-301b)', () => {
  test('a valid scene has no issues', () => {
    expect(validateScene(valid())).toEqual({ valid: true, issues: [] });
  });

  // Rest args: jest-each reads a 5th named parameter as a `done` callback when rows have 4 entries.
  test.each(CASES)('%s at %p (%s)', (...row: Case) => {
    const [code, path, severity, input, options] = row;
    const { issues, valid: ok } = validateScene(input(), options);
    expect(issues).toContainEqual(expect.objectContaining({ code, path, severity }));
    const hit = issues.find((i) => i.code === code && i.path === path);
    expect(typeof hit?.message).toBe('string');
    expect(hit?.message.length).toBeGreaterThan(0);
    expect(ok).toBe(severity !== 'error');
  });

  test('every documented code has at least one case', () => {
    const covered = new Set(CASES.map(([code]) => code));
    for (const code of Object.values(SCENE_ISSUE_CODES)) {
      expect(covered).toContain(code);
    }
  });

  test('codes are stable string constants equal to their key', () => {
    for (const [key, code] of Object.entries(SCENE_ISSUE_CODES)) {
      expect(code).toBe(key);
    }
  });

  test('unknown-flag warning is opt-in and never fires for known flags or without a registry', () => {
    const input = valid();
    expect(validateScene(input).issues).toEqual([]);
    expect(validateScene(input, { knownFlags: ['vq_gave_space'] }).issues).toEqual([]);
    expect(validateScene(input, { knownFlags: new Set(['other']) }).issues.map((i) => i.code)).toEqual([
      'SCENE_AVAILABILITY_UNKNOWN_FLAG',
    ]);
  });

  test('TRUE availability references no flags', () => {
    expect(validateScene(sceneDefToJSON({ ...(sceneDefFromJSON(valid())), availability: TRUE }), { knownFlags: [] }).issues).toEqual([]);
  });

  test('collects all issues in one pass (no first-error exit)', () => {
    const { issues } = validateScene({
      ...valid(),
      slug: 'bad slug',
      time: 'dawn',
      weather: 'hail',
      priority: 0.5,
      role_slots: [
        { slot_id: 'a', cast: null, position: 'top' },
        { slot_id: 'a', cast: null, position: 'left' },
      ],
    });
    expect(issues.map((i) => i.code).sort()).toEqual(
      [
        'SCENE_PRIORITY_INVALID',
        'SCENE_SLOT_DUPLICATE',
        'SCENE_SLOT_POSITION_INVALID',
        'SCENE_SLUG_INVALID',
        'SCENE_TIME_INVALID',
        'SCENE_WEATHER_INVALID',
      ].sort(),
    );
  });

  test('does not throw on hostile input', () => {
    for (const input of [null, undefined, 3, [], { role_slots: [null, 3, []] }]) {
      expect(() => validateScene(input)).not.toThrow();
      expect(validateScene(input).valid).toBe(false);
    }
  });

  test('sceneDefFromJSON throws InvalidSceneDefError carrying every issue', () => {
    try {
      sceneDefFromJSON({ ...valid(), slug: 'bad slug', time: 'dawn' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSceneDefError);
      expect((err as InvalidSceneDefError).issues.map((i) => i.code).sort()).toEqual([
        'SCENE_SLUG_INVALID',
        'SCENE_TIME_INVALID',
      ]);
    }
  });

  test('warnings do not make fromJSON throw', () => {
    expect(() => sceneDefFromJSON({ ...valid(), dialogue_refs: ['a', 'a'] })).not.toThrow();
  });
});
