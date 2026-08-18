/**
 * Unit tests for the M29 chat provider methods — LiteLLMProvider.chatExplain /
 * chatPropose (normalization + server-side stamping + reject-and-refine) and the
 * MockProvider chat determinism.
 *
 * Per AGENTS.md: pure unit test (no DB/Redis/network). The `callLLMMessages`
 * core seam is stubbed on the provider instance, `console.warn` is spied
 * (auto-restored by `restoreMocks`), and env is pinned so the suite is
 * independent of the shell/CI environment.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ChatMessage, ConflictChatContext } from '@las-flores/shared';
import type { ExistingContentContext } from '../../src/services/types/LLMTypes.js';
import { LiteLLMProvider } from '../../src/services/LiteLLMProvider.js';
import { MockProvider } from '../../src/services/MockProvider.js';

const PLAN_ID = 'e0000000-e29b-41d4-a716-446655440001';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeContext(): ExistingContentContext {
  return { characters: [], scenes: [], dialogues: [], missions: [], overlays: [], locations: [] };
}

function makeMessages(): ChatMessage[] {
  return [
    { role: 'user', content: 'Resolve the duplicate character conflict.' },
    { role: 'assistant', content: 'I can propose a deltas edit.' },
  ];
}

function makeConflict(): ConflictChatContext {
  return {
    conflictId: 'e1000000-e29b-41d4-a716-446655440001',
    planId: PLAN_ID,
    type: 'conflict',
    severity: 'error',
    description: 'Diego collides with an existing canon character.',
    evidence: [{ nodeType: 'character', nodeId: 'e2000000-e29b-41d4-a716-446655440002', slug: 'diego', excerpt: 'A weathered bartender.' }],
    relatedEntities: [],
    aiModel: 'mock',
    detectedAt: new Date().toISOString(),
  };
}

describe('LiteLLMProvider.chatExplain', () => {
  let provider: LiteLLMProvider;

  beforeEach(() => {
    delete process.env.LLM_MODEL;
    delete process.env.LLM_CHAT_MAX_TOKENS;
    provider = new LiteLLMProvider({ timeoutMs: 1000, retries: 0 });
  });

  it('returns the free-form prose reply from the non-JSON path', async () => {
    const messages = makeMessages();
    let capturedOpts: { jsonMode?: boolean } | undefined;
    (provider as any).callLLMMessages = jest.fn(async (_sys?: string, _msgs?: unknown, opts?: { jsonMode?: boolean }) => {
      capturedOpts = opts;
      return { result: undefined, text: 'Here is the explanation.', usage: null };
    });

    const { reply, usage } = await provider.chatExplain(PLAN_ID, messages, makeContext(), makeConflict());
    expect(reply).toBe('Here is the explanation.');
    expect(usage).toBeNull();
    expect(capturedOpts?.jsonMode).toBe(false);
  });
}); // ends chatExplain

describe('LiteLLMProvider.chatPropose', () => {
  let provider: LiteLLMProvider;
  let warnSpy: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    delete process.env.LLM_MODEL;
    delete process.env.LLM_CHAT_MAX_TOKENS;
    provider = new LiteLLMProvider({ timeoutMs: 1000, retries: 0 });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('drops malformed deltas and server-side stamps id/planId/createdAt', async () => {
    const calls = jest.fn(async () => ({
      result: {
        reply: 'one valid delta',
        deltas: [
          'garbage',
          { nodeType: 'Character', nodeId: 'sarah', op: 'ADD', fields: { name: 'Sarah' } },
        ],
        deltaEdges: [],
      },
      usage: null,
    }));
    (provider as any).callLLMMessages = calls;

    const { deltas, reply } = await provider.chatPropose(PLAN_ID, makeMessages(), makeContext());
    expect(reply).toBe('one valid delta');
    expect(deltas).toHaveLength(1);
    expect(deltas[0].id).toMatch(UUID_RE);
    expect(deltas[0].planId).toBe(PLAN_ID);
    expect(deltas[0].nodeType).toBe('Character');
    expect(deltas[0].nodeId).toBe('sarah');
    expect(deltas[0].op).toBe('ADD');
    expect(Number.isNaN(Date.parse(deltas[0].createdAt))).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dropped 1 delta(s) / 0 edge(s) as schema-invalid'));
    expect(calls).toHaveBeenCalledTimes(1); // no refine needed on a clean valid set
  });

  it('reject-and-refine fires exactly once, then succeeds', async () => {
    const calls = jest.fn(async () => {
      if (calls.mock.calls.length === 1) {
        // First attempt: malformed (no valid deltas) → triggers the single retry.
        return { result: { reply: 'bad', deltas: [{ nodeType: 'Character', nodeId: 'nope' }], deltaEdges: [] }, usage: null };
      }
      return {
        result: { reply: 'good', deltas: [{ nodeType: 'Character', nodeId: 'sarah', op: 'ADD', fields: { name: 'Sarah' } }], deltaEdges: [] },
        usage: null,
      };
    });
    (provider as any).callLLMMessages = calls;

    const { deltas } = await provider.chatPropose(PLAN_ID, makeMessages(), makeContext());
    expect(calls).toHaveBeenCalledTimes(2); // exactly ONE refine retry
    expect(deltas).toHaveLength(1);

    // The refine retry carried the validation errors back to the model.
    const secondSys = calls.mock.calls[1]?.[0] as string;
    expect(secondSys).toContain('Previous attempt REJECTED');
  });

  it('degrades to empty deltas (without throwing) when both attempts are malformed', async () => {
    const calls = jest.fn(async () => ({
      result: { reply: 'nope', deltas: ['bad'], deltaEdges: [] },
      usage: null,
    }));
    (provider as any).callLLMMessages = calls;

    const { deltas, reply } = await provider.chatPropose(PLAN_ID, makeMessages(), makeContext());
    expect(calls).toHaveBeenCalledTimes(2);
    expect(deltas).toHaveLength(0);
    expect(reply).toContain('could not produce valid deltas');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('degrading to empty deltas'));
  });
});

describe('MockProvider chat determinism', () => {
  const mock = new MockProvider();

  it('chatExplain returns prose referencing the conflict + last user message', async () => {
    const messages = makeMessages();
    const { reply } = await mock.chatExplain(PLAN_ID, messages, makeContext(), makeConflict());
    expect(reply).toContain(PLAN_ID);
    expect(reply).toContain(makeConflict().description);
    expect(reply).toContain(messages[messages.length - 1].content);
  });

  it('chatPropose returns a schema-valid MODIFY delta on evidence[0] stamped with planId + model mock', async () => {
    const conflict = makeConflict();
    const { deltas, deltaEdges, reply } = await mock.chatPropose(PLAN_ID, makeMessages(), makeContext(), conflict);
    expect(deltaEdges).toHaveLength(0);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].op).toBe('MODIFY');
    expect(deltas[0].planId).toBe(PLAN_ID);
    expect(deltas[0].nodeId).toBe(conflict.evidence[0].nodeId);
    expect(deltas[0].nodeType).toBe('Character');
    expect(reply).toContain(PLAN_ID);
  });

  it('chatPropose falls back to an ADD delta with a slug nodeId when no evidence exists', async () => {
    const { deltas, deltaEdges } = await mock.chatPropose(PLAN_ID, makeMessages(), makeContext());
    expect(deltaEdges).toHaveLength(0);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].op).toBe('ADD');
    expect(deltas[0].planId).toBe(PLAN_ID);
    expect(deltas[0].nodeId).toBe('diego');
  });
});