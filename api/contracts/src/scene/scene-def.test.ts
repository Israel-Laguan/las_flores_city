// api/contracts/src/scene/scene-def.test.ts
// SC-301a: SceneDef core contract — round-trip, stable bytes, strictness.

import {
  SCENE_SCHEMA_VERSION,
  SCENE_TIMES,
  InvalidSceneDefError,
  sceneDefToJSON,
  sceneDefFromJSON,
  stringifySceneDef,
  type SceneDef,
} from './scene-def.js';

const LOCATION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567001';

function makeScene(overrides: Partial<SceneDef> = {}): SceneDef {
  return {
    id: 'c3000000-0000-4000-8000-000000000001',
    slug: 'central_plaza__ambient',
    title: 'Central Plaza, ambient',
    description: 'The plaza at rest.',
    location: LOCATION_ID,
    time: 'night',
    weather: 'rain',
    items: ['umbrella'],
    dialogue_refs: ['dialogue_b', 'dialogue_a'],
    priority: 0,
    ...overrides,
  };
}

describe('SceneDef contract (SC-301a)', () => {
  test('SCENE_SCHEMA_VERSION is a positive integer', () => {
    expect(Number.isInteger(SCENE_SCHEMA_VERSION)).toBe(true);
    expect(SCENE_SCHEMA_VERSION).toBeGreaterThan(0);
  });

  test('SCENE_TIMES matches the client time-of-day tags', () => {
    expect([...SCENE_TIMES]).toEqual(['day', 'sunset', 'night']);
  });

  test('round-trips through toJSON/fromJSON', () => {
    const scene = makeScene();
    const parsed = sceneDefFromJSON(JSON.parse(JSON.stringify(sceneDefToJSON(scene))));
    expect(parsed).toEqual(scene);
  });

  test('round-trips null weather (inherit) and null time', () => {
    const scene = makeScene({ weather: null, time: null });
    expect(sceneDefFromJSON(sceneDefToJSON(scene))).toEqual(scene);
  });

  test('toJSON stamps the schema version', () => {
    const json = sceneDefToJSON(makeScene()) as Record<string, unknown>;
    expect(json.schema_version).toBe(SCENE_SCHEMA_VERSION);
  });

  test('serialized bytes have sorted keys and no undefined', () => {
    const bytes = stringifySceneDef(makeScene());
    const keys = Object.keys(JSON.parse(bytes));
    expect(keys).toEqual([...keys].sort());
    expect(bytes).not.toContain('undefined');
  });

  test('serialized bytes are independent of input key order', () => {
    const a = makeScene();
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as unknown as SceneDef;
    expect(stringifySceneDef(reordered)).toBe(stringifySceneDef(a));
    // …and of the order a JSON payload arrives in.
    const wire = JSON.parse(stringifySceneDef(a)) as Record<string, unknown>;
    const wireReordered = Object.fromEntries(Object.entries(wire).reverse());
    expect(stringifySceneDef(sceneDefFromJSON(wireReordered))).toBe(stringifySceneDef(a));
  });

  test('array order is preserved (dialogue_refs is ordered)', () => {
    const parsed = sceneDefFromJSON(sceneDefToJSON(makeScene()));
    expect(parsed.dialogue_refs).toEqual(['dialogue_b', 'dialogue_a']);
  });

  test('toJSON normalises an undefined weather/time to null', () => {
    const scene = { ...makeScene(), weather: undefined, time: undefined } as unknown as SceneDef;
    const json = sceneDefToJSON(scene) as Record<string, unknown>;
    expect(json.weather).toBeNull();
    expect(json.time).toBeNull();
  });

  describe('fromJSON strictness', () => {
    const wire = () => sceneDefToJSON(makeScene()) as Record<string, unknown>;

    test.each([
      ['null', null],
      ['a string', 'scene'],
      ['an array', []],
    ])('rejects %s', (_name, value) => {
      expect(() => sceneDefFromJSON(value)).toThrow(InvalidSceneDefError);
    });

    test('rejects an unknown top-level key', () => {
      expect(() => sceneDefFromJSON({ ...wire(), mood: 'tense' })).toThrow(/unknown field 'mood'/);
    });

    test('rejects a missing key', () => {
      const w = wire();
      delete w.title;
      expect(() => sceneDefFromJSON(w)).toThrow(/title/);
    });

    test('rejects a schema_version mismatch', () => {
      expect(() => sceneDefFromJSON({ ...wire(), schema_version: SCENE_SCHEMA_VERSION + 1 })).toThrow(
        /schema_version/,
      );
    });

    test('rejects an invalid time', () => {
      expect(() => sceneDefFromJSON({ ...wire(), time: 'dawn' })).toThrow(/time/);
    });

    test('rejects an invalid weather tag', () => {
      expect(() => sceneDefFromJSON({ ...wire(), weather: 'hail' })).toThrow(/weather/);
    });

    test('rejects undefined where null is required', () => {
      const w = wire();
      w.weather = undefined;
      expect(() => sceneDefFromJSON(w)).toThrow(/weather/);
    });

    test('rejects a non-integer priority', () => {
      expect(() => sceneDefFromJSON({ ...wire(), priority: 1.5 })).toThrow(/priority/);
    });

    test('rejects a non-string array member', () => {
      expect(() => sceneDefFromJSON({ ...wire(), items: ['ok', 3] })).toThrow(/items/);
    });

    test('rejects an invalid slug', () => {
      expect(() => sceneDefFromJSON({ ...wire(), slug: 'has space' })).toThrow(/slug/);
    });

    test('rejects a non-UUID location', () => {
      expect(() => sceneDefFromJSON({ ...wire(), location: 'central_plaza' })).toThrow(/location/);
    });
  });
});
