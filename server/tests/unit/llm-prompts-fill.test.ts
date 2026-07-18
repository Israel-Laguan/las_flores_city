import { describe, it, expect } from '@jest/globals';
import { buildFillFieldsPrompt } from '../../src/services/LLMPrompts.js';
import type { ContentPlanItem } from '@las-flores/shared';
import type { ExistingContentContext } from '../../src/services/types/LLMTypes.js';

const mockContext: ExistingContentContext = {
  characters: [
    { id: 'char-1', name: 'Diego', role: 'bartender', faction: 'independent', personality: 'gruff' },
  ],
  scenes: [
    { id: 'scene-1', name: 'Central Plaza', district: 'downtown', mood: 'bustling' },
  ],
  dialogues: [],
  missions: [],
  stories: [],
  overlays: [],
  locations: [
    { id: 'loc-1', name: 'The Neon Flask', district: 'downtown', daytime: 'busy', nightlife: 'lively' },
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

describe('buildFillFieldsPrompt', () => {
  it('includes the item name and type', () => {
    const item = makeItem();
    const prompt = buildFillFieldsPrompt(item, ['description'], mockContext);
    expect(prompt).toContain('Diego');
    expect(prompt).toContain('character');
  });

  it('lists the target fields to fill', () => {
    const item = makeItem();
    const prompt = buildFillFieldsPrompt(item, ['description', 'metadata.personality'], mockContext);
    expect(prompt).toContain('description');
    expect(prompt).toContain('metadata.personality');
  });

  it('includes existing content context', () => {
    const item = makeItem();
    const prompt = buildFillFieldsPrompt(item, ['description'], mockContext);
    expect(prompt).toContain('Diego');
    expect(prompt).toContain('bartender');
    expect(prompt).toContain('Central Plaza');
    expect(prompt).toContain('downtown');
  });

  it('includes current item fields', () => {
    const item = makeItem({ fields: { description: 'TODO: Add description' } });
    const prompt = buildFillFieldsPrompt(item, ['description'], mockContext);
    expect(prompt).toContain('TODO: Add description');
  });

  it('requests JSON output format', () => {
    const item = makeItem();
    const prompt = buildFillFieldsPrompt(item, ['description'], mockContext);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('fields');
    expect(prompt).toContain('lore_refs');
  });

  it('provides type-specific writing instructions', () => {
    const sceneItem = makeItem({ type: 'scene', name: 'Plaza' });
    const prompt = buildFillFieldsPrompt(sceneItem, ['description', 'mood'], mockContext);
    expect(prompt).toContain('atmospheric');
    expect(prompt).toContain('sensory');
  });
});
