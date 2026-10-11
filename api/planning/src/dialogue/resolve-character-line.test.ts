// api/planning/src/dialogue/resolve-character-line.test.ts
// SC-306/307/308 — SC-M2 exit criterion 4 at planning level: a pool shared by two characters
// resolves correctly for both, scene lines follow the slot, and the ladder picks the right rung.

import {
  createPersonalityPool,
  createSceneDef,
  createSceneOverlay,
  flag,
  type LineCandidate,
  type SceneDef,
} from '@las-flores/api-contracts';
import { InMemoryCharacterPoolRepository, InMemoryPersonalityPoolRepository } from '../canon/personality-pool-repository.js';
import { composeScene } from '../scene/compose-scene.js';
import { resolveCharacterLine, resolveSlotLine } from './resolve-character-line.js';

const VENDOR = createPersonalityPool({
  slug: 'street_vendor',
  lines: [
    { line_id: 'a_hello', text: 'Fresh today!', when: {} },
    { line_id: 'b_rain', text: 'Wet day, hot soup.', when: { weather: ['rain'] } },
    { line_id: 'c_rain_night', text: 'Rain at night? Stay and eat.', when: { weather: ['rain'], time: ['night'] } },
  ],
});

async function setup() {
  const pools = new InMemoryPersonalityPoolRepository();
  const links = new InMemoryCharacterPoolRepository(pools);
  await pools.create(VENDOR);
  await links.link('ana_vendor', 'street_vendor');
  await links.link('bo_vendor', 'street_vendor');
  return { pools, links };
}

const scene = (over: Partial<SceneDef> = {}): SceneDef =>
  createSceneDef({
    id: 'c3000000-0000-4000-8000-000000000003',
    slug: 'market',
    title: 'Market',
    description: 'd',
    location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    role_slots: [
      { slot_id: 'stall', cast: 'ana_vendor', position: 'left' },
      { slot_id: 'passerby', cast: 'bo_vendor', position: 'right' },
    ],
    slot_lines: [{ slot_id: 'stall', line_id: 'special', text: 'Today only: the special!', when: { time: ['day'] } }],
    ...over,
  });

describe('a pool shared by two characters resolves correctly for BOTH (exit criterion 4, planning level)', () => {
  test('same context -> both get the same best line from the shared pool', async () => {
    const { links } = await setup();
    const ctx = { weather: 'rain', time: 'night' } as const;
    const a = await resolveCharacterLine(links, { characterSlug: 'ana_vendor', ctx });
    const b = await resolveCharacterLine(links, { characterSlug: 'bo_vendor', ctx });
    expect(a).toMatchObject({ rung: 'personality', line_id: 'c_rain_night', source: 'street_vendor' });
    expect(b).toEqual(a);
  });

  test('context changes the line for both: rain picks the rain line, clear weather the generic one', async () => {
    const { links } = await setup();
    for (const who of ['ana_vendor', 'bo_vendor']) {
      expect((await resolveCharacterLine(links, { characterSlug: who, ctx: { weather: 'rain', time: 'day' } }))!.line_id).toBe('b_rain');
      expect((await resolveCharacterLine(links, { characterSlug: who, ctx: { weather: 'clear', time: 'day' } }))!.line_id).toBe('a_hello');
    }
  });

  test('editing the pool changes the result for both; no per-character copy exists', async () => {
    const { pools, links } = await setup();
    await pools.upsertIfChanged(createPersonalityPool({ slug: 'street_vendor', lines: [{ line_id: 'a_hello', text: 'Changed!', when: {} }] }));
    for (const who of ['ana_vendor', 'bo_vendor']) {
      expect((await resolveCharacterLine(links, { characterSlug: who, ctx: {} }))!.text).toBe('Changed!');
    }
  });

  test('a character with no pool and nothing else has no line; retiring the pool silences both', async () => {
    const { pools, links } = await setup();
    expect(await resolveCharacterLine(links, { characterSlug: 'stranger', ctx: {} })).toBeUndefined();
    await pools.retire('street_vendor');
    for (const who of ['ana_vendor', 'bo_vendor']) expect(await resolveCharacterLine(links, { characterSlug: who, ctx: {} })).toBeUndefined();
  });

  test('a character in two pools draws from both; the more specific line wins across pools', async () => {
    const { pools, links } = await setup();
    await pools.create(createPersonalityPool({ slug: 'grump', lines: [{ line_id: 'g_rain_night', text: 'Ugh. Rain.', when: { weather: ['rain'], time: ['night'] } }, { line_id: 'z_any', text: 'Hmph.', when: {} }] }));
    await links.link('ana_vendor', 'grump');
    const ctx = { weather: 'rain', time: 'night' } as const;
    // Both pools offer a 2-constraint line; line_id ascending breaks the tie: c_rain_night < g_rain_night.
    expect((await resolveCharacterLine(links, { characterSlug: 'ana_vendor', ctx }))!.line_id).toBe('c_rain_night');
    // The other character is unaffected by ana's second pool.
    expect((await resolveCharacterLine(links, { characterSlug: 'bo_vendor', ctx: { weather: 'clear' } }))!.line_id).toBe('a_hello');
    expect(await links.charactersFor('grump')).toEqual(['ana_vendor']);
    expect(await links.charactersFor('street_vendor')).toEqual(['ana_vendor', 'bo_vendor']);
  });
});

