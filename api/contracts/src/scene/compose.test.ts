// api/contracts/src/scene/compose.test.ts
// SC-303b (m-57/58/59): the shared op-application engine. Order is the caller's;
// this file checks additive identity merge, exclusive replacement, cast_slot, provenance
// and immutability.

import { TRUE } from '../condition/expression.js';
import { applyOverlayOps, toComposedScene, type ComposedScene, type OverlayLayer } from './compose.js';
import { createSceneDef, type SceneDef } from './scene-def.js';
import type { SceneOverlayOp } from './scene-overlay.js';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const base = (): SceneDef =>
  createSceneDef({
    id: 'c3000000-0000-4000-8000-000000000003',
    slug: 'vq_airport_gate',
    title: 'Airport gate',
    description: 'A gate.',
    location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    weather: 'clear',
    items: ['ticket'],
    dialogue_refs: ['dialogue_vq_endings'],
    role_slots: [
      { slot_id: 'valentina', cast: 'valentina_quan', position: 'left' },
      { slot_id: 'bystander', cast: null, position: 'right' },
    ],
  });

const layer = (slug: string, ...ops: SceneOverlayOp[]): OverlayLayer => ({ slug, priority: 0, availability: TRUE, ops });

describe('toComposedScene', () => {
  test('every field starts with provenance "base"', () => {
    expect(toComposedScene(base()).provenance).toEqual({
      'dialogue_refs.dialogue_vq_endings': 'base',
      'items.ticket': 'base',
      'role_slots.bystander': 'base',
      'role_slots.bystander.cast': 'base',
      'role_slots.valentina': 'base',
      'role_slots.valentina.cast': 'base',
      time: 'base',
      weather: 'base',
    });
  });

  test('provenance keys are emitted sorted (stable JSON)', () => {
    const keys = Object.keys(toComposedScene(base()).provenance);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('applyOverlayOps', () => {
  const run = (...layers: OverlayLayer[]) => applyOverlayOps(deepFreeze(toComposedScene(base())), deepFreeze(layers));

  test('no layers → unchanged, no issues', () => {
    const { scene, issues } = run();
    expect(scene).toEqual(toComposedScene(base()));
    expect(issues).toEqual([]);
  });

  test('add_dialogue_refs appends new refs, dedupes by slug, keeps first provenance', () => {
    const { scene } = run(
      layer('a', { op: 'add_dialogue_refs', refs: ['dialogue_vq_endings', 'dialogue_new'] }),
      layer('b', { op: 'add_dialogue_refs', refs: ['dialogue_new', 'dialogue_b'] }),
    );
    expect(scene.dialogue_refs).toEqual(['dialogue_vq_endings', 'dialogue_new', 'dialogue_b']);
    expect(scene.provenance['dialogue_refs.dialogue_vq_endings']).toBe('base');
    expect(scene.provenance['dialogue_refs.dialogue_new']).toBe('a');
    expect(scene.provenance['dialogue_refs.dialogue_b']).toBe('b');
  });

  test('add_items appends by identity', () => {
    const { scene } = run(layer('a', { op: 'add_items', items: ['umbrella', 'ticket'] }));
    expect(scene.items).toEqual(['ticket', 'umbrella']);
    expect(scene.provenance['items.umbrella']).toBe('a');
  });

  test('add_role_slot adds a new slot with provenance', () => {
    const { scene, issues } = run(layer('a', { op: 'add_role_slot', slot: { slot_id: 'guard', cast: 'g', position: 'center' } }));
    expect(issues).toEqual([]);
    expect(scene.role_slots.map((s) => s.slot_id)).toEqual(['valentina', 'bystander', 'guard']);
    expect(scene.provenance['role_slots.guard']).toBe('a');
    expect(scene.provenance['role_slots.guard.cast']).toBe('a');
  });

  test('add_role_slot on an existing slot_id is an issue, not a throw, and changes nothing', () => {
    const { scene, issues } = run(layer('a', { op: 'add_role_slot', slot: { slot_id: 'valentina', cast: null, position: 'right' } }));
    expect(issues).toEqual([expect.objectContaining({ code: 'SCENE_SLOT_ALREADY_EXISTS', path: 'a.ops[0]', severity: 'error' })]);
    expect(scene.role_slots[0]).toEqual({ slot_id: 'valentina', cast: 'valentina_quan', position: 'left' });
  });

  test('cast_slot assigns cast on an existing slot; later wins', () => {
    const { scene } = run(
      layer('a', { op: 'cast_slot', slot_id: 'bystander', cast: 'marco' }),
      layer('b', { op: 'cast_slot', slot_id: 'bystander', cast: 'lucia' }),
    );
    expect(scene.role_slots[1]).toEqual({ slot_id: 'bystander', cast: 'lucia', position: 'right' });
    expect(scene.provenance['role_slots.bystander.cast']).toBe('b');
    expect(scene.provenance['role_slots.bystander']).toBe('base');
  });

  test('cast_slot on a slot added by an earlier layer works', () => {
    const { scene, issues } = run(
      layer('a', { op: 'add_role_slot', slot: { slot_id: 'guard', cast: null, position: 'center' } }),
      layer('b', { op: 'cast_slot', slot_id: 'guard', cast: 'g' }),
    );
    expect(issues).toEqual([]);
    expect(scene.role_slots[2].cast).toBe('g');
  });

  test('cast_slot on a missing slot is an issue, not a throw', () => {
    const { issues } = run(layer('a', { op: 'cast_slot', slot_id: 'ghost', cast: 'g' }));
    expect(issues).toEqual([expect.objectContaining({ code: 'SCENE_SLOT_MISSING', path: 'a.ops[0]', severity: 'error' })]);
  });

  test('set_weather / set_time replace; the last layer applied wins; null clears', () => {
    const { scene } = run(
      layer('a', { op: 'set_weather', weather: 'rain' }, { op: 'set_time', time: 'night' }),
      layer('b', { op: 'set_weather', weather: null }),
    );
    expect(scene.weather).toBeNull();
    expect(scene.time).toBe('night');
    expect(scene.provenance.weather).toBe('b');
    expect(scene.provenance.time).toBe('a');
  });

  test('never mutates its inputs (deep-frozen) and returns fresh arrays', () => {
    const start = deepFreeze(toComposedScene(base()));
    const { scene } = applyOverlayOps(start, deepFreeze([layer('a', { op: 'add_items', items: ['x'] })]));
    expect(scene).not.toBe(start);
    expect(scene.items).not.toBe(start.items);
    expect(start.items).toEqual(['ticket']);
  });

  test('result provenance keys stay sorted', () => {
    const { scene } = run(layer('a', { op: 'add_items', items: ['aaa'] }, { op: 'set_weather', weather: 'fog' }));
    const keys = Object.keys(scene.provenance);
    expect(keys).toEqual([...keys].sort());
  });

  test('type: ComposedScene keeps every SceneDef field', () => {
    const c: ComposedScene = toComposedScene(base());
    expect(c.slug).toBe('vq_airport_gate');
    expect(c.availability).toEqual(TRUE);
  });
});

describe('add_slot_lines (SC-307)', () => {
  const line = (slot_id: string, line_id: string, text: string) => ({ slot_id, line_id, text, when: {} });
  const baseWithLine = (): SceneDef =>
    createSceneDef({ ...base(), slot_lines: [line('valentina', 'hello', 'You came.')] });
  const run = (...layers: OverlayLayer[]) =>
    applyOverlayOps(deepFreeze(toComposedScene(baseWithLine())), deepFreeze(layers));

  test('base lines carry provenance "base"', () => {
    expect(toComposedScene(baseWithLine()).provenance['slot_lines.valentina.hello']).toBe('base');
  });

  test('appends new lines by identity with overlay provenance', () => {
    const { scene, issues } = run(layer('a', { op: 'add_slot_lines', lines: [line('bystander', 'gasp', 'Oh!')] }));
    expect(issues).toEqual([]);
    expect(scene.slot_lines.map((l) => `${l.slot_id}.${l.line_id}`)).toEqual(['valentina.hello', 'bystander.gasp']);
    expect(scene.provenance['slot_lines.bystander.gasp']).toBe('a');
  });

  test('an existing (slot_id, line_id) keeps its first text and provenance', () => {
    const { scene } = run(layer('a', { op: 'add_slot_lines', lines: [line('valentina', 'hello', 'overridden?')] }));
    expect(scene.slot_lines).toHaveLength(1);
    expect(scene.slot_lines[0].text).toBe('You came.');
    expect(scene.provenance['slot_lines.valentina.hello']).toBe('base');
  });

  test('a line for a missing slot is skipped with SCENE_SLOT_MISSING', () => {
    const { scene, issues } = run(layer('a', { op: 'add_slot_lines', lines: [line('ghost', 'boo', 'Boo')] }));
    expect(scene.slot_lines).toHaveLength(1);
    expect(issues).toEqual([expect.objectContaining({ code: 'SCENE_SLOT_MISSING', path: 'a.ops[0]' })]);
  });

  test('a slot added by an earlier layer can receive lines from a later one', () => {
    const { scene, issues } = run(
      layer('a', { op: 'add_role_slot', slot: { slot_id: 'guard', cast: null, position: 'center' } }),
      layer('b', { op: 'add_slot_lines', lines: [line('guard', 'halt', 'Halt.')] }),
    );
    expect(issues).toEqual([]);
    expect(scene.slot_lines.map((l) => l.line_id)).toContain('halt');
  });

  test('lines follow the slot, not the cast: recasting keeps them', () => {
    const { scene } = run(layer('a', { op: 'cast_slot', slot_id: 'valentina', cast: 'marco_reyes' }));
    expect(scene.slot_lines.map((l) => l.line_id)).toEqual(['hello']);
    expect(scene.role_slots.find((s) => s.slot_id === 'valentina')?.cast).toBe('marco_reyes');
  });
});
