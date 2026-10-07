// api/contracts/src/scene/select.test.ts
// SC-312 (m-66): runtime layer selection over a compiled ResolvedScene.

import { TRUE, and, flag, not } from '../condition/expression.js';
import { toComposedScene, type ConditionalLayer, type ResolvedScene } from './compose.js';
import { createSceneDef } from './scene-def.js';
import { resolveSceneForPlayer, selectActiveOverlays } from './select.js';

const layer = (slug: string, priority: number, availability: ConditionalLayer['availability'], ops: ConditionalLayer['ops']): ConditionalLayer => ({
  slug,
  priority,
  availability,
  ops,
});

const LAYERS: ConditionalLayer[] = [
  layer('a_dusk', 10, and([flag('gave_space', true), not(flag('pushed_away', true))]), [{ op: 'set_weather', weather: 'overcast' }]),
  layer('b_rain', 10, flag('pushed_away', true), [
    { op: 'set_weather', weather: 'rain' },
    { op: 'cast_slot', slot_id: 'bystander', cast: 'marco' },
  ]),
  layer('c_static', 20, TRUE, [{ op: 'add_items', items: ['flyer'] }]),
];

const resolved = (): ResolvedScene => ({
  scene_slug: 'gate',
  base: toComposedScene(
    createSceneDef({
      id: 'c3000000-0000-4000-8000-000000000003',
      slug: 'gate',
      title: 't',
      description: 'd',
      location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
      role_slots: [{ slot_id: 'bystander', cast: null, position: 'right' }],
    }),
  ),
  layers: LAYERS,
  flags: ['gave_space', 'pushed_away'],
  issues: [],
});

describe('selectActiveOverlays (SC-312)', () => {
  test('keeps layers whose availability holds, in stored order', () => {
    expect(selectActiveOverlays(LAYERS, new Set()).map((l) => l.slug)).toEqual(['c_static']);
    expect(selectActiveOverlays(LAYERS, new Set(['gave_space'])).map((l) => l.slug)).toEqual(['a_dusk', 'c_static']);
    expect(selectActiveOverlays(LAYERS, new Set(['gave_space', 'pushed_away'])).map((l) => l.slug)).toEqual(['b_rain', 'c_static']);
  });

  test('does not re-sort: stored order is authoritative', () => {
    const reversed = [...LAYERS].reverse();
    expect(selectActiveOverlays(reversed, new Set(['pushed_away'])).map((l) => l.slug)).toEqual(['c_static', 'b_rain']);
  });
});

describe('resolveSceneForPlayer (SC-312)', () => {
  test('applies active layers onto the folded base, reporting the selected slugs', () => {
    const res = resolveSceneForPlayer(resolved(), new Set(['pushed_away']));
    expect(res.active_layers).toEqual(['b_rain', 'c_static']);
    expect(res.scene.weather).toBe('rain');
    expect(res.scene.role_slots[0].cast).toBe('marco');
    expect(res.scene.items).toEqual(['flyer']);
    expect(res.scene.provenance.weather).toBe('b_rain');
    expect(res.issues).toEqual([]);
  });

  test('no active flagged layer → base plus static layers', () => {
    const res = resolveSceneForPlayer(resolved(), new Set());
    expect(res.scene.weather).toBeNull();
    expect(res.scene.provenance.weather).toBe('base');
  });

  test('does not mutate the artifact', () => {
    const artifact = resolved();
    const before = JSON.stringify(artifact);
    resolveSceneForPlayer(artifact, new Set(['pushed_away', 'gave_space']));
    expect(JSON.stringify(artifact)).toBe(before);
  });
});
