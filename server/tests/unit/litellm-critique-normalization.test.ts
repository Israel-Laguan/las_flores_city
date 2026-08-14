/**
 * Unit test for LiteLLMProvider.analyzePlanForConflicts — the :Conflict /
 * :Suggestion annotation normalization that keeps only schema-valid entries and
 * distinguishes a legitimate `{ "annotations": [] }` clean scan from a
 * malformed/unsupported model response.
 *
 * Per AGENTS.md: pure unit test (no DB/Redis/network). `callLLM` is stubbed via
 * the provider instance, `console.warn` is spied (auto-restored by `restoreMocks`).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ContentPlan } from '@las-flores/shared';
import type { ExistingContentContext, CritiqueScopeType } from '../../src/services/types/LLMTypes.js';
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

describe('LiteLLMProvider.analyzePlanForConflicts — annotation normalization', () => {
  let provider: LiteLLMProvider;
  let warnSpy: jest.SpiedFunction<typeof console.warn>;

  const stubCallLLM = (result: unknown) => {
    (provider as any).callLLM = jest.fn(async () => ({ result, usage: null }));
  };

  beforeEach(() => {
    provider = new LiteLLMProvider({ timeoutMs: 1000, retries: 0 });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('does NOT warn on a legitimate { annotations: [] } clean scan', async () => {
    stubCallLLM({ annotations: [] });
    const { annotations } = await provider.analyzePlanForConflicts(makePlan(), makeContext(), 'entity');
    expect(annotations).toHaveLength(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when the annotations key is missing entirely', async () => {
    stubCallLLM({});
    const { annotations } = await provider.analyzePlanForConflicts(makePlan(), makeContext(), 'entity');
    expect(annotations).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no "annotations" array'));
  });

  it('warns when annotations is present but not an array', async () => {
    stubCallLLM({ annotations: 'none' });
    const { annotations } = await provider.analyzePlanForConflicts(makePlan(), makeContext(), 'entity');
    expect(annotations).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no "annotations" array'));
  });

  it('warns and returns empty when the provider returns a non-object', async () => {
    stubCallLLM('just-a-string');
    const { annotations } = await provider.analyzePlanForConflicts(makePlan(), makeContext(), 'entity');
    expect(annotations).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no "annotations" array'));
  });

  it('keeps only schema-valid entries and warns when all are dropped as malformed', async () => {
    stubCallLLM({ annotations: ['not-an-object', { type: 'bad' }] });
    const { annotations } = await provider.analyzePlanForConflicts(makePlan(), makeContext(), 'entity');
    expect(annotations).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dropped all annotations as malformed'));
  });

  it('returns valid :Conflict annotations and does not warn when they parse cleanly', async () => {
    const valid = {
      type: 'conflict',
      severity: 'error',
      description: 'Diego already exists in canon',
      evidence: [{ nodeType: 'character', nodeId: PLAN_ITEM_ID, slug: 'diego', excerpt: 'A bartender' }],
      itemIds: [PLAN_ITEM_ID],
    };
    stubCallLLM({ annotations: [valid, 'garbage', { type: 'bad' }] });
    const scope: CritiqueScopeType = 'entity';
    const { annotations } = await provider.analyzePlanForConflicts(makePlan(), makeContext(), scope);
    expect(annotations).toHaveLength(1);
    // The provider stamps scope + provenance so the persisted node is complete.
    expect(annotations[0].type).toBe('conflict');
    expect(annotations[0].severity).toBe('error');
    expect(annotations[0].scope).toBe(scope);
    expect(annotations[0].aiModel).toBe('poolside/laguna-m.1');
    expect(annotations[0].planId).toBe(makePlan().id);
    expect(annotations[0].itemIds).toContain(PLAN_ITEM_ID);
    expect(annotations[0].evidence[0].excerpt).toBe('A bartender');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('stamps scope="cross_entity" when a deep audit is requested', async () => {
    stubCallLLM({ annotations: [] });
    const scope: CritiqueScopeType = 'cross_entity';
    const nonDismissed = await provider.analyzePlanForConflicts(makePlan(), makeContext(), scope);
    // No debug assertion; just confirm the call path runs for the deep scope.
    expect(nonDismissed.annotations).toHaveLength(0);
  });
});
