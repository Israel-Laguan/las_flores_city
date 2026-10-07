// api/planning/src/edges/scene-flag-usage.test.ts
// SC-310: flag-usage extraction for a SceneDef payload, and a regression guard that
// the existing (dialogue-shaped) EntityPayload extraction is unchanged.

import { describe, test, expect } from '@jest/globals';
import { and, createSceneDef, flag, not, TRUE, type ConditionExpr } from '@las-flores/api-contracts';
import { createFlagEdges, extractFlagUsage, validateFlagReferences } from './flag-tracking.js';
import type { EntityPayload } from './flag-tracking.js';

const scene = (availability: ConditionExpr = TRUE) =>
  createSceneDef({
    id: 'c3000000-0000-4000-8000-000000000010',
    slug: 'vq_airport_gate',
    title: 'Airport gate',
    description: '',
    location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    availability,
  });

describe('extractFlagUsage for a SceneDef (SC-310)', () => {
  test('reads = flags in availability, via extractFlagSlugs; sets stays empty', () => {
    const usage = extractFlagUsage(scene(and([flag('vq_gave_space', true), not(flag('vq_pushed_away', true))])));
    expect(usage.reads.map((r) => r.flag)).toEqual(['vq_gave_space', 'vq_pushed_away']);
    expect(usage.reads.every((r) => r.choiceId === undefined)).toBe(true);
    // A scene carries no effects yet; when it gains them this assertion is the reminder.
    expect([...usage.sets]).toEqual([]);
    expect(usage.writes).toEqual([]);
  });

  test('TRUE availability reads nothing', () => {
    expect(extractFlagUsage(scene())).toEqual({ sets: new Set(), writes: [], reads: [] });
  });

  test('createFlagEdges projects requires_flag edges from the scene_def entity', () => {
    // `scene_def`, not `scene`: bare "scene" means the legacy location row (SC-S12).
    expect(createFlagEdges(scene(flag('vq_gave_space', true)))).toEqual([
      {
        from_type: 'scene_def',
        from_slug: 'vq_airport_gate',
        edge_kind: 'requires_flag',
        to_type: 'flag',
        to_slug: 'vq_gave_space',
        attrs: {},
      },
    ]);
  });

  test('validateFlagReferences reports an unknown availability flag', () => {
    expect(validateFlagReferences(scene(flag('vq_typo', true)), ['vq_gave_space'])).toEqual({
      valid: false,
      missing: ['vq_typo'],
    });
  });
});

describe('existing EntityPayload extraction is unchanged (SC-310 regression)', () => {
  const dialogue: EntityPayload = {
    id: 'dialogue_vq_endings',
    type: 'dialogue',
    conditions: flag('met_vq', true),
    effects: { flag_set: [{ flag: 'vq_gave_space', value: true }] },
    children: [
      {
        id: 'choice_a',
        type: 'choice',
        conditions: flag('trust_high', true),
        effects: { flag_clear: ['vq_gave_space'] },
      },
      { id: 'choice_b', type: 'choice', conditions: flag('trust_high', true) },
    ],
  };

  test('usage shape', () => {
    expect(extractFlagUsage(dialogue)).toEqual({
      sets: new Set(['vq_gave_space']),
      writes: [
        { flag: 'vq_gave_space', value: true, entityId: 'dialogue_vq_endings', entityType: 'dialogue' },
        { flag: 'vq_gave_space', value: false, entityId: 'choice_a', entityType: 'choice' },
      ],
      reads: [
        { flag: 'met_vq', choiceId: undefined },
        { flag: 'trust_high', choiceId: 'choice_a' },
        { flag: 'trust_high', choiceId: 'choice_b' },
      ],
    });
  });

  test('edges keep their entity type and per-choice attribution', () => {
    const edges = createFlagEdges(dialogue);
    expect(edges.map((e) => [e.from_type, e.from_slug, e.edge_kind, e.to_slug, e.attrs])).toEqual([
      ['dialogue', 'dialogue_vq_endings', 'requires_flag', 'met_vq', {}],
      ['dialogue', 'dialogue_vq_endings', 'requires_flag', 'trust_high', { choice_id: 'choice_a' }],
      ['dialogue', 'dialogue_vq_endings', 'requires_flag', 'trust_high', { choice_id: 'choice_b' }],
      ['dialogue', 'dialogue_vq_endings', 'sets_flag', 'vq_gave_space', { value: true }],
      ['choice', 'choice_a', 'clears_flag', 'vq_gave_space', { value: false }],
    ]);
  });
});
