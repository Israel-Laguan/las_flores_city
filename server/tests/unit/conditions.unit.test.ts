import { describe, it, expect } from '@jest/globals';
import {
  choicePassesFilters,
  metadataConditionsPass,
  parseNumericComparison,
  compareNumber,
  PlayerConditionState,
} from '@las-flores/shared';

// ============================================================
// Choice condition evaluator — typed flag/state/stat gating
//
// Feature: typed flag system (flag_set / state_set / stat_set)
//
// Validates the pure evaluator that filterChoices + applyChoiceFilters
// share. No DB / no network — pure function under test.
// ============================================================

const EMPTY: PlayerConditionState = { flags: {}, state: {}, stats: {}, timeBlocks: 100 };

describe('parseNumericComparison', () => {
  it('parses a valid op:number', () => {
    expect(parseNumericComparison('gt:50')).toEqual({ op: 'gt', n: 50 });
    expect(parseNumericComparison('lt:-5')).toEqual({ op: 'lt', n: -5 });
    expect(parseNumericComparison('eq:0')).toEqual({ op: 'eq', n: 0 });
  });

  it('rejects malformed strings', () => {
    expect(parseNumericComparison('50')).toBeNull();
    expect(parseNumericComparison('gt:')).toBeNull();
    expect(parseNumericComparison('greater:50')).toBeNull();
    expect(parseNumericComparison('gt:abc')).toBeNull();
  });
});

describe('compareNumber', () => {
  const cases: Array<[string, number, number, boolean]> = [
    ['gt', 60, 50, true],
    ['gt', 50, 50, false],
    ['lt', 40, 50, true],
    ['lt', 50, 50, false],
    ['gte', 50, 50, true],
    ['gte', 49, 50, false],
    ['lte', 50, 50, true],
    ['lte', 51, 50, false],
    ['eq', 50, 50, true],
    ['eq', 51, 50, false],
    ['ne', 51, 50, true],
    ['ne', 50, 50, false],
  ];
  for (const [op, actual, n, expected] of cases) {
    it(`${op}: ${actual} vs ${n} → ${expected}`, () => {
      expect(compareNumber(actual, { op: op as any, n })).toBe(expected);
    });
  }
});

describe('choicePassesFilters — boolean flags', () => {
  it('passes when a required flag is present', () => {
    const player = { ...EMPTY, flags: { has_key: true } };
    expect(choicePassesFilters({ required_flags: { has_key: true } }, player)).toBe(true);
  });

  it('fails closed when a required flag is missing', () => {
    expect(choicePassesFilters({ required_flags: { has_key: true } }, EMPTY)).toBe(false);
  });

  it('hides a choice when hidden_if flag matches', () => {
    const player = { ...EMPTY, flags: { met_vance: true } };
    expect(choicePassesFilters({ hidden_if: { met_vance: true } }, player)).toBe(false);
  });

  it('shows a choice when hidden_if flag does not match', () => {
    const player = { ...EMPTY, flags: { met_vance: false } };
    expect(choicePassesFilters({ hidden_if: { met_vance: true } }, player)).toBe(true);
  });
});

describe('choicePassesFilters — categorical state', () => {
  it('passes when required_state equals the stored value', () => {
    const player = { ...EMPTY, state: { sofia_status: 'romanced' } };
    expect(choicePassesFilters({ required_state: { sofia_status: 'romanced' } }, player)).toBe(true);
  });

  it('fails closed when required_state differs', () => {
    const player = { ...EMPTY, state: { sofia_status: 'disillusioned' } };
    expect(choicePassesFilters({ required_state: { sofia_status: 'romanced' } }, player)).toBe(false);
  });

  it('fails closed when required_state key is missing', () => {
    expect(choicePassesFilters({ required_state: { sofia_status: 'romanced' } }, EMPTY)).toBe(false);
  });

  it('hides a choice when hidden_if_state matches', () => {
    const player = { ...EMPTY, state: { sofia_status: 'disillusioned' } };
    expect(choicePassesFilters({ hidden_if_state: { sofia_status: 'disillusioned' } }, player)).toBe(false);
  });
});

