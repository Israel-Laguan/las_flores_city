/**
 * Unit test for LiteLLMProvider.analyzeIntakeConflicts — the conflict-list
 * normalization that distinguishes a legitimate `{ "conflicts": [] }` clean
 * scan from a malformed/unsupported model response.
 *
 * Per AGENTS.md: this is a pure unit test (no DB/Redis/network). `callLLM` is
 * stubbed via the provider instance, and `console.warn` is spied (auto-restored
 * by jest config `restoreMocks`).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ContentPlan } from '@las-flores/shared';
import type { ExistingContentContext } from '../../src/services/types/LLMTypes.js';
import { LiteLLMProvider } from '../../src/services/LiteLLMProvider.js';

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

describe('LiteLLMProvider.analyzeIntakeConflicts — conflict normalization', () => {
  let provider: LiteLLMProvider;
  let warnSpy: jest.SpiedFunction<typeof console.warn>;

  const stubCallLLM = (result: unknown) => {
    (provider as any).callLLM = jest.fn(async () => ({ result, usage: null }));
  };

  beforeEach(() => {
    provider = new LiteLLMProvider({ timeoutMs: 1000, retries: 0 });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('does NOT warn on a legitimate { conflicts: [] } clean scan', async () => {
    stubCallLLM({ conflicts: [] });
    const { conflicts } = await provider.analyzeIntakeConflicts(makePlan(), makeContext());
    expect(conflicts).toHaveLength(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when the conflicts key is missing entirely', async () => {
    stubCallLLM({});
    const { conflicts } = await provider.analyzeIntakeConflicts(makePlan(), makeContext());
    expect(conflicts).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no "conflicts" array'),
    );
  });

  it('warns when conflicts is present but not an array', async () => {
    stubCallLLM({ conflicts: 'none' });
    const { conflicts } = await provider.analyzeIntakeConflicts(makePlan(), makeContext());
    expect(conflicts).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no "conflicts" array'),
    );
  });

  it('keeps only schema-valid entries and warns when all are dropped as malformed', async () => {
    stubCallLLM({ conflicts: ['not-an-object', { type: 'bad' }] });
    const { conflicts } = await provider.analyzeIntakeConflicts(makePlan(), makeContext());
    expect(conflicts).toHaveLength(0);
    // The "dropped all entries as malformed" branch, not the "no array" branch.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('dropped all entries as malformed'),
    );
  });

  it('returns valid entries and does not warn when the array parses cleanly', async () => {
    const valid = {
      type: 'duplicate_name',
      severity: 'error',
      description: 'Name already in canon',
      relatedItems: [PLAN_ITEM_ID],
      relatedExisting: ['Alicia'],
    };
    stubCallLLM({ conflicts: [valid, 'garbage'] });
    const { conflicts } = await provider.analyzeIntakeConflicts(makePlan(), makeContext());
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].relatedItems).toContain(PLAN_ITEM_ID);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});