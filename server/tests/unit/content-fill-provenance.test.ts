import { describe, test, expect, jest } from '@jest/globals';
import type { ContentPlanItem, ExistingContentContext } from '@las-flores/shared';
import { ContentPlanItemSchema } from '@las-flores/shared';
import { fillFields, mergeFilledFields } from '../../src/services/ContentFillService.js';
import type { LLMProvider } from '../../src/services/types/LLMTypes.js';

const mockContext: ExistingContentContext = {
  characters: [],
  scenes: [],
  dialogues: [],
  missions: [],
  stories: [],
  overlays: [],
  locations: [],
};

function makeItem(fields: Record<string, any>): ContentPlanItem {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    type: 'character',
    action: 'create',
    name: 'Test Character',
    slug: 'test_character',
    fields,
    assetNeeds: [],
    dependsOn: [],
  };
}

function makeProvider(response: { fields: Record<string, string>; lore_refs?: string[] }): LLMProvider {
  return {
    parseDescription: jest.fn(),
    refinePlan: jest.fn(),
    generateLore: jest.fn(),
    generateStory: jest.fn(),
    generateFill: jest.fn(async () => response),
  } as unknown as LLMProvider;
}

describe('M14 fill pass: TODO -> filled transition + provenance', () => {
  test('fills TODO fields and records filled_fields provenance', async () => {
    const item = makeItem({ description: 'TODO: Add description', metadata: { personality: 'TODO: Add personality' } });
    const provider = makeProvider({
      fields: { description: 'A grizzled informant.', 'metadata.personality': 'cynical' },
      lore_refs: ['neon_flask'],
    });

    const result = await fillFields(item, mockContext, provider);
    mergeFilledFields(item, result.fields);

    // TODO values replaced with LLM output
    expect(item.fields.description).toBe('A grizzled informant.');
    expect(item.fields.metadata.personality).toBe('cynical');

    // Provenance recorded
    expect(item.filled_fields).toEqual(
      expect.arrayContaining(['description', 'metadata.personality'])
    );

    // Schema still valid with filled_fields present
    const parsed = ContentPlanItemSchema.parse(item);
    expect(parsed.filled_fields).toEqual(
      expect.arrayContaining(['description', 'metadata.personality'])
    );
  });

  test('does not overwrite non-TODO author-provided values', async () => {
    const item = makeItem({ description: 'Author-written bio', metadata: { personality: 'TODO: Add personality' } });
    const provider = makeProvider({
      fields: { description: 'LLM override attempt', 'metadata.personality': 'stoic' },
    });

    const result = await fillFields(item, mockContext, provider);
    mergeFilledFields(item, result.fields);

    expect(item.fields.description).toBe('Author-written bio'); // untouched
    expect(item.fields.metadata.personality).toBe('stoic'); // filled
    expect(item.filled_fields).toEqual(['metadata.personality']);
  });

  test('stagePlan-style fill leaves no remaining TODO placeholders for filled paths', async () => {
    const item = makeItem({ description: 'TODO: Add description', metadata: { personality: 'TODO: Add personality' } });
    const provider = makeProvider({
      fields: { description: 'Filled.', 'metadata.personality': 'wry' },
    });

    const result = await fillFields(item, mockContext, provider);
    mergeFilledFields(item, result.fields);

    expect(JSON.stringify(item.fields)).not.toContain('TODO');
  });
});
