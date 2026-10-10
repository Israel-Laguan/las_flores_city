import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { oltpPool } from '@las-flores/infra';
import { createPersonalityPool, createSceneDef, createSceneOverlay, type LineCandidate } from '@las-flores/api-contracts';
import { composeScene, resolveCharacterLine, resolveSlotLine } from '@las-flores/api-planning';
import { PgSceneDefRepository } from '../../src/planning/PgSceneDefRepository.js';
import { PgSceneOverlayRepository } from '../../src/planning/PgSceneOverlayRepository.js';
import { PgCharacterPoolRepository, PgPersonalityPoolRepository } from '../../src/planning/PgPersonalityPoolRepository.js';

// SC-306/307/308 — SC-M2 exit criterion 4 at PLANNING level, end to end on Postgres:
// "a personality pool shared by two characters resolves correctly for both".
// Runtime serving of the same ladder from compiled artifacts is SC-M3's first task; nothing
// here claims that.
//
// Flow: pool + links + scene (with slot lines) + overlay stored through the Pg adapters, read
// back, composed, then resolved through the ladder for both characters.
//
// Collision avoidance: every slug starts with `sc306e2e`, which no other suite uses; rows are
// removed in afterAll (overlays, links, then pools and scenes — FKs). No legacy rows are needed:
// `character_slug` is a plain slug with no foreign key.

const PREFIX = 'sc306e2e';
const ANA = `${PREFIX}_ana`;
const BO = `${PREFIX}_bo`;
const POOL = `${PREFIX}_vendor`;
const SCENE = `${PREFIX}_market`;

const pools = new PgPersonalityPoolRepository();
const links = new PgCharacterPoolRepository();
const scenes = new PgSceneDefRepository();
const overlays = new PgSceneOverlayRepository();

async function cleanup(): Promise<void> {
  await oltpPool.query('DELETE FROM planning.scene_overlays WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query('DELETE FROM planning.scene_defs WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query('DELETE FROM planning.character_pools WHERE pool_slug LIKE $1', [`${PREFIX}\\_%`]);
  await oltpPool.query('DELETE FROM planning.personality_pools WHERE slug LIKE $1', [`${PREFIX}\\_%`]);
}

describe('SC-306/308 shared personality pool, resolved for both characters (Postgres, planning level)', () => {
  beforeAll(async () => {
    await cleanup();
    await pools.create(
      createPersonalityPool({
        slug: POOL,
        lines: [
          { line_id: 'a_hello', text: 'Fresh today!', when: {} },
          { line_id: 'b_rain', text: 'Wet day, hot soup.', when: { weather: ['rain'] } },
          { line_id: 'c_rain_night', text: 'Rain at night? Stay and eat.', when: { weather: ['rain'], time: ['night'] } },
        ],
      }),
    );
    await links.link(ANA, POOL);
    await links.link(BO, POOL);
    await scenes.create(
      createSceneDef({
        id: 'e9906000-0000-4000-8000-0000000000b1',
        slug: SCENE,
        title: 'Market',
        description: 'e2e',
        location: 'e9906000-0000-4000-8000-0000000000a1',
        role_slots: [
          { slot_id: 'stall', cast: ANA, position: 'left' },
          { slot_id: 'passerby', cast: BO, position: 'right' },
        ],
        slot_lines: [{ slot_id: 'stall', line_id: 'special', text: 'Today only: the special!', when: { time: ['day'] } }],
      }),
    );
  }, 30_000);

  afterAll(cleanup);

  const composedBase = async (extra: Parameters<typeof createSceneOverlay>[0][] = []) => {
    const scene = (await scenes.get(SCENE))!.scene;
    const ov = await Promise.all(extra.map(async (o) => (await overlays.create(createSceneOverlay(o))).overlay));
    return composeScene(scene, ov).scene.base;
  };

  test('both characters read the SAME stored pool and resolve the same best line for the same context', async () => {
    expect((await links.poolsFor(ANA)).map((r) => r.slug)).toEqual([POOL]);
    expect((await links.poolsFor(BO)).map((r) => r.slug)).toEqual([POOL]);
    expect(await links.charactersFor(POOL)).toEqual([ANA, BO]);
    const ctx = { weather: 'rain', time: 'night' } as const;
    const a = await resolveCharacterLine(links, { characterSlug: ANA, ctx });
    const b = await resolveCharacterLine(links, { characterSlug: BO, ctx });
    expect(a).toMatchObject({ rung: 'personality', line_id: 'c_rain_night', source: POOL });
    expect(b).toEqual(a);
    expect((await resolveCharacterLine(links, { characterSlug: ANA, ctx: { weather: 'clear', time: 'day' } }))!.line_id).toBe('a_hello');
    expect((await resolveCharacterLine(links, { characterSlug: BO, ctx: { weather: 'rain', time: 'day' } }))!.line_id).toBe('b_rain');
  });

  test('the slot line (stored on the scene) overrides the pool for the character cast in the slot only', async () => {
    const base = await composedBase();
    const ctx = { time: 'day', weather: 'rain' } as const;
    expect(await resolveSlotLine(links, base, 'stall', ctx)).toMatchObject({ characterSlug: ANA, line: { rung: 'scene', line_id: 'special' } });
    expect(await resolveSlotLine(links, base, 'passerby', ctx)).toMatchObject({ characterSlug: BO, line: { rung: 'personality', line_id: 'b_rain' } });
  });

  test('recasting through a stored overlay moves the slot line to the new speaker', async () => {
    const base = await composedBase([{ slug: `${PREFIX}_swap`, base_scene_slug: SCENE, ops: [{ op: 'cast_slot', slot_id: 'stall', cast: BO }] }]);
    expect(await resolveSlotLine(links, base, 'stall', { time: 'day' })).toMatchObject({ characterSlug: BO, line: { rung: 'scene', line_id: 'special' } });
  });

  test('a caller-supplied relationship line beats the pool for that character only; retiring the pool silences both', async () => {
    const relationship: Array<Omit<LineCandidate, 'rung'>> = [{ line_id: 'old_friend', text: 'My friend!', when: {}, source: 'history' }];
    const ctx = { weather: 'rain', time: 'night' } as const;
    expect(await resolveCharacterLine(links, { characterSlug: BO, ctx, relationship })).toMatchObject({ rung: 'relationship' });
    expect(await resolveCharacterLine(links, { characterSlug: ANA, ctx })).toMatchObject({ rung: 'personality' });
    await pools.retire(POOL);
    expect(await resolveCharacterLine(links, { characterSlug: ANA, ctx })).toBeUndefined();
    expect(await resolveCharacterLine(links, { characterSlug: BO, ctx })).toBeUndefined();
  });
});
