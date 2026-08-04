import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { choicePassesFilters } from '@las-flores/shared';
import { ADEYEMI_ENDINGS, type EndingName } from '../fixtures/adeyemi_endings.js';

// ============================================================
// Property-Based Tests for Adeyemi Endings
//
// Validates that every ending defined in the relationship blueprint
// has:
//   (a) A reachable stats vector (satisfies required_stats)
//   (b) An excludable stats vector (does NOT satisfy required_stats)
//
// This catches dead endings (no vector can reach them) and
// trivial endings (every vector reaches them).
// ============================================================

// Helper to check if a stats vector satisfies an ending's required_stats
function satisfiesEnding(endings: typeof ADEYEMI_ENDINGS, endingName: EndingName, stats: Record<string, number>): boolean {
  const ending = endings[endingName];
  return choicePassesFilters({ required_stats: ending.required_stats }, { 
    flags: {},
    state: {},
    stats,
    timeBlocks: 100
  });
}

// Helper to check if a stats vector does NOT satisfy an ending's required_stats
function doesNotSatisfyEnding(endings: typeof ADEYEMI_ENDINGS, endingName: EndingName, stats: Record<string, number>): boolean {
  return !satisfiesEnding(endings, endingName, stats);
}

// Independent oracle: evaluates every required_stats constraint WITHOUT
// reusing choicePassesFilters (the function exercised by satisfiesEnding).
// If satisfiesEnding ever returns the wrong boolean for a generated vector,
// this oracle catches it. Parses each "op:number" constraint directly and
// applies the comparison with a hand-rolled switch (no shared evaluator).
function expectedSatisfies(requiredStats: Record<string, string>, stats: Record<string, number>): boolean {
  for (const [stat, constraint] of Object.entries(requiredStats)) {
    const match = /^(gt|lt|gte|lte|eq|ne):(-?\d+)$/.exec(constraint);
    if (!match) return false; // fail closed on malformed constraints
    const op = match[1];
    const n = parseInt(match[2], 10);
    const actual = stats[stat];
    if (actual === undefined) return false; // missing stat fails closed
    let ok: boolean;
    switch (op) {
      case 'gt': ok = actual > n; break;
      case 'lt': ok = actual < n; break;
      case 'gte': ok = actual >= n; break;
      case 'lte': ok = actual <= n; break;
      case 'eq': ok = actual === n; break;
      case 'ne': ok = actual !== n; break;
      default: return false;
    }
    if (!ok) return false;
  }
  return true;
}

// Arbitrary for relationship stats within the valid range [-100, 100]
// But for familiarity, the valid range is [0, 100]
const relationshipStatArb = fc.integer({ min: -100, max: 100 });
const familiarityStatArb = fc.integer({ min: 0, max: 100 });
const tensionStatArb = fc.integer({ min: 0, max: 100 });

// Create a stats vector arbitrary
const statsVectorArb = fc.record({
  adeyemi_trust: relationshipStatArb,
  adeyemi_familiarity: familiarityStatArb,
  adeyemi_alignment: relationshipStatArb,
  adeyemi_tension: tensionStatArb,
  adeyemi_debt: relationshipStatArb,
  adeyemi_visibility: tensionStatArb,
});