describe('the ladder across rungs (SC-308)', () => {
  test('a scene slot line overrides the pool for whoever is cast in the slot, and ONLY for them', async () => {
    const { links } = await setup();
    const s = composeScene(scene(), []).scene.base;
    const ctx = { time: 'day', weather: 'rain' } as const; // pool would say b_rain; slot line also applies (day)
    const ana = await resolveSlotLine(links, s, 'stall', ctx);
    expect(ana).toMatchObject({ characterSlug: 'ana_vendor', line: { rung: 'scene', line_id: 'special', source: 'stall' } });
    // bo is cast in a slot with no lines: personality rung only.
    const bo = await resolveSlotLine(links, s, 'passerby', ctx);
    expect(bo).toMatchObject({ characterSlug: 'bo_vendor', line: { rung: 'personality', line_id: 'b_rain' } });
  });

  test('the slot line is ineligible outside its context, so the pool speaks', async () => {
    const { links } = await setup();
    const s = composeScene(scene(), []).scene.base;
    const night = await resolveSlotLine(links, s, 'stall', { time: 'night', weather: 'clear' });
    expect(night!.line).toMatchObject({ rung: 'personality', line_id: 'a_hello' });
  });

  test('LINES FOLLOW THE SLOT: recasting through an overlay moves the scene line to the new speaker', async () => {
    const { links } = await setup();
    const recast = createSceneOverlay({ slug: 'market_swap', base_scene_slug: 'market', ops: [{ op: 'cast_slot', slot_id: 'stall', cast: 'bo_vendor' }] });
    const composed = composeScene(scene(), [recast]).scene.base;
    const result = await resolveSlotLine(links, composed, 'stall', { time: 'day' });
    expect(result).toMatchObject({ characterSlug: 'bo_vendor', line: { rung: 'scene', line_id: 'special' } });
    // ana no longer speaks from the stall.
    expect(composed.role_slots.find((x) => x.slot_id === 'stall')!.cast).toBe('bo_vendor');
  });

  test('an overlay can ADD slot lines (add_slot_lines) and they take part in the ladder', async () => {
    const { links } = await setup();
    const add = createSceneOverlay({
      slug: 'market_rain',
      base_scene_slug: 'market',
      availability: flag('raining', true),
      ops: [{ op: 'add_slot_lines', lines: [{ slot_id: 'passerby', line_id: 'umbrella', text: 'Anyone have an umbrella?', when: { weather: ['rain'] } }] }],
    });
    const { scene: resolved } = composeScene(scene(), [add]);
    expect(resolved.layers).toHaveLength(1); // flag-gated: kept as a layer, applied per player at runtime
    const { resolveSceneForPlayer } = await import('@las-flores/api-contracts');
    const off = resolveSceneForPlayer(resolved, new Set());
    const on = resolveSceneForPlayer(resolved, new Set(['raining']));
    expect((await resolveSlotLine(links, off.scene, 'passerby', { weather: 'rain' }))!.line.rung).toBe('personality');
    expect((await resolveSlotLine(links, on.scene, 'passerby', { weather: 'rain' }))!.line).toMatchObject({ rung: 'scene', line_id: 'umbrella' });
  });

  test('a relationship line supplied for ONE character overrides the pool for that character only', async () => {
    const { links } = await setup();
    const relationship = [{ line_id: 'old_friend', text: 'My friend! Back again.', when: {}, source: 'ana_history' }];
    const ctx = { weather: 'rain', time: 'night' } as const;
    expect(await resolveCharacterLine(links, { characterSlug: 'bo_vendor', ctx, relationship })).toMatchObject({ rung: 'relationship', line_id: 'old_friend' });
    expect(await resolveCharacterLine(links, { characterSlug: 'ana_vendor', ctx })).toMatchObject({ rung: 'personality' });
  });

  test('scene beats relationship beats personality in one resolution', async () => {
    const { links } = await setup();
    const s = composeScene(scene(), []).scene.base;
    const relationship: Array<Omit<LineCandidate, 'rung'>> = [{ line_id: 'rel', text: 'rel', when: { time: ['day'], weather: ['rain'] }, source: 'h' }];
    const ctx = { time: 'day', weather: 'rain' } as const;
    expect((await resolveCharacterLine(links, { characterSlug: 'ana_vendor', ctx, scene: s, slotId: 'stall', relationship }))!.rung).toBe('scene');
    expect((await resolveCharacterLine(links, { characterSlug: 'ana_vendor', ctx, relationship }))!.rung).toBe('relationship');
  });

  test('an open slot has no speaker; an unknown slot has none either', async () => {
    const { links } = await setup();
    const s = composeScene(scene({ role_slots: [{ slot_id: 'stall', cast: null, position: 'left' }] }), []).scene.base;
    expect(await resolveSlotLine(links, s, 'stall', {})).toBeUndefined();
    expect(await resolveSlotLine(links, s, 'nope', {})).toBeUndefined();
  });

  test('scene and slotId must be given together', async () => {
    const { links } = await setup();
    await expect(resolveCharacterLine(links, { characterSlug: 'ana_vendor', ctx: {}, slotId: 'stall' })).rejects.toThrow(/together/);
  });

  test('the result is stable across repeated calls (no randomness)', async () => {
    const { links } = await setup();
    const first = await resolveCharacterLine(links, { characterSlug: 'ana_vendor', ctx: { weather: 'rain' } });
    for (let i = 0; i < 25; i++) expect(await resolveCharacterLine(links, { characterSlug: 'ana_vendor', ctx: { weather: 'rain' } })).toEqual(first);
  });
});
