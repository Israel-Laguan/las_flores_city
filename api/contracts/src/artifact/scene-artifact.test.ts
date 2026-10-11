// api/contracts/src/artifact/scene-artifact.test.ts
// SC-401/402: canonical bytes, stable hash, strict parse of the scene artifact payload.

import { TRUE, flag } from '../condition/expression.js';
import { toComposedScene } from '../scene/compose.js';
import { createSceneDef } from '../scene/scene-def.js';
import {
  InvalidSceneArtifactError,
  SCENE_ARTIFACT_SCHEMA_VERSION,
  sceneArtifactContentHash,
  sceneArtifactPayloadFromJSON,
  sceneArtifactPayloadToJSON,
  sha256Hex,
  stringifySceneArtifact,
  type SceneArtifactPayload,
} from './scene-artifact.js';

const def = createSceneDef({
  id: 'c3000000-0000-4000-8000-000000000003',
  slug: 'vq_airport_gate',
  title: 'Airport gate',
  description: 'A gate.',
  location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
  weather: null,
  items: ['ticket'],
  dialogue_refs: ['dialogue_vq_endings'],
  role_slots: [{ slot_id: 'valentina', cast: 'valentina_quan', position: 'left' }],
  slot_lines: [{ slot_id: 'valentina', line_id: 'hello', text: 'You came.', when: { time: ['night', 'day'] } }],
  availability: TRUE,
});

const payload = (): SceneArtifactPayload => ({
  district_weather: 'overcast',
  scene: {
    scene_slug: def.slug,
    base: toComposedScene(def),
    layers: [
      {
        slug: 'vq_rain',
        priority: 10,
        availability: flag('vq_pushed_away', true),
        ops: [{ op: 'set_weather', weather: 'rain' }],
      },
    ],
    flags: ['vq_pushed_away'],
    issues: [],
  },
});

const wire = (): Record<string, any> => JSON.parse(stringifySceneArtifact(payload()));

describe('canonical bytes and hash', () => {
  test('hash is lowercase hex sha256 of the bytes', () => {
    const hash = sceneArtifactContentHash(payload());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(sha256Hex(stringifySceneArtifact(payload())));
  });

  // Golden: changing this value means every stored artifact id changes. Do it on purpose.
  test('golden hash of the fixture payload is pinned', () => {
    expect(sceneArtifactContentHash(payload())).toBe('4ab856832c5b3a86a2d5fdaa38cc1a88825be6333fbc101a85199a87ff1eae1d');
  });

  test('bytes are deep key-sorted', () => {
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (typeof v === 'object' && v !== null) {
        const keys = Object.keys(v);
        expect(keys).toEqual([...keys].sort());
        Object.values(v).forEach(walk);
      }
    };
    walk(sceneArtifactPayloadToJSON(payload()));
  });

  test('authoring order of a `when` list does not change the hash', () => {
    const a = payload();
    const b = payload();
    b.scene.base.slot_lines[0].when.time = ['day', 'night'];
    expect(sceneArtifactContentHash(a)).toBe(sceneArtifactContentHash(b));
  });

  test('every content change changes the hash', () => {
    const h = sceneArtifactContentHash(payload());
    const weather = payload();
    weather.district_weather = 'clear';
    const layer = payload();
    layer.scene.layers[0].priority = 11;
    const text = payload();
    text.scene.base.title = 'Other';
    for (const changed of [weather, layer, text]) expect(sceneArtifactContentHash(changed)).not.toBe(h);
  });

  test('schema version is stamped', () => {
    expect(wire().schema_version).toBe(SCENE_ARTIFACT_SCHEMA_VERSION);
  });
});

describe('strict parse', () => {
  test('round-trips through JSON text with identical bytes', () => {
    const parsed = sceneArtifactPayloadFromJSON(wire());
    expect(stringifySceneArtifact(parsed)).toBe(stringifySceneArtifact(payload()));
    expect(sceneArtifactContentHash(parsed)).toBe(sceneArtifactContentHash(payload()));
  });

  test('shares no references with the input', () => {
    const raw = wire();
    const parsed = sceneArtifactPayloadFromJSON(raw);
    raw.scene.layers[0].ops[0].weather = 'fog';
    raw.scene.flags.push('x');
    expect(parsed.scene.layers[0].ops[0]).toEqual({ op: 'set_weather', weather: 'rain' });
    expect(parsed.scene.flags).toEqual(['vq_pushed_away']);
  });

  const BAD: Array<[string, (o: Record<string, any>) => void]> = [
    ['unknown top-level key', (o) => (o.extra = 1)],
    ['missing district_weather', (o) => delete o.district_weather],
    ['bad district_weather', (o) => (o.district_weather = 'hail')],
    ['wrong schema_version', (o) => (o.schema_version = 2)],
    ['missing scene', (o) => delete o.scene],
    ['scene_slug differs from base.slug', (o) => (o.scene.scene_slug = 'other')],
    ['base is a v1 scene', (o) => (o.scene.base.schema_version = 1)],
    ['provenance not strings', (o) => (o.scene.base.provenance.weather = 7)],
    ['layer with unknown key', (o) => (o.scene.layers[0].extra = 1)],
    ['layer with invalid op', (o) => (o.scene.layers[0].ops[0] = { op: 'jsonb_merge' })],
    ['layer with bad availability', (o) => (o.scene.layers[0].availability = { type: 'xor' })],
    ['flags disagree with layers', (o) => (o.scene.flags = ['other'])],
    ['flags not strings', (o) => (o.scene.flags = [1])],
    ['issue missing a field', (o) => o.scene.issues.push({ code: 'X' })],
    ['issue with error severity', (o) => o.scene.issues.push({ code: 'X', message: 'm', path: '', severity: 'error' })],
  ];

  test.each(BAD)('rejects %s', (_name, mutate) => {
    const raw = wire();
    mutate(raw);
    expect(() => sceneArtifactPayloadFromJSON(raw)).toThrow(InvalidSceneArtifactError);
  });

  test('reports every problem, not just the first', () => {
    const raw = wire();
    raw.district_weather = 'hail';
    raw.scene.flags = ['other'];
    raw.scene.layers[0].extra = 1;
    try {
      sceneArtifactPayloadFromJSON(raw);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as InvalidSceneArtifactError).problems.length).toBeGreaterThanOrEqual(2);
    }
  });

  test.each([null, 'x', 3, [], undefined])('does not crash on %p', (input) => {
    expect(() => sceneArtifactPayloadFromJSON(input)).toThrow(InvalidSceneArtifactError);
  });
});
