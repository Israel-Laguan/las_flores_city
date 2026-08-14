import { describe, it, expect } from 'vitest';
import { addItemFromRoster, resolveItemIdentity } from '../hooks/useStoryBuilderMutations';
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

describe('resolveItemIdentity (M25)', () => {
  function ambiguousPlan(): ContentPlan {
    const plan = basePlan();
    plan.items[0] = {
      ...plan.items[0],
      resolution: {
        status: 'ambiguous',
        entityType: 'character',
        alternatives: [
          { kind: 'existing', id: 'a1930000-1111-4111-8111-111111111111', name: 'a193 Alice' },
          { kind: 'new', name: 'new: Alice II' },
        ],
      },
    };
    return plan;
  }

  it('resolving to an existing entity marks the item update with a stable entity_id', () => {
    const plan = resolveItemIdentity(ambiguousPlan(), 0, {
      kind: 'existing',
      id: 'a1930000-1111-4111-8111-111111111111',
      name: 'a193 Alice',
    });
    const item = plan.items[0];
    expect(item.action).toBe('update');
    expect(item.entity_id).toBe('a1930000-1111-4111-8111-111111111111');
    expect(item.resolution?.status).toBe('matched');
  });

  it('resolving to a new variant keeps the item a create (no silent merge)', () => {
    const plan = resolveItemIdentity(ambiguousPlan(), 0, { kind: 'new', name: 'new: Alice II' });
    const item = plan.items[0];
    expect(item.action).toBe('create');
    expect(item.entity_id).toBeUndefined();
    expect(item.resolution?.status).toBe('new_candidate');
  });
});
