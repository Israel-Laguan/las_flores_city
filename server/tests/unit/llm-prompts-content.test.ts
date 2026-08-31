import { describe, it, expect } from '@jest/globals';
import {
  buildOutlinePrompt,
  buildRefinementPrompt,
  buildItemScopedRefinementPrompt,
} from '../../src/services/LLMPrompts.js';
import type { ContentPlan, ExistingContentContext } from '@las-flores/shared';

describe('LLMPrompts — content assertions (GAP 5)', () => {
  const emptyContext: ExistingContentContext = {
    characters: [],
    scenes: [],
    dialogues: [],
    missions: [],
    overlays: [],
    locations: [],
  };

  it('buildOutlinePrompt includes the three story quality rules', () => {
    const prompt = buildOutlinePrompt(emptyContext);
    expect(prompt).toContain('Biography Check');
    expect(prompt).toContain('engage (help/ally)');
    expect(prompt).toContain('reject (walk away');
    expect(prompt).toContain('exploit (betrayal');
    expect(prompt).toContain('cyberpunk noir');
  });

  it('buildRefinementPrompt includes story quality rules', () => {
    const plan: ContentPlan = {
      id: 'p1',
      description: 'test',
      items: [],
      links: [],
      status: 'draft',
    };
    const prompt = buildRefinementPrompt(plan, 'Make it better', emptyContext);
    expect(prompt).toContain('player' + "'" + 's present involvement');
    expect(prompt).toContain('engage / reject / exploit');
    expect(prompt).toContain('cyberpunk noir');
  });

  it('buildItemScopedRefinementPrompt includes only selected items + do NOT modify instruction', () => {
    const plan: ContentPlan = {
      id: 'p1',
      description: 'test',
      items: [
        { id: 'i1', type: 'character', action: 'create', name: 'Alice', description: '', slug: 'alice', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: 'i2', type: 'scene', action: 'create', name: 'Bar', description: '', slug: 'bar', fields: {}, assetNeeds: [], dependsOn: [] },
      ],
      links: [],
      status: 'draft',
    };
    const selected = [plan.items[0]];
    const prompt = buildItemScopedRefinementPrompt(selected, plan, 'change name', emptyContext);
    expect(prompt).toContain('Do NOT modify any other items in the plan');
    expect(prompt).toContain('Alice');
    // Bar appears in the Other items section for cross-reference
    expect(prompt).toContain('Bar');
  });
});
