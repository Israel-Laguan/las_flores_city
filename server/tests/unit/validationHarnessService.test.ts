import { describe, it, expect } from '@jest/globals';
import type { ContentPlan } from '@las-flores/shared';
import type { ExistingContentContext } from '../../src/services/types/LLMTypes.js';
import { runValidationHarness } from '../../src/services/ValidationHarnessService.js';

const A = 'a0000000-e000-4000-8000-00000000000a';
const B = 'a0000000-e000-4000-8000-00000000000b';
const C = 'a0000000-e000-4000-8000-00000000000c';
const EXISTING_CHAR = 'a0000000-e000-4000-8000-0000000000e1';

function makePlan(overrides: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: 'a0000000-e000-4000-8000-000000000000',
    description: 'Harness test plan',
    items: [],
    links: [],
    status: 'draft',
    ...overrides,
  };
}

function makeContext(overrides: Partial<ExistingContentContext> = {}): ExistingContentContext {
  return {
    characters: [],
    scenes: [],
    dialogues: [],
    missions: [],
    overlays: [],
    locations: [],
    ...overrides,
  };
}

function item(overrides: Partial<ContentPlan['items'][number]> = {}): ContentPlan['items'][number] {
  return {
    id: A,
    type: 'character',
    action: 'create',
    name: 'Diego',
    slug: 'diego',
    fields: {},
    assetNeeds: [],
    dependsOn: [],
    ...overrides,
  };
}

