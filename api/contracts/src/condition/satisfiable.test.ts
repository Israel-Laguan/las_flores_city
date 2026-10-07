// api/contracts/src/condition/satisfiable.test.ts
// SC-304 (m-62): co-satisfiability of two conditions, incl. and/or/not nesting.

import { FALSE, TRUE, and, flag, not, or, type ConditionExpr } from './expression.js';
import { evaluate } from './evaluate.js';
import { MAX_SAT_VARS, coSatisfiable } from './satisfiable.js';

const A = flag('a', true);
const B = flag('b', true);
const C = flag('c', true);

describe('coSatisfiable (SC-304)', () => {
  test.each<[string, ConditionExpr, ConditionExpr, boolean]>([
    ['TRUE / TRUE', TRUE, TRUE, true],
    ['TRUE / FALSE', TRUE, FALSE, false],
    ['a / not a', A, not(A), false],
    ['a / a=false', A, flag('a', false), false],
    ['a / b (independent)', A, B, true],
    ['a&!b / b (refined SC-S13 fixture)', and([A, not(B)]), B, false],
    ['a|b / !a', or([A, B]), not(A), true],
    ['a|b / !a&!b', or([A, B]), and([not(A), not(B)]), false],
    ['not(a|b) / a', not(or([A, B])), A, false],
    ['(a&b)|c / !c&!a', or([and([A, B]), C]), and([not(C), not(A)]), false],
    ['(a&b)|c / !c&b', or([and([A, B]), C]), and([not(C), B]), true],
    ['empty and / empty or', and([]), or([]), false],
    ['not(not(a)) / a', not(not(A)), A, true],
  ])('%s → %p', (_name, a, b, expected) => {
    const res = coSatisfiable(a, b);
    expect(res.result).toBe(expected);
    expect(coSatisfiable(b, a).result).toBe(expected);
  });

  test('a witness makes both conditions true and lists only true flags, sorted', () => {
    const a = or([and([A, B]), C]);
    const b = and([not(C), B]);
    const res = coSatisfiable(a, b);
    if (res.result !== true) throw new Error('expected co-satisfiable');
    const set = new Set(res.witness);
    expect(evaluate(a, set) && evaluate(b, set)).toBe(true);
    expect(res.witness).toEqual(['a', 'b']);
  });

  test('witness is the first satisfying assignment (deterministic): TRUE/TRUE → []', () => {
    expect(coSatisfiable(TRUE, TRUE)).toEqual({ result: true, witness: [] });
    expect(coSatisfiable(A, B)).toEqual({ result: true, witness: ['a', 'b'] });
  });

  test('unsatisfiable has a null witness', () => {
    expect(coSatisfiable(A, not(A))).toEqual({ result: false, witness: null });
  });

  test(`more than ${MAX_SAT_VARS} variables → unknown (caller treats as co-satisfiable)`, () => {
    const many = and(Array.from({ length: MAX_SAT_VARS + 1 }, (_, i) => flag(`f${i}`, true)));
    expect(coSatisfiable(many, TRUE)).toEqual({ result: 'unknown', witness: null, vars: MAX_SAT_VARS + 1 });
    expect(coSatisfiable(A, B, { maxVars: 1 }).result).toBe('unknown');
  });

  test('exactly the cap is still decided', () => {
    const atCap = and(Array.from({ length: MAX_SAT_VARS }, (_, i) => flag(`f${i}`, true)));
    expect(coSatisfiable(atCap, not(atCap)).result).toBe(false);
  });
});