describe('choicePassesFilters — numeric stats', () => {
  it('passes a gt gate when the stat exceeds the threshold', () => {
    const player = { ...EMPTY, stats: { sofia_trust: 60 } };
    expect(choicePassesFilters({ required_stats: { sofia_trust: 'gt:50' } }, player)).toBe(true);
  });

  it('fails a gt gate when the stat is below the threshold', () => {
    const player = { ...EMPTY, stats: { sofia_trust: 40 } };
    expect(choicePassesFilters({ required_stats: { sofia_trust: 'gt:50' } }, player)).toBe(false);
  });

  it('treats a missing stat as 0 (gt:0 fails until trust is earned)', () => {
    expect(choicePassesFilters({ required_stats: { sofia_trust: 'gt:0' } }, EMPTY)).toBe(false);
  });

  it('treats a missing stat as 0 (gt:-1 passes for an unset stat)', () => {
    expect(choicePassesFilters({ required_stats: { sofia_trust: 'gt:-1' } }, EMPTY)).toBe(true);
  });

  it('hides a choice when hidden_if_stats comparison is true', () => {
    const player = { ...EMPTY, stats: { sofia_trust: 60 } };
    expect(choicePassesFilters({ hidden_if_stats: { sofia_trust: 'lt:75' } }, player)).toBe(false);
  });

  it('shows a choice when hidden_if_stats comparison is false', () => {
    const player = { ...EMPTY, stats: { sofia_trust: 80 } };
    expect(choicePassesFilters({ hidden_if_stats: { sofia_trust: 'lt:75' } }, player)).toBe(true);
  });
});

describe('choicePassesFilters — combined + economy', () => {
  it('passes with no conditions', () => {
    expect(choicePassesFilters({} as any, EMPTY)).toBe(true);
  });

  it('enforces the time_block_cost gate using timeBlocks', () => {
    const playerWithEnough = { ...EMPTY, timeBlocks: 10 };
    const playerWithNotEnough = { ...EMPTY, timeBlocks: 4 };
    expect(choicePassesFilters({ time_block_cost: { amount: 5 } }, playerWithEnough)).toBe(true);
    expect(choicePassesFilters({ time_block_cost: { amount: 5 } }, playerWithNotEnough)).toBe(false);
  });

  it('evaluates a mixed flag + state + stat gate', () => {
    const player: PlayerConditionState = {
      flags: { met_sofia: true },
      state: { sofia_status: 'romanced' },
      stats: { sofia_trust: 80 },
      timeBlocks: 100,
    };
    expect(
      choicePassesFilters(
        {
          required_flags: { met_sofia: true },
          required_state: { sofia_status: 'romanced' },
          required_stats: { sofia_trust: 'gte:75' },
        },
        player
      )
    ).toBe(true);
  });
});

describe('metadataConditionsPass — tree-level gating', () => {
  it('passes when metadata has no required_* gates', () => {
    expect(metadataConditionsPass({ story_beat: 'act1' }, EMPTY)).toBe(true);
    expect(metadataConditionsPass(undefined, EMPTY)).toBe(true);
  });

  it('enforces metadata.required_stats (gt:0 fails for a new player)', () => {
    expect(metadataConditionsPass({ required_stats: { sofia_trust: 'gt:0' } }, EMPTY)).toBe(false);
    expect(
      metadataConditionsPass({ required_stats: { sofia_trust: 'gt:0' } }, { ...EMPTY, stats: { sofia_trust: 10 } })
    ).toBe(true);
  });

  it('enforces metadata.required_state', () => {
    expect(metadataConditionsPass({ required_state: { sofia_status: 'romanced' } }, EMPTY)).toBe(false);
    expect(
      metadataConditionsPass(
        { required_state: { sofia_status: 'romanced' } },
        { ...EMPTY, state: { sofia_status: 'romanced' } }
      )
    ).toBe(true);
  });
});

