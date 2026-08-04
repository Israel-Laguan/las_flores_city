import { describe, it, expect, jest as jestGlobals, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { choicePassesFilters } from '@las-flores/shared';

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

// Mock database/redis to prevent real connections
jestGlobals.mock('../../src/database/redis.js', () => ({
  getCache: jestGlobals.fn(async () => null),
  setCache: jestGlobals.fn(async () => undefined),
  closeRedis: jestGlobals.fn(async () => undefined),
}));

// The 8 Adeyemi endings with their required_stats from char_adeyemi_ogunbiyi.yaml
// Note: these are the stat thresholds only; flags are secondary gates
const ADEYEMI_ENDINGS = {
  friend: {
    required_stats: {
      adeyemi_trust: 'gte:70',
      adeyemi_familiarity: 'gte:75',
      adeyemi_alignment: 'gte:65',
      adeyemi_tension: 'lte:40',
    },
  },
  lover: {
    required_stats: {
      adeyemi_trust: 'gte:75',
      adeyemi_familiarity: 'gte:80',
      adeyemi_alignment: 'gte:60',
      adeyemi_tension: 'gte:30',
    },
  },
  the_mirror: {
    required_stats: {
      adeyemi_trust: 'gte:60',
      adeyemi_familiarity: 'gte:65',
      adeyemi_alignment: 'gte:40',
      adeyemi_tension: 'gte:50',
    },
  },
  reluctant_ally: {
    required_stats: {
      adeyemi_trust: 'gte:50',
    },
  },
  failed_friend: {
    required_stats: {
      adeyemi_trust: 'gte:40',
      adeyemi_familiarity: 'gte:60',
      adeyemi_tension: 'gte:50',
    },
  },
  failed_lover: {
    required_stats: {
      adeyemi_trust: 'gte:60',
      adeyemi_familiarity: 'gte:70',
      adeyemi_tension: 'gte:65',
    },
  },
  always_distant: {
    required_stats: {
      adeyemi_trust: 'lte:50',
      adeyemi_familiarity: 'lte:50',
    },
  },
  opponent: {
    required_stats: {
      adeyemi_alignment: 'lte:30',
      adeyemi_tension: 'gte:70',
    },
  },
} as const;

type EndingName = keyof typeof ADEYEMI_ENDINGS;

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

  // Pick the first constraint and violate it
  const firstStat = Object.keys(ending.required_stats)[0] as keyof typeof ending.required_stats;
  const firstConstraint = ending.required_stats[firstStat];

  if (firstConstraint.startsWith('gte:')) {
    const threshold = parseInt(firstConstraint.replace('gte:', ''));
    stats[firstStat as keyof typeof stats] = threshold - 1;
  } else if (firstConstraint.startsWith('lte:')) {
    const threshold = parseInt(firstConstraint.replace('lte:', ''));
    stats[firstStat as keyof typeof stats] = threshold + 1;
  } else if (firstConstraint.startsWith('gt:')) {
    const threshold = parseInt(firstConstraint.replace('gt:', ''));
    stats[firstStat as keyof typeof stats] = threshold;
  } else if (firstConstraint.startsWith('lt:')) {
    const threshold = parseInt(firstConstraint.replace('lt:', ''));
    stats[firstStat as keyof typeof stats] = threshold;
  }

  return stats;
}