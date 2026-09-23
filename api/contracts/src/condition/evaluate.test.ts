// api/contracts/src/condition/evaluate.test.ts
// Unit tests for the condition evaluator (SC-204)
// Tests cover each operator + nesting to 3 levels

import { describe, test, expect } from '@jest/globals';
import {
  evaluate,
  evaluateWithFlagObject,
  flagSetFromObject,
  flagObjectFromSet,
  TRUE,
  FALSE,
} from './evaluate.js';
import { flag, not, and, or } from './expression.js';
import type { ConditionExpr } from './expression.js';

describe('condition evaluator', () => {
  describe('evaluate with Set<string>', () => {
    test('TRUE always evaluates to true', () => {
      const flags = new Set<string>();
      expect(evaluate(TRUE, flags)).toBe(true);
    });

    test('FALSE always evaluates to false', () => {
      const flags = new Set<string>();
      expect(evaluate(FALSE, flags)).toBe(false);
    });

    test('flag condition: true when flag is set and expected=true', () => {
      const flags = new Set<string>(['has_key', 'unlocked_door']);
      const expr = flag('has_key', true);
      expect(evaluate(expr, flags)).toBe(true);
    });

    test('flag condition: false when flag is not set and expected=true', () => {
      const flags = new Set<string>(['unlocked_door']);
      const expr = flag('has_key', true);
      expect(evaluate(expr, flags)).toBe(false);
    });

    test('flag condition: true when flag is not set and expected=false', () => {
      const flags = new Set<string>(['unlocked_door']);
      const expr = flag('has_key', false);
      expect(evaluate(expr, flags)).toBe(true);
    });

    test('flag condition: false when flag is set and expected=false', () => {
      const flags = new Set<string>(['has_key']);
      const expr = flag('has_key', false);
      expect(evaluate(expr, flags)).toBe(false);
    });

    test('NOT true is false', () => {
      const flags = new Set<string>();
      const expr = not(TRUE);
      expect(evaluate(expr, flags)).toBe(false);
    });

    test('NOT false is true', () => {
      const flags = new Set<string>();
      const expr = not(FALSE);
      expect(evaluate(expr, flags)).toBe(true);
    });

    test('NOT flag condition negates correctly', () => {
      const flags = new Set<string>(['has_key']);
      const expr = not(flag('has_key', true));
      expect(evaluate(expr, flags)).toBe(false);
    });

    test('AND with all true returns true', () => {
      const flags = new Set<string>(['has_key', 'unlocked_door']);
      const expr = and([
        flag('has_key', true),
        flag('unlocked_door', true),
      ]);
      expect(evaluate(expr, flags)).toBe(true);
    });

    test('AND with one false returns false', () => {
      const flags = new Set<string>(['has_key']);
      const expr = and([
        flag('has_key', true),
        flag('unlocked_door', true),
      ]);
      expect(evaluate(expr, flags)).toBe(false);
    });

    test('AND with empty list returns true (identity)', () => {
      const flags = new Set<string>();
      const expr = and([]);
      expect(evaluate(expr, flags)).toBe(true);
    });

    test('AND with single expression returns that expression value', () => {
      const flags = new Set<string>(['has_key']);
      const expr = and([flag('has_key', true)]);
      expect(evaluate(expr, flags)).toBe(true);
    });

    test('OR with all false returns false', () => {
      const flags = new Set<string>();
      const expr = or([
        flag('has_key', true),
        flag('unlocked_door', true),
      ]);
      expect(evaluate(expr, flags)).toBe(false);
    });

    test('OR with one true returns true', () => {
      const flags = new Set<string>(['has_key']);
      const expr = or([
        flag('has_key', true),
        flag('unlocked_door', true),
      ]);
      expect(evaluate(expr, flags)).toBe(true);
    });

    test('OR with empty list returns false (identity)', () => {
      const flags = new Set<string>();
      const expr = or([]);
      expect(evaluate(expr, flags)).toBe(false);
    });

    test('OR with single expression returns that expression value', () => {
      const flags = new Set<string>(['has_key']);
      const expr = or([flag('has_key', true)]);
      expect(evaluate(expr, flags)).toBe(true);
    });
  });

  describe('nesting to 3 levels', () => {
    test('NOT AND NOT (De Morgan: NOT (A AND B) = NOT A OR NOT B)', () => {
      const flags = new Set<string>(['a']);
      // NOT (A AND NOT B) where A=true, B=false
      // = NOT (true AND true) = NOT true = false
      const expr = not(
        and([
          flag('a', true),
          not(flag('b', true)),
        ]),
      );
      expect(evaluate(expr, flags)).toBe(false);
    });

    test('AND OR AND with 3 levels', () => {
      const flags = new Set<string>(['a', 'b']);
      // (A OR B) AND C where A=true, B=false, C=true
      const expr = and([
        or([flag('a', true), flag('b', true)]),
        flag('c', true),
      ]);
      expect(evaluate(expr, flags)).toBe(false); // C is not in flags
    });

    test('complex 3-level expression', () => {
      const flags = new Set<string>(['x', 'y', 'z']);
      // NOT ((X AND Y) OR (NOT Z))
      // X AND Y = true AND true = true
      // NOT Z = NOT true = false
      // true OR false = true
      // NOT true = false
      const expr = not(
        or([
          and([flag('x', true), flag('y', true)]),
          not(flag('z', true)),
        ]),
      );
      expect(evaluate(expr, flags)).toBe(false);
    });

    test('deeply nested AND-OR-NOT', () => {
      const flags = new Set<string>(['a', 'c']);
      // AND(
      //   OR(A, B),
      //   NOT(C),
      //   TRUE
      // )
      // A=true, B=false -> OR=true
      // C=true -> NOT C=false
      // TRUE=true
      // true AND false AND true = false
      const expr = and([
        or([flag('a', true), flag('b', true)]),
        not(flag('c', true)),
        TRUE,
      ]);
      expect(evaluate(expr, flags)).toBe(false);
    });
  });

  describe('evaluateWithFlagObject', () => {
    test('evaluates with flag object instead of Set', () => {
      const flagState = { has_key: true, unlocked_door: false };
      const expr = flag('has_key', true);
      expect(evaluateWithFlagObject(expr, flagState)).toBe(true);
    });

    test('treats missing flags as false', () => {
      const flagState = { has_key: true };
      const expr = flag('missing_flag', true);
      expect(evaluateWithFlagObject(expr, flagState)).toBe(false);
    });

    test('treats missing flags as true when expected=false', () => {
      const flagState = { has_key: true };
      const expr = flag('missing_flag', false);
      expect(evaluateWithFlagObject(expr, flagState)).toBe(true);
    });
  });

  describe('helper functions', () => {
    test('flagSetFromObject converts object to Set', () => {
      const flagState = { a: true, b: false, c: true };
      const flagSet = flagSetFromObject(flagState);
      expect(flagSet.has('a')).toBe(true);
      expect(flagSet.has('b')).toBe(false);
      expect(flagSet.has('c')).toBe(true);
      expect(flagSet.size).toBe(2);
    });

    test('flagObjectFromSet converts Set to object', () => {
      const flagSet = new Set(['a', 'b']);
      const flagObject = flagObjectFromSet(flagSet);
      expect(flagObject).toEqual({ a: true, b: true });
    });

    test('flagObjectFromSet with empty Set', () => {
      const flagSet = new Set<string>();
      const flagObject = flagObjectFromSet(flagSet);
      expect(flagObject).toEqual({});
    });
  });

  describe('total function property', () => {
    // Verify that every valid ConditionExpr evaluates without throwing
    test('TRUE evaluates without throwing', () => {
      expect(() => evaluate(TRUE, new Set())).not.toThrow();
    });

    test('FALSE evaluates without throwing', () => {
      expect(() => evaluate(FALSE, new Set())).not.toThrow();
    });

    test('flag evaluates without throwing', () => {
      expect(() => evaluate(flag('x', true), new Set())).not.toThrow();
    });

    test('NOT evaluates without throwing', () => {
      expect(() => evaluate(not(TRUE), new Set())).not.toThrow();
    });

    test('AND evaluates without throwing', () => {
      expect(() => evaluate(and([]), new Set())).not.toThrow();
      expect(() => evaluate(and([TRUE, FALSE]), new Set())).not.toThrow();
    });

    test('OR evaluates without throwing', () => {
      expect(() => evaluate(or([]), new Set())).not.toThrow();
      expect(() => evaluate(or([TRUE, FALSE]), new Set())).not.toThrow();
    });

    test('complex nested expression evaluates without throwing', () => {
      const expr: ConditionExpr = and([
        or([flag('a', true), not(flag('b', false))]),
        not(and([TRUE, FALSE])),
      ]);
      expect(() => evaluate(expr, new Set())).not.toThrow();
    });
  });
});