// ============================================================
// Relationship system tests (Adeyemi blueprint)
// ============================================================

describe('choicePassesFilters — required_stats for relationship system', () => {
  it('passes required_stats gte:70 when stat equals 70', () => {
    const player = { ...EMPTY, stats: { adeyemi_trust: 70 } };
    expect(choicePassesFilters({ required_stats: { adeyemi_trust: 'gte:70' } }, player)).toBe(true);
  });

  it('passes required_stats gte:70 when stat is 90 (above threshold)', () => {
    const player = { ...EMPTY, stats: { adeyemi_trust: 90 } };
    expect(choicePassesFilters({ required_stats: { adeyemi_trust: 'gte:70' } }, player)).toBe(true);
  });

  it('fails required_stats gte:70 when stat is 69 (below threshold)', () => {
    const player = { ...EMPTY, stats: { adeyemi_trust: 69 } };
    expect(choicePassesFilters({ required_stats: { adeyemi_trust: 'gte:70' } }, player)).toBe(false);
  });

  it('fails required_stats gte:70 when stat is missing (treated as 0)', () => {
    expect(choicePassesFilters({ required_stats: { adeyemi_trust: 'gte:70' } }, EMPTY)).toBe(false);
  });

  it('passes required_stats lte:50 when stat equals 50', () => {
    const player = { ...EMPTY, stats: { adeyemi_alignment: 50 } };
    expect(choicePassesFilters({ required_stats: { adeyemi_alignment: 'lte:50' } }, player)).toBe(true);
  });

  it('fails required_stats lte:50 when stat is 51 (above threshold)', () => {
    const player = { ...EMPTY, stats: { adeyemi_alignment: 51 } };
    expect(choicePassesFilters({ required_stats: { adeyemi_alignment: 'lte:50' } }, player)).toBe(false);
  });
});

describe('metadataConditionsPass — required_flags as list (B1 regression)', () => {
  it('fails closed when required_flags is a list (not a record)', () => {
    // This simulates the B1 bug where YAML list form becomes ["key"] in JS
    const listFormRequiredFlags: any = { required_flags: ['adeyemi_first_contact_made'] };
    // The metadataConditionsPass function will call Object.entries on this
    // which for a list gives [['0', 'adeyemi_first_contact_made']]
    // so it checks player.flags['0'] which doesn't exist -> fails closed
    expect(metadataConditionsPass(listFormRequiredFlags, EMPTY)).toBe(false);
  });

  it('passes when required_flags is properly a record', () => {
    expect(
      metadataConditionsPass(
        { required_flags: { adeyemi_first_contact_made: true } },
        { ...EMPTY, flags: { adeyemi_first_contact_made: true } }
      )
    ).toBe(true);
  });

  it('fails when required_flags record key is missing from player', () => {
    expect(
      metadataConditionsPass(
        { required_flags: { adeyemi_first_contact_made: true } },
        EMPTY
      )
    ).toBe(false);
  });

  it('fails when required_state is missing from player', () => {
    expect(
      metadataConditionsPass(
        { required_state: { adeyemi_act: '1_done' } },
        { ...EMPTY, state: {} }
      )
    ).toBe(false);
  });

  it('passes required_state when value matches', () => {
    expect(
      metadataConditionsPass(
        { required_state: { adeyemi_act: '1_done' } },
        { ...EMPTY, state: { adeyemi_act: '1_done' } }
      )
    ).toBe(true);
  });
});

describe('metadataConditionsPass — required_flags list form with multiple flags (B1 regression)', () => {
  it('fails closed when required_flags is a list with multiple items', () => {
    // Multiple items in list form: ["flag1", "flag2"]
    const listFormRequiredFlags: any = { required_flags: ['adeyemi_first_contact_made', 'ANSWERED'] };
    expect(metadataConditionsPass(listFormRequiredFlags, EMPTY)).toBe(false);
  });
});
