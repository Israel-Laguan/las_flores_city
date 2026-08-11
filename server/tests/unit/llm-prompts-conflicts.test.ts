import { describe, it, expect } from '@jest/globals';
import type { ContentPlan } from '@las-flores/shared';
import type { ExistingContentContext } from '../../src/services/types/LLMTypes.js';
import { buildIntakeConflictPrompt } from '../../src/services/LLMPrompts.js';
import { MockProvider } from '../../src/services/MockProvider.js';

const PLAN_ITEM_ID = 'a0000000-e000-4000-8000-00000000000a';

function makePlan(overrides: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: 'a0000000-e000-4000-8000-000000000000',
    description: 'Add a bartender named Diego',
    items: [
      {
        id: PLAN_ITEM_ID,
        type: 'character',
        action: 'create',
        name: 'Diego',
        slug: 'diego',
        fields: { title: 'Bartender' },
        assetNeeds: [],
        dependsOn: [],
      },
    ],
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

describe('buildIntakeConflictPrompt', () => {
  it('includes the proposed plan items and existing canon', () => {
    const context = makeContext({
      characters: [{ id: 'c1', name: 'Alicia' }],
      locations: [{ id: 'l1', name: 'The Plaza' }],
    });
    const prompt = buildIntakeConflictPrompt(makePlan(), context);

    expect(prompt).toContain('Diego');
    expect(prompt).toContain('Alicia');
    expect(prompt).toContain('The Plaza');
    expect(prompt).toContain('duplicate_name');
    expect(prompt).toContain('conflicts');
    expect(prompt).toContain(PLAN_ITEM_ID);
  });

  it('is deterministic for the same inputs', () => {
    const context = makeContext({ characters: [{ id: 'c1', name: 'Alicia' }] });
    const a = buildIntakeConflictPrompt(makePlan(), context);
    const b = buildIntakeConflictPrompt(makePlan(), context);
    expect(a).toBe(b);
  });
});

describe('MockProvider.analyzeIntakeConflicts', () => {
  it('returns no conflicts when the plan does not collide with canon', async () => {
    const provider = new MockProvider();
    const context = makeContext({ characters: [{ id: 'c1', name: 'Alicia' }] });
    const { conflicts, usage } = await provider.analyzeIntakeConflicts(makePlan(), context);
    expect(conflicts).toHaveLength(0);
    expect(usage).toBeNull();
  });

  it('flags a plan item whose name collides with existing canon', async () => {
    const provider = new MockProvider();
    const context = makeContext({ characters: [{ id: 'c1', name: 'Diego' }] });
    const { conflicts } = await provider.analyzeIntakeConflicts(makePlan(), context);
    expect(conflicts.length).toBeGreaterThan(0);
    const dup = conflicts.find(c => c.type === 'duplicate_name');
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe('error');
    expect(dup!.relatedItems).toContain(PLAN_ITEM_ID);
  });
});