describe('runValidationHarness', () => {
  it('passes when there are no error findings', () => {
    const plan = makePlan({ items: [item()] });
    const report = runValidationHarness(plan, makeContext());
    expect(report.passed).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  describe('duplicate_slug_or_name', () => {
    it('flags duplicate names within the plan as error', () => {
      const plan = makePlan({ items: [item(), item({ id: B, slug: 'diego2' })] });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(false);
      const dup = report.findings.find(f => f.code === 'duplicate_slug_or_name');
      expect(dup).toBeDefined();
      expect(dup!.severity).toBe('error');
    });

    it('flags duplicate slugs within the plan as error even when names differ', () => {
      // Two different names sharing a slug would collide on disk at staging time.
      const plan = makePlan({ items: [item({ name: 'Diego One', slug: 'diego' }), item({ id: B, name: 'Diego Two', slug: 'diego' })] });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(false);
      const dup = report.findings.find(f => f.code === 'duplicate_slug_or_name' && f.message.includes('slug'));
      expect(dup).toBeDefined();
      expect(dup!.severity).toBe('error');
    });

    it('flags a create item matching an existing same-type entity as error', () => {
      const plan = makePlan({ items: [item({ name: 'Alicia' })] });
      const context = makeContext({ characters: [{ id: EXISTING_CHAR, name: 'alicia' }] });
      const report = runValidationHarness(plan, context);
      expect(report.passed).toBe(false);
      const dup = report.findings.find(f => f.code === 'duplicate_slug_or_name');
      expect(dup).toBeDefined();
      expect(dup!.severity).toBe('error');
    });

    it('flags a create item matching a different-type existing entity as warning only', () => {
      const plan = makePlan({ items: [item({ name: 'Plaza' })] });
      const context = makeContext({ locations: [{ id: 'x', name: 'plaza' }] });
      const report = runValidationHarness(plan, context);
      // Warning only — must not block.
      expect(report.passed).toBe(true);
      const dup = report.findings.find(f => f.code === 'duplicate_slug_or_name');
      expect(dup).toBeDefined();
      expect(dup!.severity).toBe('warning');
    });

    it('downgrades a cross-type name match within the plan to warning (not error)', () => {
      // A character "Plaza" and a location "Plaza" legitimately coexist — no error.
      const plan = makePlan({ items: [
        item({ id: A, type: 'character', name: 'Plaza', slug: 'plaza_char' }),
        item({ id: B, type: 'location', name: 'Plaza', slug: 'plaza_loc' }),
      ] });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(true);
      const dup = report.findings.find(f => f.code === 'duplicate_slug_or_name');
      expect(dup).toBeDefined();
      expect(dup!.severity).toBe('warning');
    });

    it('does not flag update items that share a name (they write no new slug)', () => {
      const plan = makePlan({ items: [
        item({ id: A, action: 'update', name: 'Diego', slug: 'diego' }),
        item({ id: B, action: 'update', name: 'Diego', slug: 'diego2' }),
      ] });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(true);
      expect(report.findings.filter(f => f.code === 'duplicate_slug_or_name')).toHaveLength(0);
    });
  });

  describe('timeline_overlap', () => {
    it('flags related overlapping ranges as error', () => {
      const plan = makePlan({
        items: [
          item({ id: A, name: 'Diego', fields: { period: '2077-2078' } }),
          item({ id: B, name: 'Other', slug: 'other', fields: { period: '2077-2079' }, dependsOn: [A] }),
        ],
      });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(false);
      const o = report.findings.find(f => f.code === 'timeline_overlap');
      expect(o).toBeDefined();
      expect(o!.severity).toBe('error');
    });

    it('flags unrelated overlapping ranges as warning only', () => {
      const plan = makePlan({
        items: [
          item({ id: A, name: 'Diego', fields: { period: '2077-2078' } }),
          item({ id: B, name: 'Other', slug: 'other', fields: { period: '2077-2079' } }),
        ],
      });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(true);
      const o = report.findings.find(f => f.code === 'timeline_overlap');
      expect(o).toBeDefined();
      expect(o!.severity).toBe('warning');
    });
  });

  describe('foreign_key_integrity', () => {
    it('flags a dependsOn id that resolves to nothing as error', () => {
      const plan = makePlan({
        items: [item({ dependsOn: ['a0000000-e000-4000-8000-0000000000ff'] })],
      });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(false);
      const fk = report.findings.find(f => f.code === 'foreign_key_integrity');
      expect(fk).toBeDefined();
      expect(fk!.severity).toBe('error');
    });

    it('allows dependsOn referencing an existing entity', () => {
      const plan = makePlan({ items: [item({ name: 'Newcomer', slug: 'newcomer', dependsOn: [EXISTING_CHAR] })] });
      const context = makeContext({ characters: [{ id: EXISTING_CHAR, name: 'Diego' }] });
      const report = runValidationHarness(plan, context);
      expect(report.passed).toBe(true);
    });

    it('flags an overlay with an unknown target_tree_id as error', () => {
      const plan = makePlan({
        items: [
          item({
            id: A,
            type: 'overlay',
            slug: 'overlay_x',
            fields: { target_tree_id: 'a0000000-e000-4000-8000-0000000000aa' },
          }),
        ],
      });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(false);
      const fk = report.findings.find(f => f.code === 'foreign_key_integrity');
      expect(fk).toBeDefined();
      expect(fk!.severity).toBe('error');
    });

    it('flags an overlay targeting a planned non-dialogue item as error', () => {
      // target_tree_id is a FK to dialogue_trees — a planned character is not valid.
      const plan = makePlan({
        items: [
          item({ id: A, type: 'character', name: 'Diego', slug: 'diego' }),
          item({
            id: B,
            type: 'overlay',
            slug: 'overlay_y',
            fields: { target_tree_id: A },
          }),
        ],
      });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(false);
      const fk = report.findings.find(f => f.code === 'foreign_key_integrity');
      expect(fk).toBeDefined();
      expect(fk!.severity).toBe('error');
      expect(fk!.message).toContain('non-dialogue');
    });

    it('allows an overlay targeting a planned dialogue item', () => {
      const dialogueId = 'a0000000-e000-4000-8000-0000000000dd';
      const plan = makePlan({
        items: [
          item({ id: dialogueId, type: 'dialogue', name: 'Street Encounter', slug: 'street_encounter' }),
          item({ id: B, type: 'overlay', slug: 'overlay_z', fields: { target_tree_id: dialogueId } }),
        ],
      });
      const report = runValidationHarness(plan, makeContext());
      expect(report.findings.filter(f => f.code === 'foreign_key_integrity')).toHaveLength(0);
    });

    it('flags a scene referencing an unknown district as warning only', () => {
      const plan = makePlan({
        items: [
          item({ id: A, type: 'scene', slug: 'scene_x', fields: { district: 'Nowhere' } }),
        ],
      });
      const context = makeContext({ scenes: [{ id: 'x', name: 'Other', district: 'Plaza' }] });
      const report = runValidationHarness(plan, context);
      expect(report.passed).toBe(true);
      const fk = report.findings.find(f => f.code === 'foreign_key_integrity');
      expect(fk).toBeDefined();
      expect(fk!.severity).toBe('warning');
    });

  describe('ordering_succession', () => {
    it('flags a self-dependency as error', () => {
      const plan = makePlan({ items: [item({ dependsOn: [A] })] });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(false);
      const o = report.findings.find(f => f.code === 'ordering_succession');
      expect(o).toBeDefined();
      expect(o!.severity).toBe('error');
    });

    it('flags a dependency cycle as error', () => {
      const plan = makePlan({
        items: [
          item({ id: A, dependsOn: [B] }),
          item({ id: B, slug: 'b', dependsOn: [C] }),
          item({ id: C, slug: 'c', dependsOn: [A] }),
        ],
      });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(false);
      const o = report.findings.find(f => f.code === 'ordering_succession');
      expect(o).toBeDefined();
      expect(o!.severity).toBe('error');
    });

    it('allows a valid DAG', () => {
      const plan = makePlan({
        items: [
          item({ id: A, name: 'Diego', dependsOn: [] }),
          item({ id: B, name: 'B', slug: 'b', dependsOn: [A] }),
          item({ id: C, name: 'C', slug: 'c', dependsOn: [B] }),
        ],
      });
      const report = runValidationHarness(plan, makeContext());
      expect(report.passed).toBe(true);
      expect(report.findings.some(f => f.code === 'ordering_succession')).toBe(false);
    });
  });
  });
});