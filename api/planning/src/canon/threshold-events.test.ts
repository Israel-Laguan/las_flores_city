// api/planning/src/canon/threshold-events.test.ts
// SC-206: threshold crossing sets a flag as an event; latching persists, tracking clears.

import { describe, test, expect } from '@jest/globals';
import { createFlagDefinition } from '@las-flores/api-contracts';
import {
  applyThresholdCrossing,
  applyThresholdCrossingSimple,
  FixtureFlagState,
  ThresholdMonitor,
} from './threshold-events.js';
import type { Threshold } from './threshold-events.js';

const latching = createFlagDefinition('trusted', 'player trusted', 'latching');
const tracking = createFlagDefinition('wanted', 'player wanted', 'tracking');

describe('applyThresholdCrossingSimple', () => {
  test('crossing upward sets the flag', () => {
    expect(applyThresholdCrossingSimple('trust', 4, 5, 5, latching).flag_set).toEqual({ trusted: true });
  });

  test('no crossing changes nothing (below, and already above)', () => {
    expect(applyThresholdCrossingSimple('trust', 1, 4, 5, latching).flag_set).toEqual({});
    expect(applyThresholdCrossingSimple('trust', 6, 9, 5, latching).flag_set).toEqual({});
  });

  test('latching: flag stays set after the stat falls back', () => {
    const state = new FixtureFlagState();
    state.apply(applyThresholdCrossingSimple('trust', 4, 6, 5, latching));
    expect(state.get('trusted')).toBe(true);
    const fall = applyThresholdCrossingSimple('trust', 6, 2, 5, latching);
    expect(fall.flag_set).toEqual({});
    expect(fall.description).toMatch(/persists/);
    state.apply(fall);
    expect(state.get('trusted')).toBe(true);
  });

  test('tracking: flag clears when the stat falls back', () => {
    const state = new FixtureFlagState();
    state.apply(applyThresholdCrossingSimple('heat', 4, 6, 5, tracking));
    expect(state.get('wanted')).toBe(true);
    state.apply(applyThresholdCrossingSimple('heat', 6, 2, 5, tracking));
    expect(state.get('wanted')).toBe(false);
  });

  test('tracking re-sets when the stat crosses again', () => {
    const state = new FixtureFlagState();
    state.apply(applyThresholdCrossingSimple('heat', 0, 6, 5, tracking));
    state.apply(applyThresholdCrossingSimple('heat', 6, 1, 5, tracking));
    state.apply(applyThresholdCrossingSimple('heat', 1, 7, 5, tracking));
    expect(state.get('wanted')).toBe(true);
  });
});

describe('applyThresholdCrossing directions', () => {
  const below: Threshold = { statName: 'hp', value: 10, direction: 'below' };

  test('"below" sets when the stat drops under the value', () => {
    expect(applyThresholdCrossing('hp', 12, 8, below, tracking).flag_set).toEqual({ wanted: true });
  });

  test('"below" tracking clears when the stat rises back (both directions of crossing)', () => {
    expect(applyThresholdCrossing('hp', 8, 12, below, tracking).flag_set).toEqual({ wanted: false });
  });

  test('"above" is strict: equal to the value is not a crossing', () => {
    const above: Threshold = { statName: 'x', value: 5, direction: 'above' };
    expect(applyThresholdCrossing('x', 4, 5, above, latching).flag_set).toEqual({});
    expect(applyThresholdCrossing('x', 4, 6, above, latching).flag_set).toEqual({ trusted: true });
  });
});

describe('ThresholdMonitor', () => {
  test('returns undefined when nothing is watched or crossed', () => {
    const m = new ThresholdMonitor();
    expect(m.checkThresholdCrossing('trust', 0, 10)).toBeUndefined();
    m.addThreshold('trust', { statName: 'trust', value: 5, direction: 'at_or_above' });
    expect(m.checkThresholdCrossing('trust', 0, 3)).toBeUndefined();
  });

  test('one change crossing several thresholds sets every flag', () => {
    const m = new ThresholdMonitor();
    for (const value of [10, 20, 30]) {
      m.addThreshold('trust', { statName: 'trust', value, direction: 'at_or_above' });
    }
    const result = m.checkThresholdCrossing('trust', 0, 50);
    expect(Object.keys(result!.flag_set).sort()).toEqual([
      'threshold_trust_at_or_above_10',
      'threshold_trust_at_or_above_20',
      'threshold_trust_at_or_above_30',
    ]);
  });

  test('generated flag names are valid slugs (spaces, negatives)', () => {
    const m = new ThresholdMonitor();
    m.addThreshold('player trust', { statName: 'player trust', value: -5, direction: 'below' });
    const result = m.checkThresholdCrossing('player trust', 0, -10);
    expect(Object.keys(result!.flag_set)).toEqual(['threshold_player_trust_below_neg5']);
    expect(() => createFlagDefinition(Object.keys(result!.flag_set)[0], 'm', 'latching')).not.toThrow();
  });

  test('setStatValue reports whether the value changed', () => {
    const m = new ThresholdMonitor();
    expect(m.setStatValue('s', 1)).toBe(true);
    expect(m.setStatValue('s', 1)).toBe(false);
    expect(m.getStatValue('s')).toBe(1);
  });
});
