/**
 * Unit test for LLMPrompts.buildSemanticCritiquePrompt — verifies that the
 * prompt includes plan items, existing canon context, crucially requires
 * evidence text excerpts, and produces different instructions for entity vs
 * cross_entity scope.
 */
import { describe, it, expect } from '@jest/globals';
import type { ContentPlan } from '@las-flores/shared';
import type { ExistingContentContext, CritiqueScopeType } from '../../src/services/types/LLMTypes.js';
import { buildSemanticCritiquePrompt } from '../../src/services/LLMPrompts.js';

function makePlan(overrides: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: 'a0000000-e000-4000-8000-000000000000',
    description: 'Add a bartender named Diego',
    items: [
      {
        id: 'b0000000-e000-4000-8000-000000000001',
        type: 'character',
        action: 'create',
        name: 'Diego',
        slug: 'diego',
        fields: { title: 'Bartender', description: 'A weathered bartender at the Neon Flask' },
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
    characters: [{ id: 'c1', name: 'Alicia' }],
    scenes: [],
    dialogues: [],
    missions: [],
    overlays: [],
    locations: [],
    ...overrides,
  };
}

describe('buildSemanticCritiquePrompt', () => {
  it('includes the plan items in the prompt', () => {
    const prompt = buildSemanticCritiquePrompt(makePlan(), makeContext(), 'entity');
    expect(prompt).toContain('Diego');
    expect(prompt).toContain('Bartender');
    expect(prompt).toContain('character');
  });

  it('includes existing canon context', () => {
    const prompt = buildSemanticCritiquePrompt(makePlan(), makeContext(), 'entity');
    expect(prompt).toContain('Alicia');
  });

  it('requires evidence excerpts for every annotation', () => {
    const prompt = buildSemanticCritiquePrompt(makePlan(), makeContext(), 'entity');
    expect(prompt).toContain('excerpt');
    // The prompt should explicitly require at least one excerpt per annotation
    expect(prompt).toMatch(/ALWAYS|must/);
  });

  it('includes distinct instruction for entity scope (per-item/local)', () => {
    const prompt = buildSemanticCritiquePrompt(makePlan(), makeContext(), 'entity');
    expect(prompt).toMatch(/PER-ENTITY|per-entity audit|per.entity/i);
  });

  it('includes distinct instruction for cross_entity scope', () => {
    const prompt = buildSemanticCritiquePrompt(makePlan(), makeContext(), 'cross_entity');
    expect(prompt).toMatch(/CROSS-ENTITY|cross.entity audit|cross.entity/i);
  });

  it('returns a JSON object only annotations format', () => {
    const prompt = buildSemanticCritiquePrompt(makePlan(), makeContext(), 'entity');
    expect(prompt).toContain('"annotations"');
    expect(prompt).toContain('"conflict"');
    expect(prompt).toContain('"suggestion"');
  });
});
