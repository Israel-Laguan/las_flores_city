// api/runtime/src/resolve/scene.test.ts
// SC-312 (m-68): runtime consumer of a compiled ResolvedScene + player flag state.

import { describe, expect, test } from '@jest/globals';
import { createSceneDef, flag, toComposedScene, type ResolvedScene } from '@las-flores/api-contracts';
import { InMemoryFlagStateRepository } from '../flags.js';
import { resolvePlayerScene } from './scene.js';

const artifact: ResolvedScene = {
  scene_slug: 'vq_airport_gate',
  base: toComposedScene(
    createSceneDef({
      id: 'c3000000-0000-4000-8000-000000000003',
      slug: 'vq_airport_gate',
      title: 'Airport gate',
      description: 'A gate.',
      location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
      weather: 'clear',
    }),
  ),
  layers: [
    { slug: 'vq_pushed_away_rain', priority: 10, availability: flag('vq_pushed_away', true), ops: [{ op: 'set_weather', weather: 'rain' }] },
  ],
  flags: ['vq_pushed_away'],
  issues: [],
};

describe('resolvePlayerScene (SC-312 runtime consumer)', () => {
  test('resolves the same artifact differently per player flag state', async () => {
    const repo = new InMemoryFlagStateRepository();
    repo.setPlayerState('p_on', { updatedAt: '2026-01-01T00:00:00.000Z', flags: { vq_pushed_away: true } });
    repo.setPlayerState('p_off', { updatedAt: '2026-01-01T00:00:00.000Z', flags: { vq_pushed_away: false } });

    const on = await resolvePlayerScene(artifact, 'p_on', repo);
    const off = await resolvePlayerScene(artifact, 'p_off', repo);
    expect(on.scene.weather).toBe('rain');
    expect(on.active_layers).toEqual(['vq_pushed_away_rain']);
    expect(off.scene.weather).toBe('clear');
    expect(off.active_layers).toEqual([]);
  });

  test('a player with no state sees the base', async () => {
    const res = await resolvePlayerScene(artifact, 'nobody', new InMemoryFlagStateRepository());
    expect(res.scene.weather).toBe('clear');
  });
});
