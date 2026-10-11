// api/contracts/src/dialogue/resolve-line.test.ts
// SC-308: the specificity ladder — eligibility, rung order, specificity, tie-breaks,
// determinism and order-independence.

import { createPersonalityPool } from './personality-pool.js';
import { lineApplies, poolLineCandidates, resolveLine, slotLineCandidates, type LineCandidate } from './resolve-line.js';
import type { LineWhen } from '../scene/line.js';

const c = (rung: LineCandidate['rung'], line_id: string, when: LineWhen = {}, source = 'src', text = `${rung}:${line_id}`): LineCandidate => ({ rung, line_id, text, when, source });

const permutations = <T>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

describe('lineApplies (eligibility)', () => {
  test('an unconstrained line always applies, even with an unknown context', () => {
    expect(lineApplies({}, {})).toBe(true);
    expect(lineApplies({}, { time: null, weather: null })).toBe(true);
  });
  test('a constrained dimension needs a KNOWN, listed value', () => {
    expect(lineApplies({ weather: ['rain'] }, { weather: 'rain' })).toBe(true);
    expect(lineApplies({ weather: ['rain'] }, { weather: 'fog' })).toBe(false);
    expect(lineApplies({ weather: ['rain'] }, {})).toBe(false);
    expect(lineApplies({ weather: ['rain'] }, { weather: null })).toBe(false);
  });
  test('every constrained dimension must hold (AND across dimensions, OR within a list)', () => {
    const when: LineWhen = { time: ['night', 'sunset'], weather: ['rain'] };
    expect(lineApplies(when, { time: 'sunset', weather: 'rain' })).toBe(true);
    expect(lineApplies(when, { time: 'day', weather: 'rain' })).toBe(false);
    expect(lineApplies(when, { time: 'night', weather: 'fog' })).toBe(false);
  });
});

describe('resolveLine', () => {
  test('no candidates, or none applicable -> undefined', () => {
    expect(resolveLine({}, [])).toBeUndefined();
    expect(resolveLine({ weather: 'fog' }, [c('personality', 'r', { weather: ['rain'] })])).toBeUndefined();
  });

  test('scene beats relationship beats personality, regardless of specificity', () => {
    const personality = c('personality', 'a', { time: ['night'], weather: ['rain'] }); // most specific
    const relationship = c('relationship', 'b');
    const scene = c('scene', 'z'); // least specific, last by id
    const ctx = { time: 'night', weather: 'rain' } as const;
    expect(resolveLine(ctx, [personality, relationship, scene])!.rung).toBe('scene');
    expect(resolveLine(ctx, [personality, relationship])!.rung).toBe('relationship');
    expect(resolveLine(ctx, [personality])!.rung).toBe('personality');
  });

  test('a higher rung that does NOT apply falls through to the next rung', () => {
    const sceneRainOnly = c('scene', 's', { weather: ['rain'] });
    const personality = c('personality', 'p');
    expect(resolveLine({ weather: 'clear' }, [sceneRainOnly, personality])!.rung).toBe('personality');
  });

  test('within a rung the more constrained line wins', () => {
    const generic = c('personality', 'a_generic');
    const rain = c('personality', 'b_rain', { weather: ['rain'] });
    const rainNight = c('personality', 'c_rain_night', { weather: ['rain'], time: ['night'] });
    expect(resolveLine({ weather: 'rain', time: 'night' }, [generic, rain, rainNight])!.line_id).toBe('c_rain_night');
    expect(resolveLine({ weather: 'rain', time: 'day' }, [generic, rain, rainNight])!.line_id).toBe('b_rain');
    expect(resolveLine({ weather: 'clear', time: 'day' }, [generic, rain, rainNight])!.line_id).toBe('a_generic');
  });

  test('ties break by line_id ascending, then by source ascending', () => {
    expect(resolveLine({}, [c('personality', 'm'), c('personality', 'b'), c('personality', 'x')])!.line_id).toBe('b');
    const a = c('personality', 'same', {}, 'pool_a');
    const b = c('personality', 'same', {}, 'pool_b');
    expect(resolveLine({}, [b, a])!.source).toBe('pool_a');
  });

  test('ORDER-INDEPENDENT: every permutation of the candidates gives the same winner', () => {
    const candidates = [
      c('personality', 'p1', { weather: ['rain'] }, 'pool_a'),
      c('personality', 'p1', { weather: ['rain'] }, 'pool_b'),
      c('relationship', 'r1'),
      c('scene', 's2', { time: ['night'] }, 'host'),
      c('scene', 's1', { time: ['night'] }, 'host'),
      c('scene', 's0', { weather: ['fog'] }, 'host'),
    ];
    const ctx = { time: 'night', weather: 'rain' } as const;
    const expected = resolveLine(ctx, candidates);
    expect(expected).toMatchObject({ rung: 'scene', line_id: 's1' });
    for (const p of permutations(candidates.slice(0, 5))) {
      expect(resolveLine(ctx, [...p, candidates[5]])).toEqual(expected);
    }
  });

  test('deterministic across repeated calls and does not mutate its input', () => {
    const input = Object.freeze([Object.freeze(c('personality', 'b')), Object.freeze(c('personality', 'a'))]);
    const first = resolveLine({}, input);
    for (let i = 0; i < 50; i++) expect(resolveLine({}, input)).toBe(first);
    expect(input.map((x) => x.line_id)).toEqual(['b', 'a']);
  });
});

describe('candidate builders', () => {
  test('slotLineCandidates picks only that slot, tagged scene, sourced by the slot id', () => {
    const scene = {
      slot_lines: [
        { slot_id: 'host', line_id: 'hi', text: 'Hi.', when: {} },
        { slot_id: 'guard', line_id: 'halt', text: 'Halt.', when: {} },
      ],
    };
    expect(slotLineCandidates(scene, 'host')).toEqual([{ rung: 'scene', line_id: 'hi', text: 'Hi.', when: {}, source: 'host' }]);
    expect(slotLineCandidates(scene, 'nobody')).toEqual([]);
  });

  test('poolLineCandidates flattens every pool, tagged personality, sourced by the pool slug', () => {
    const a = createPersonalityPool({ slug: 'pool_a', lines: [{ line_id: 'x', text: 'X', when: {} }] });
    const b = createPersonalityPool({ slug: 'pool_b', lines: [{ line_id: 'x', text: 'Y', when: { time: ['day'] } }] });
    const got = poolLineCandidates([a, b]);
    expect(got.map((g) => [g.rung, g.source, g.line_id])).toEqual([
      ['personality', 'pool_a', 'x'],
      ['personality', 'pool_b', 'x'],
    ]);
  });
});
