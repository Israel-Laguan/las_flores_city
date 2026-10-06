// api/contracts/src/condition/condition.property.test.ts
// SC-204 property tests: the evaluator is total and the JSON form round-trips.
// Seeded so CI is deterministic; 300 runs per property (>= 200 required by BF-304).

import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import { evaluate } from './evaluate.js';
import { and, equals, flag, fromJSON, not, or, toJSON, TRUE, FALSE } from './expression.js';
import type { ConditionExpr } from './expression.js';

const PARAMS = { seed: 20260720, numRuns: 300 };

const slugArb = fc.constantFrom('a', 'b', 'c', 'trust_high', '_hidden', 'constructor', '__proto__');

const exprArb: fc.Arbitrary<ConditionExpr> = fc.letrec<{ expr: ConditionExpr }>((tie) => ({
  expr: fc.oneof(
    { depthSize: 'small', maxDepth: 4 },
    fc.constant(TRUE),
    fc.constant(FALSE),
    fc.record({ slug: slugArb, expected: fc.boolean() }).map(({ slug, expected }) => flag(slug, expected)),
    tie('expr').map((e) => not(e)),
    fc.array(tie('expr'), { maxLength: 4 }).map((es) => and(es)),
    fc.array(tie('expr'), { maxLength: 4 }).map((es) => or(es)),
  ),
})).expr;

const flagSetArb = fc.uniqueArray(slugArb).map((slugs) => new Set(slugs));

describe('condition properties', () => {
  test('evaluate is total: always returns a boolean and never throws', () => {
    fc.assert(
      fc.property(exprArb, flagSetArb, (expr, flags) => {
        expect(typeof evaluate(expr, flags)).toBe('boolean');
      }),
      PARAMS,
    );
  });

  test('fromJSON(toJSON(x)) round-trips, including through JSON text', () => {
    fc.assert(
      fc.property(exprArb, (expr) => {
        expect(equals(fromJSON(toJSON(expr)), expr)).toBe(true);
        expect(equals(fromJSON(JSON.parse(JSON.stringify(toJSON(expr)))), expr)).toBe(true);
      }),
      PARAMS,
    );
  });

  test('not is an involution on evaluation', () => {
    fc.assert(
      fc.property(exprArb, flagSetArb, (expr, flags) => {
        expect(evaluate(not(not(expr)), flags)).toBe(evaluate(expr, flags));
      }),
      PARAMS,
    );
  });
});
