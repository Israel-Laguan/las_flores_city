import { describe, it, expect, jest } from '@jest/globals';
import { fillFields, mergeFilledFields } from '../../src/services/ContentFillService.js';
import type { ContentPlanItem } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext } from '../../src/services/types/LLMTypes.js';

const mockContext: ExistingContentContext = {
  characters: [
    { id: 'char-1', name: 'Diego', role: 'bartender', faction: 'independent', personality: 'gruff' },
    { id: 'char-2', name: 'Maria', role: 'fixer', faction: 'corpo', personality: 'cunning' },
  ],
  scenes: [
    { id: 'scene-1', name: 'Central Plaza', district: 'downtown', mood: 'bustling' },
  ],
  dialogues: [],
  missions: [],
  stories: [],
  overlays: [],
  locations: [
    { id: 'loc-1', name: 'The Neon Flask', district: 'downtown' },
  ],
};

function makeItem(overrides: Partial<ContentPlanItem> = {}): ContentPlanItem {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    type: 'character',
    action: 'create',
    name: 'Diego',
    slug: 'diego',
    fields: { description: 'TODO: Add description', metadata: { personality: 'TODO: Add personality' } },
    assetNeeds: [],
    dependsOn: [],
    ...overrides,
  };
}

function makeMockProvider(fillResponse: { fields: Record<string, string>; lore_refs?: string[] } = { fields: {} }): LLMProvider {
  return {
    parseDescription: jest.fn() as any,
    refinePlan: jest.fn() as any,
    generateLore: jest.fn() as any,
    generateFill: jest.fn(async () => fillResponse),
  };
}

describe('fillFields', () => {
  it('returns empty when no fill targets exist for the type', async () => {
    const item = makeItem({ type: 'map_tile' });
    const provider = makeMockProvider();
    const result = await fillFields(item, mockContext, provider);
    expect(result.fields).toEqual({});
  });

  it('returns empty when all fill targets already have values', async () => {
    const item = makeItem({
      fields: { description: 'A gruff bartender', metadata: { personality: 'gruff' } },
    });
    const provider = makeMockProvider();
    const result = await fillFields(item, mockContext, provider);
    expect(result.fields).toEqual({});
  });

  it('calls provider.generateFill with unfilled fields', async () => {
    const item = makeItem({
      fields: { description: 'TODO: Add description', metadata: { personality: 'TODO: Add personality' } },
    });
    const provider = makeMockProvider({
      fields: { description: 'A weathered bartender with a cybernetic arm', metadata: { personality: 'streetwise' } },
    });
    await fillFields(item, mockContext, provider);
    expect(provider.generateFill).toHaveBeenCalledTimes(1);
    const prompt = (provider.generateFill as jest.Mock).mock.calls[0][0] as string;
    expect(prompt).toContain('TODO');
  });

  it('filters response to only requested fields', async () => {
    const item = makeItem({
      fields: { description: 'TODO: Add description' },
    });
    const provider = makeMockProvider({
      fields: {
        description: 'Filled description',
        name: 'Should be filtered out', // not in fill targets for character
      },
    });
    const result = await fillFields(item, mockContext, provider);
    expect(result.fields.description).toBe('Filled description');
    expect(result.fields.name).toBeUndefined();
  });

  it('returns lore_refs from provider response', async () => {
    const item = makeItem({
      fields: { description: 'TODO: Add description' },
    });
    const provider = makeMockProvider({
      fields: { description: 'A bartender who knows secrets' },
      lore_refs: ['diego', 'neon_flask'],
    });
    const result = await fillFields(item, mockContext, provider);
    expect(result.lore_refs).toEqual(['diego', 'neon_flask']);
  });

  it('handles provider errors gracefully', async () => {
    const item = makeItem({
      fields: { description: 'TODO: Add description' },
    });
    const provider: LLMProvider = {
      parseDescription: jest.fn() as any,
      refinePlan: jest.fn() as any,
      generateLore: jest.fn() as any,
      generateFill: jest.fn(async () => { throw new Error('LLM error'); }),
    };
    await expect(fillFields(item, mockContext, provider)).rejects.toThrow('LLM error');
  });
});

describe('mergeFilledFields', () => {
  it('merges filled values into item fields', () => {
    const item = makeItem({
      fields: { description: 'TODO: Add description', metadata: { personality: 'TODO: Add personality' } },
    });
    mergeFilledFields(item, {
      description: 'A gruff bartender',
      'metadata.personality': 'streetwise',
    });
    expect(item.fields.description).toBe('A gruff bartender');
    expect(item.fields.metadata.personality).toBe('streetwise');
  });

  it('does not overwrite non-TODO values', () => {
    const item = makeItem({
      fields: { description: 'Already filled description', metadata: { personality: 'gruff' } },
    });
    mergeFilledFields(item, {
      description: 'Should not overwrite',
      'metadata.personality': 'Should not overwrite',
    });
    expect(item.fields.description).toBe('Already filled description');
    expect(item.fields.metadata.personality).toBe('gruff');
  });

  it('handles empty string values as fillable', () => {
    const item = makeItem({
      fields: { description: '' },
    });
    mergeFilledFields(item, { description: 'Filled from empty' });
    expect(item.fields.description).toBe('Filled from empty');
  });
});
