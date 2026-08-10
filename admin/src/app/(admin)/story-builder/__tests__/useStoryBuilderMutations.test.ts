import { describe, it, expect } from 'vitest';
import { addItemFromRoster } from '../hooks/useStoryBuilderMutations';
import type { ContentPlan } from '@las-flores/shared';

function basePlan(): ContentPlan {
  return {
    id: 'p1',
    description: 'test',
    items: [
      {
        id: 'i1',
        type: 'character',
        action: 'create',
        name: 'Alice',
        description: 'A character',
        slug: 'alice',
        fields: {},
        assetNeeds: [],
        dependsOn: [],
      },
    ],
    links: [],
    status: 'draft',
  };
}

describe('addItemFromRoster (GAP 7)', () => {
  it('throws for unsupported roster type', () => {
    expect(() => addItemFromRoster(basePlan(), { name: 'X', type: 'unsupported' }))
      .toThrow('Unsupported roster type');
  });

  it('appends a new item for a supported type', () => {
    const plan = addItemFromRoster(basePlan(), { name: 'Bar', type: 'location' });
    expect(plan.items).toHaveLength(2);
    expect(plan.items[1].type).toBe('location');
    expect(plan.items[1].slug).toBe('bar');
  });

  it('deduplicates slug by appending numeric suffix', () => {
    const plan = addItemFromRoster(basePlan(), { name: 'Alice', type: 'character' });
    expect(plan.items).toHaveLength(2);
    expect(plan.items[1].slug).toBe('alice_2');
  });

  it('preserves plan immutability', () => {
    const original = basePlan();
    const plan = addItemFromRoster(original, { name: 'Bar', type: 'location' });
    expect(plan).not.toBe(original);
    expect(plan.items).not.toBe(original.items);
  });
});
