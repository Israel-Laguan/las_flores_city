// api/planning/src/edges/flag-tracking.test.ts
// SC-205: flag sets vs reads per entity, requires_flag keeps choice_id (SC-S1).

import { describe, test, expect } from '@jest/globals';
import { and, flag, not, or } from '@las-flores/api-contracts';
import {
  createFlagEdges,
  extractFlagUsage,
  flagUsageToEdges,
  validateFlagReferences,
} from './flag-tracking.js';
import type { EntityPayload } from './flag-tracking.js';

describe('extractFlagUsage', () => {
  test('separates flags set from flags read', () => {
    const usage = extractFlagUsage({
      id: 'scene_1',
      type: 'scene',
      conditions: flag('met_vera', true),
      effects: { flag_set: [{ flag: 'found_key', value: true }], flag_clear: ['alarm'] },
    });
    expect([...usage.sets].sort()).toEqual(['alarm', 'found_key']);
    expect(usage.reads.map((r) => r.flag)).toEqual(['met_vera']);
  });

  test('reads flags from nested conditions (not/and/or, 3 levels)', () => {
    const usage = extractFlagUsage({
      id: 's',
      type: 'scene',
      conditions: and([flag('a', true), or([flag('b', true), not(flag('c', false))])]),
    });
    expect(usage.reads.map((r) => r.flag).sort()).toEqual(['a', 'b', 'c']);
  });

  test('accepts a list of conditions', () => {
    const usage = extractFlagUsage({
      id: 's',
      type: 'scene',
      conditions: [flag('a', true), flag('b', true)],
    });
    expect(usage.reads.map((r) => r.flag)).toEqual(['a', 'b']);
  });

  test('records the written value and the writing entity', () => {
    const usage = extractFlagUsage({
      id: 'scene_1',
      type: 'scene',
      effects: { flag_set: [{ flag: 'x', value: false }], flag_clear: ['y'] },
    });
    expect(usage.writes).toEqual([
      { flag: 'x', value: false, entityId: 'scene_1', entityType: 'scene' },
      { flag: 'y', value: false, entityId: 'scene_1', entityType: 'scene' },
    ]);
  });

  test('requires_flag retains the child choice_id (SC-S1)', () => {
    const usage = extractFlagUsage({
      id: 'dlg',
      type: 'dialogue',
      children: [{ id: 'choice_a', type: 'choice', conditions: flag('met_vera', true) }],
    });
    expect(usage.reads).toEqual([{ flag: 'met_vera', choiceId: 'choice_a' }]);
  });

  test('two choices reading the same flag stay two reads', () => {
    const usage = extractFlagUsage({
      id: 'dlg',
      type: 'dialogue',
      conditions: flag('gate', true),
      children: [
        { id: 'c1', type: 'choice', conditions: flag('gate', true) },
        { id: 'c2', type: 'choice', conditions: flag('gate', true) },
      ],
    });
    expect(usage.reads).toEqual([
      { flag: 'gate', choiceId: undefined },
      { flag: 'gate', choiceId: 'c1' },
      { flag: 'gate', choiceId: 'c2' },
    ]);
  });
});

describe('createFlagEdges', () => {
  const payload: EntityPayload = {
    id: 'scene_1',
    type: 'scene',
    effects: { flag_set: [{ flag: 'door_open', value: true }] },
    children: [
      {
        id: 'choice_close',
        type: 'choice',
        conditions: flag('door_open', true),
        effects: { flag_clear: ['door_open'] },
      },
    ],
  };

  test('emits requires_flag with choice_id attrs', () => {
    const edges = createFlagEdges(payload);
    expect(edges).toContainEqual({
      from_type: 'scene',
      from_slug: 'scene_1',
      edge_kind: 'requires_flag',
      to_type: 'flag',
      to_slug: 'door_open',
      attrs: { choice_id: 'choice_close' },
    });
  });

  test('scene sets and nested choice clears are two separately attributed edges', () => {
    const writes = createFlagEdges(payload).filter((e) => e.edge_kind !== 'requires_flag');
    expect(writes).toEqual([
      {
        from_type: 'scene', from_slug: 'scene_1', edge_kind: 'sets_flag',
        to_type: 'flag', to_slug: 'door_open', attrs: { value: true },
      },
      {
        from_type: 'choice', from_slug: 'choice_close', edge_kind: 'clears_flag',
        to_type: 'flag', to_slug: 'door_open', attrs: { value: false },
      },
    ]);
  });

  test('falls back to the caller choice_id when the read is not choice-scoped', () => {
    const edges = createFlagEdges({ id: 's', type: 'scene', conditions: flag('f', true) }, 'caller_choice');
    expect(edges[0].attrs).toEqual({ choice_id: 'caller_choice' });
  });

  test('flagUsageToEdges emits sets_flag for a hand-built usage without write detail', () => {
    const edges = flagUsageToEdges(
      { sets: new Set(['f']), writes: [], reads: [] },
      { type: 'scene', slug: 's' },
    );
    expect(edges).toEqual([
      {
        from_type: 'scene', from_slug: 's', edge_kind: 'sets_flag',
        to_type: 'flag', to_slug: 'f', attrs: { value: true },
      },
    ]);
  });
});

describe('validateFlagReferences', () => {
  const payload: EntityPayload = {
    id: 's',
    type: 'scene',
    conditions: flag('known', true),
    effects: { flag_set: [{ flag: 'typo', value: true }, { flag: 'known', value: true }] },
  };

  test('reports unknown flags once, sorted', () => {
    expect(validateFlagReferences(payload, ['known'])).toEqual({ valid: false, missing: ['typo'] });
  });

  test('valid when every referenced flag is known', () => {
    expect(validateFlagReferences(payload, new Set(['known', 'typo']))).toEqual({ valid: true, missing: [] });
  });
});
