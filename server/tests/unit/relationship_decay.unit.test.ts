import { describe, it, expect } from '@jest/globals';
import {
  computeRelationshipDecay,
  DecayRates,
  DecayBounds,
  DecayInput,
  RELATIONSHIP_STAT_PREFIXES,
} from '../../src/workers/RelationshipDecayWorker.js';

// ============================================================
// Unit tests for computeRelationshipDecay pure function
// No DB mock needed — this is a pure function
// ============================================================

const DEFAULT_RATES: DecayRates = {
  trustDecayPerDay: 2,
  familiarityDecayPerDay: 1,
  tensionGrowthPerDay: 1,
};

const DEFAULT_BOUNDS: DecayBounds = {
  minTrust: -100,
  minFamiliarity: 0,
  maxTension: 100,
};

// Helper to create a date in the past — DST-safe because it subtracts
// exact milliseconds from `from` (default: now) rather than wall-clock day
// arithmetic. Accepts a `from` anchor so tests can pass the SAME `now` they
// feed to computeRelationshipDecay, guaranteeing an exact integer-day delta
// (re-reading Date.now() independently of `now` creates a sub-millisecond
// skew that Math.floor() can truncate to N-1 days — the original flake).
export function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('computeRelationshipDecay — basic functionality', () => {
  it('returns no changes when no last encounter timestamp exists', () => {
    const input: DecayInput = {
      stats: { adeyemi_trust: 40 },
      state: {},
      prefix: 'adeyemi_',
      now: new Date(),
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    expect(result.hasChanges).toBe(false);
    expect(result.newStats).toEqual({ adeyemi_trust: 40 });
    expect(result.newState).toEqual({});
  });

  it('returns no changes when elapsed time is less than 1 day', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago

    const input: DecayInput = {
      stats: { adeyemi_trust: 40 },
      state: { last_adeyemi_encounter_at: oneHourAgo.toISOString() },
      prefix: 'adeyemi_',
      now,
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    expect(result.hasChanges).toBe(false);
  });
});

describe('computeRelationshipDecay — linear decay (not compounding)', () => {
  it('decays trust by exactly 7 days * 2 = 14 on first run', () => {
    const now = new Date();
    const sevenDaysAgo = daysAgo(7, now);

    const input: DecayInput = {
      stats: { adeyemi_trust: 40 },
      state: { last_adeyemi_encounter_at: sevenDaysAgo.toISOString() },
      prefix: 'adeyemi_',
      now,
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    // 40 - (7 * 2) = 26
    expect(result.newStats.adeyemi_trust).toBe(26);
    expect(result.hasChanges).toBe(true);
    // Should record the decay timestamp
    expect(result.newState.last_adeyemi_decay_at).toBeDefined();
  });

  it('decays by exactly 2 more on second run with 1 day elapsed since last decay', () => {
    const now = new Date();
    const sevenDaysAgo = daysAgo(7, now);
    const oneDayAgo = daysAgo(1, now);

    // First run: 7 days since encounter
    const firstInput: DecayInput = {
      stats: { adeyemi_trust: 40 },
      state: { last_adeyemi_encounter_at: sevenDaysAgo.toISOString() },
      prefix: 'adeyemi_',
      now,
    };

    const firstResult = computeRelationshipDecay(firstInput, DEFAULT_RATES, DEFAULT_BOUNDS);
    expect(firstResult.newStats.adeyemi_trust).toBe(26);

    // Second run: 1 day since last decay (which was at "now")
    const secondNow = new Date(now.getTime() + 1000 * 60 * 60 * 24); // 1 day later
    const secondInput: DecayInput = {
      stats: { adeyemi_trust: 26 },
      state: {
        last_adeyemi_encounter_at: sevenDaysAgo.toISOString(),
        last_adeyemi_decay_at: now.toISOString(),
      },
      prefix: 'adeyemi_',
      now: secondNow,
    };

    const secondResult = computeRelationshipDecay(secondInput, DEFAULT_RATES, DEFAULT_BOUNDS);

    // Should decay by exactly 2 more (1 day * 2), not 16 (8 days * 2)
    // This proves it's linear, not compounding
    expect(secondResult.newStats.adeyemi_trust).toBe(24);
    expect(secondResult.hasChanges).toBe(true);
  });

  it('does not charge pre-engagement decay when the player re-engaged after a decay tick', () => {
    // Scenario:
    //   Day 0: encounter (last_encounter_at = Day 0)
    //   Day 5: worker ticks, decays 5 days, sets last_decay_at = Day 5
    //   Day 6: player re-engages (last_encounter_at = Day 6)
    //   Day 8: worker ticks again.
    //
    // Bug (pre-fix): referenceDate = last_decay_at (Day 5), so daysElapsed = 3
    //   → decays 3 days, but 1 of those days the player was actively engaged.
    //
    // Fix: last_encounter_at (Day 6) is NEWER than last_decay_at (Day 5),
    //   so referenceDate = Day 6, daysElapsed = 2 → only 2 days of decay.
    const day0 = daysAgo(8, new Date('2026-01-15T00:00:00Z'));
    const day5 = daysAgo(3, new Date('2026-01-15T00:00:00Z'));
    const day6 = daysAgo(2, new Date('2026-01-15T00:00:00Z'));
    const day8 = new Date('2026-01-15T00:00:00Z');

    const input: DecayInput = {
      stats: { adeyemi_trust: 40 },
      state: {
        last_adeyemi_encounter_at: day6.toISOString(), // re-engaged on Day 6
        last_adeyemi_decay_at: day5.toISOString(),     // prior decay on Day 5
      },
      prefix: 'adeyemi_',
      now: day8,
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    // 2 days of decay (Day 6 → Day 8), not 3 (Day 5 → Day 8): 40 - (2 * 2) = 36
    expect(result.newStats.adeyemi_trust).toBe(36);
    expect(result.hasChanges).toBe(true);
  });
});

describe('computeRelationshipDecay — clamping', () => {
  it('clamps trust to minTrust (-100)', () => {
    const now = new Date();
    const tenDaysAgo = daysAgo(10, now);

    const input: DecayInput = {
      stats: { adeyemi_trust: -95 },
      state: { last_adeyemi_encounter_at: tenDaysAgo.toISOString() },
      prefix: 'adeyemi_',
      now,
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    // -95 - (10 * 2) = -115, clamped to -100
    expect(result.newStats.adeyemi_trust).toBe(-100);
    expect(result.hasChanges).toBe(true);
  });

  it('clamps familiarity to minFamiliarity (0)', () => {
    const now = new Date();
    const fiveDaysAgo = daysAgo(5, now);

    const input: DecayInput = {
      stats: { adeyemi_familiarity: 3 },
      state: { last_adeyemi_encounter_at: fiveDaysAgo.toISOString() },
      prefix: 'adeyemi_',
      now,
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    // 3 - (5 * 1) = -2, clamped to 0
    expect(result.newStats.adeyemi_familiarity).toBe(0);
    expect(result.hasChanges).toBe(true);
  });

  it('clamps tension to maxTension (100)', () => {
    const now = new Date();
    const fiftyDaysAgo = daysAgo(50, now);

    // A starting value that would exceed maxTension must clamp to 100.
    const highTensionInput: DecayInput = {
      stats: { adeyemi_tension: 95 },
      state: { last_adeyemi_encounter_at: fiftyDaysAgo.toISOString() },
      prefix: 'adeyemi_',
      now,
    };

    const highResult = computeRelationshipDecay(highTensionInput, DEFAULT_RATES, DEFAULT_BOUNDS);
    // 95 + 30 = 125, clamped to 100
    expect(highResult.newStats.adeyemi_tension).toBe(100);
    expect(highResult.hasChanges).toBe(true);
  });
});

describe('computeRelationshipDecay — floor protection', () => {
  it('does not auto-create floor stats on first decay after encounter', () => {
    const now = new Date();
    const sevenDaysAgo = daysAgo(7, now);

    const input: DecayInput = {
      stats: { adeyemi_trust: 40, adeyemi_familiarity: 50 },
      state: { last_adeyemi_encounter_at: sevenDaysAgo.toISOString() },
      prefix: 'adeyemi_',
      now,
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    // Floors are content-authored only — the worker must NOT auto-initialize them
    // to the current (post-encounter) value, or decay would be clamped to zero.
    expect(result.newStats.adeyemi_trust_floor).toBeUndefined();
    expect(result.newStats.adeyemi_familiarity_floor).toBeUndefined();
    // Decay proceeds: 40 - (7 * 2) = 26, 50 - (7 * 1) = 43
    expect(result.newStats.adeyemi_trust).toBe(26);
    expect(result.newStats.adeyemi_familiarity).toBe(43);
  });

  it('does not decay below trust floor', () => {
    const now = new Date();
    const sevenDaysAgo = daysAgo(7, now);

    // Start at trust=25 with floor at 20
    const input: DecayInput = {
      stats: { 
        adeyemi_trust: 25, 
        adeyemi_trust_floor: 20,
        adeyemi_familiarity: 50,
        adeyemi_familiarity_floor: 40
      },
      state: {
        last_adeyemi_encounter_at: sevenDaysAgo.toISOString(),
        last_adeyemi_decay_at: daysAgo(3, now).toISOString(),
      },
      prefix: 'adeyemi_',
      now,
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    // Reference is last_adeyemi_decay_at (3 days ago): 25 - (3 * 2) = 19,
    // but the floor is 20, so the result stays at 20.
    expect(result.newStats.adeyemi_trust).toBe(20);
    expect(result.hasChanges).toBe(true);
  });

  it('does not decay below familiarity floor', () => {
    const now = new Date();
    const fiveDaysAgo = daysAgo(5, now);

    const input: DecayInput = {
      stats: { 
        adeyemi_familiarity: 25, 
        adeyemi_familiarity_floor: 20
      },
      state: {
        last_adeyemi_encounter_at: fiveDaysAgo.toISOString(),
        last_adeyemi_decay_at: daysAgo(2, now).toISOString(),
      },
      prefix: 'adeyemi_',
      now,
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    // 25 - (2 * 1) = 23, which is above floor of 20, so should be 23
    expect(result.newStats.adeyemi_familiarity).toBe(23);
  });
});

describe('computeRelationshipDecay — tension growth', () => {
  it('increases tension over time', () => {
    const now = new Date();
    const fiveDaysAgo = daysAgo(5, now);

    const input: DecayInput = {
      stats: { adeyemi_tension: 30 },
      state: { last_adeyemi_encounter_at: fiveDaysAgo.toISOString() },
      prefix: 'adeyemi_',
      now,
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    // 30 + (5 * 1) = 35
    expect(result.newStats.adeyemi_tension).toBe(35);
    expect(result.hasChanges).toBe(true);
  });
});

describe('computeRelationshipDecay — max days per tick cap', () => {
  it('caps decay at MAX_DAYS_PER_TICK (30) to prevent huge catch-up spikes', () => {
    const now = new Date();
    const sixtyDaysAgo = daysAgo(60, now); // Worker was down for 60 days

    const input: DecayInput = {
      stats: { adeyemi_trust: 100 },
      state: { last_adeyemi_encounter_at: sixtyDaysAgo.toISOString() },
      prefix: 'adeyemi_',
      now,
    };

    const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

    // Capped at 30 days: 100 - (30 * 2) = 40
    // Without cap: 100 - (60 * 2) = -20
    expect(result.newStats.adeyemi_trust).toBe(40);
    expect(result.hasChanges).toBe(true);
  });
});

describe('computeRelationshipDecay — all relationship prefixes', () => {
  it('works for all configured prefixes', () => {
    const now = new Date();
    const threeDaysAgo = daysAgo(3, now);

    for (const prefix of RELATIONSHIP_STAT_PREFIXES) {
      const input: DecayInput = {
        stats: { [`${prefix}trust`]: 50 },
        state: { [`last_${prefix}encounter_at`]: threeDaysAgo.toISOString() },
        prefix,
        now,
      };

      const result = computeRelationshipDecay(input, DEFAULT_RATES, DEFAULT_BOUNDS);

      // 50 - (3 * 2) = 44
      expect(result.newStats[`${prefix}trust`]).toBe(44);
      expect(result.hasChanges).toBe(true);
    }
  });
});