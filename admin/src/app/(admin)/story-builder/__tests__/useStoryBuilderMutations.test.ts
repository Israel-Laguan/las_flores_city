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
          { kind: 'existing', id: 'a1930000-1111-4111-8111-111111111111', name: 'a193 Alice', alias: 'Alice' },
          { kind: 'new', name: 'new: Alice II', exhausted: false },
        ],
      },
    };
    return plan;
  }

  it('resolving to an existing entity marks the item update with a stable entity_id and real alias', () => {
    const plan = resolveItemIdentity(ambiguousPlan(), 0, {
      kind: 'existing',
      id: 'a1930000-1111-4111-8111-111111111111',
      name: 'a193 Alice',
      alias: 'Alice',
    });
    const item = plan.items[0];
    expect(item.action).toBe('update');
    expect(item.entity_id).toBe('a1930000-1111-4111-8111-111111111111');
    expect(item.resolution?.status).toBe('matched');
    // Persist the entity's real canonical alias, not the picker display label.
    if (item.resolution?.status === 'matched') expect(item.resolution.alias).toBe('Alice');
  });

  it('refuses an existing alternative that carries no entity id', () => {
    expect(() =>
      resolveItemIdentity(ambiguousPlan(), 0, { kind: 'existing', id: '', name: 'a193 Alice', alias: 'Alice' }),
    ).toThrow(/missing its entity id/);
  });

  it('forces a new variant back to a create even when the item arrived as an update', () => {
    const source = ambiguousPlan();
    source.items[0] = { ...source.items[0], action: 'update' };
    const plan = resolveItemIdentity(source, 0, { kind: 'new', name: 'new: Alice II', exhausted: false });
    const item = plan.items[0];
    expect(item.action).toBe('create');
    expect(item.name).toBe('Alice II');
    expect(item.resolution?.status).toBe('new_candidate');
  });

  it('resolving to a new variant commits the chosen name and keeps the item a create (no silent merge)', () => {
    const plan = resolveItemIdentity(ambiguousPlan(), 0, { kind: 'new', name: 'new: Alice II', exhausted: false });
    const item = plan.items[0];
    expect(item.action).toBe('create');
    expect(item.entity_id).toBeUndefined();
    expect(item.resolution?.status).toBe('new_candidate');
    // The selected variant `Alice II` is what gets created (name + slug + metadata).
    expect(item.name).toBe('Alice II');
    expect(item.slug).toBe('alice_ii');
    if (item.resolution?.status === 'new_candidate') expect(item.resolution.suggestedName).toBe('Alice II');
  });

  it('clears a stale entity_id when the new-variant choice was previously matched', () => {
    // An ambiguous item that arrived as a resolved `update` carrying an old
    // stable entity_id must NOT keep that id once the author chooses a brand-new
    // variant — otherwise the new variant would be persisted with a foreign id.
    const source = ambiguousPlan();
    source.items[0] = {
      ...source.items[0],
      action: 'update',
      entity_id: 'a1930000-1111-4111-8111-111111111111',
    };
    const plan = resolveItemIdentity(source, 0, { kind: 'new', name: 'new: Alice II', exhausted: false });
    const item = plan.items[0];
    expect(item.action).toBe('create');
    expect(item.entity_id).toBeUndefined();
    expect(item.name).toBe('Alice II');
    expect(item.resolution?.status).toBe('new_candidate');
  });

  it('rejects an exhausted new-variant choice instead of committing a duplicate entity', () => {
    // An `exhausted` alternative is a human-readable "all variants in use"
    // notice, not a committable name. Committing it must throw so the admin
    // flow can never create a colliding entity.
    expect(() =>
      resolveItemIdentity(ambiguousPlan(), 0, {
        kind: 'new',
        name: 'new: Alice (all variants in use)',
        exhausted: true,
      }),
    ).toThrow(/all variants/i);
  });
});