describe('Adeyemi endings property tests — reachability and excludability', () => {
  describe('Each ending has a reachable stats vector', () => {
    for (const [endingName, ending] of Object.entries(ADEYEMI_ENDINGS)) {
      it(`ending "${endingName}" has at least one reachable stats vector`, () => {
        // For this test, we manually construct a vector that satisfies the constraints
        // rather than using fc to search, because fc might take too long
        const stats = buildSatisfyingVector(endingName as EndingName);
        
        expect(satisfiesEnding(ADEYEMI_ENDINGS, endingName as EndingName, stats)).toBe(true);
      });
    }
  });

  describe('Each ending has an excludable stats vector', () => {
    for (const [endingName, ending] of Object.entries(ADEYEMI_ENDINGS)) {
      it(`ending "${endingName}" has at least one excludable stats vector`, () => {
        // For this test, we manually construct a vector that does NOT satisfy the constraints
        const stats = buildNonSatisfyingVector(endingName as EndingName);
        
        expect(doesNotSatisfyEnding(ADEYEMI_ENDINGS, endingName as EndingName, stats)).toBe(true);
      });
    }
  });

  describe('Property: for all endings, reachable AND excludable vectors exist', () => {
    for (const [endingName, ending] of Object.entries(ADEYEMI_ENDINGS)) {
      it(`ending "${endingName}" is neither dead nor trivial`, () => {
        const reachable = buildSatisfyingVector(endingName as EndingName);
        const excludable = buildNonSatisfyingVector(endingName as EndingName);

        expect(satisfiesEnding(ADEYEMI_ENDINGS, endingName as EndingName, reachable)).toBe(true);
        expect(doesNotSatisfyEnding(ADEYEMI_ENDINGS, endingName as EndingName, excludable)).toBe(true);

        // Semantic property: for every random in-range vector, satisfiesEnding
        // must agree with an INDEPENDENT evaluation of every required_stats
        // constraint. The prior type-only check (`typeof passes === 'boolean'`)
        // passed even when the gate returned the wrong boolean for every vector;
        // this oracle catches such regressions while preserving the randomized
        // coverage and the hand-built non-triviality checks above.
        fc.assert(
          fc.property(statsVectorArb, (stats) => {
            const actual = satisfiesEnding(ADEYEMI_ENDINGS, endingName as EndingName, stats);
            const expected = expectedSatisfies(ending.required_stats, stats);
            return actual === expected;
          }),
          { numRuns: 200 }
        );
      });
    }
  });

  describe('Property: endings with high thresholds are still reachable within bounds', () => {
    it('friend ending (highest thresholds) is reachable within [-100, 100]', () => {
      // friend requires: trust>=70, familiarity>=75, alignment>=65, tension<=40
      const stats = {
        adeyemi_trust: 70,
        adeyemi_familiarity: 75,
        adeyemi_alignment: 65,
        adeyemi_tension: 40,
        adeyemi_debt: 0,
        adeyemi_visibility: 0,
      };
      
      expect(satisfiesEnding(ADEYEMI_ENDINGS, 'friend', stats)).toBe(true);
    });

    it('lover ending (highest thresholds) is reachable within [-100, 100]', () => {
      // lover requires: trust>=75, familiarity>=80, alignment>=60, tension>=30
      const stats = {
        adeyemi_trust: 75,
        adeyemi_familiarity: 80,
        adeyemi_alignment: 60,
        adeyemi_tension: 30,
        adeyemi_debt: 0,
        adeyemi_visibility: 0,
      };
      
      expect(satisfiesEnding(ADEYEMI_ENDINGS, 'lover', stats)).toBe(true);
    });
  });

  describe('Property: endings with gte and lte constraints', () => {
    it('always_distant ending (lte thresholds) is reachable', () => {
      // always_distant requires: trust<=50, familiarity<=50
      const stats = {
        adeyemi_trust: 50,
        adeyemi_familiarity: 50,
        adeyemi_alignment: 0,
        adeyemi_tension: 0,
        adeyemi_debt: 0,
        adeyemi_visibility: 0,
      };
      
      expect(satisfiesEnding(ADEYEMI_ENDINGS, 'always_distant', stats)).toBe(true);
    });

    it('opponent ending (mixed gte/lte) is reachable', () => {
      // opponent requires: alignment<=30, tension>=70
      const stats = {
        adeyemi_trust: 0,
        adeyemi_familiarity: 0,
        adeyemi_alignment: 30,
        adeyemi_tension: 70,
        adeyemi_debt: 0,
        adeyemi_visibility: 0,
      };
      
      expect(satisfiesEnding(ADEYEMI_ENDINGS, 'opponent', stats)).toBe(true);
    });
  });
});

// Helper functions to build satisfying/non-satisfying vectors
function buildSatisfyingVector(endingName: EndingName): Record<string, number> {
  const ending = ADEYEMI_ENDINGS[endingName];
  const stats: Record<string, number> = {
    adeyemi_trust: 0,
    adeyemi_familiarity: 0,
    adeyemi_alignment: 0,
    adeyemi_tension: 0,
    adeyemi_debt: 0,
    adeyemi_visibility: 0,
  };

  for (const [stat, constraint] of Object.entries(ending.required_stats)) {
    if (constraint.startsWith('gte:')) {
      const threshold = parseInt(constraint.replace('gte:', ''));
      stats[stat as keyof typeof stats] = threshold;
    } else if (constraint.startsWith('lte:')) {
      const threshold = parseInt(constraint.replace('lte:', ''));
      stats[stat as keyof typeof stats] = threshold;
    } else if (constraint.startsWith('gt:')) {
      const threshold = parseInt(constraint.replace('gt:', ''));
      stats[stat as keyof typeof stats] = threshold + 1;
    } else if (constraint.startsWith('lt:')) {
      const threshold = parseInt(constraint.replace('lt:', ''));
      stats[stat as keyof typeof stats] = threshold - 1;
    }
  }

  return stats;
}

function buildNonSatisfyingVector(endingName: EndingName): Record<string, number> {
  const ending = ADEYEMI_ENDINGS[endingName];
  const stats: Record<string, number> = {
    adeyemi_trust: 0,
    adeyemi_familiarity: 0,
    adeyemi_alignment: 0,
    adeyemi_tension: 0,
    adeyemi_debt: 0,
    adeyemi_visibility: 0,
  };

  // Violate EVERY constraint so the vector cannot satisfy the gate
  // regardless of declaration order.
  for (const [stat, constraint] of Object.entries(ending.required_stats)) {
    if (constraint.startsWith('gte:')) {
      const threshold = parseInt(constraint.replace('gte:', ''));
      stats[stat] = threshold - 1;
    } else if (constraint.startsWith('lte:')) {
      const threshold = parseInt(constraint.replace('lte:', ''));
      stats[stat] = threshold + 1;
    } else if (constraint.startsWith('gt:')) {
      const threshold = parseInt(constraint.replace('gt:', ''));
      stats[stat] = threshold;
    } else if (constraint.startsWith('lt:')) {
      const threshold = parseInt(constraint.replace('lt:', ''));
      stats[stat] = threshold;
    }
  }

  return stats;
}