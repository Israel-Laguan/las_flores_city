import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GraphDeltaSchema } from '@las-flores/shared';
import type { GraphDelta } from '@las-flores/shared';

// M50d — annotation-reply amend parity regression tests.
//
// The `plan:amend --annotation` CLI path must behave like the free-form
// `--instruction` path (GraphIntakeService.amendPlanWithInstruction):
//   1. pass existing deltas to propose so the mock remake logic / real-LLM
//      "Current plan deltas" block sees the plan being amended;
//   2. recompute semantic-concern notes (mock_provider/duplicate/ungrounded)
//      instead of leaving the concern surface blank after a reply.
//
// Unit-test seams (AGENTS.md: no real DB/Redis/Neo4j in unit tests).
jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(async () => ({ rows: [] })),
  queryContent: jest.fn(async () => ({ rows: [] })),
  withOLTPTransaction: jest.fn(async (fn: any) => fn({ query: jest.fn(async () => ({ rows: [] })) })),
  getCache: jest.fn(async () => null),
  setCache: jest.fn(async () => undefined),
  deleteCache: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/Neo4jClient.js', () => ({
  isNeo4jEnabled: jest.fn(() => false),
  runNeo4jQuery: jest.fn(async () => []),
  runNeo4jTransaction: jest.fn(async (fn: any) => fn({})),
}));

jest.mock('../../src/services/ChatService.js', () => ({
  chatService: {
    propose: jest.fn(async () => ({ reply: '', deltas: [], deltaEdges: [], usage: null })),
    applyDeltas: jest.fn(async () => ({ appliedCount: 0, appliedEdgeCount: 0, diagnostics: [], mergedView: {} })),
  },
}));

const mockSemanticConcernNotes = jest.fn();
jest.mock('../../src/services/IntakeSemanticValidator.js', () => {
  const actual = jest.requireActual('../../src/services/IntakeSemanticValidator.js');
  return { ...actual, semanticConcernNotes: (...args: any[]) => (mockSemanticConcernNotes as any)(...args) };
});

import { MockProvider } from '../../src/services/MockProvider.js';

const PLAN_ID = '00000000-0000-4000-8000-000000000000';

function diegoDelta(): GraphDelta {
  return GraphDeltaSchema.parse({
    id: 'd3200050-0000-4000-8000-000000000050',
    planId: PLAN_ID,
    nodeType: 'Character',
    nodeId: 'diego',
    op: 'ADD',
    fields: { name: 'Diego el Mock', role: 'bartender' },
    createdAt: new Date().toISOString(),
  });
}

const comment = [{ role: 'user' as const, content: 'Rename to Camila Reyes, a fixer, not Diego' }];
const emptyContext: any = { characters: [], scenes: [], locations: [], districts: [], dialogues: [], missions: [] };

describe('M50d annotation-reply parity', () => {
  beforeEach(() => {
    mockSemanticConcernNotes.mockReset();
  });

  it('MockProvider WITHOUT existingDeltas ignores the comment (byte-identical fallback path)', async () => {
    const provider = new MockProvider();
    // Collision-avoidance comment: dedicated synthetic plan UUID, no shared fixtures.
    const result = await provider.chatPropose(PLAN_ID, comment, emptyContext, undefined, 'desc', undefined);
    expect(result.deltas).toHaveLength(1);
    // Hardcoded fallback: still Diego the bartender — the operator's "rename to
    // Camila Reyes, a fixer" comment never lands (the M50d live-run symptom).
    expect(result.deltas[0].nodeId).toBe('diego');
    expect((result.deltas[0].fields as any)?.name).toBe('Diego el Mock');
    expect((result.deltas[0].fields as any)?.role).toBe('bartender');
    expect(String((result.deltas[0].fields as any)?.name ?? '')).not.toMatch(/camila/i);
  });

  it('MockProvider WITH existingDeltas remakes the plan-local delta in place (comment lands)', async () => {
    const provider = new MockProvider();
    const existing = [diegoDelta()];
    const result = await provider.chatPropose(PLAN_ID, comment, emptyContext, undefined, 'desc', existing);
    expect(result.deltas).toHaveLength(1);
    // Same nodeId so applyDelta MERGEs in place — fields actually change.
    expect(result.deltas[0].nodeId).toBe('diego');
    expect(result.deltas[0].op).toBe('MODIFY');
    expect((result.deltas[0].fields as any)?.role).toContain('remade');
  });

  it('semanticNotesForPlan is reachable from the CLI layer and returns semantic notes', async () => {
    const canned: any[] = [{
      nodeType: 'Character', nodeId: 'diego', status: 'info',
      raw: 'mock-provider transparency', kind: 'mock_provider',
      reason: 'mock', suggestion: '', candidates: [],
    }];
    mockSemanticConcernNotes.mockResolvedValue(canned);
    const { GraphIntakeService } = await import('../../src/services/GraphIntakeService.js');
    const service = new GraphIntakeService();
    expect(typeof service.semanticNotesForPlan).toBe('function');
    const input = [diegoDelta()];
    const notes = await service.semanticNotesForPlan('some description', input);
    expect(mockSemanticConcernNotes).toHaveBeenCalledTimes(1);
    expect(mockSemanticConcernNotes).toHaveBeenCalledWith(expect.objectContaining({
      description: 'some description',
      deltas: input,
    }));
    expect(notes).toEqual(canned);
  });

  it('run_plan_amend.ts wires both parity args (existingDeltas → propose, semanticNotes → triageAndAnnotate)', () => {
    // Source-level wiring guard: the annotation-reply branch lives in a CLI
    // script whose main() needs live DB/Neo4j, so assert the call sites pass
    // the same args the instruction path does.
    const src = readFileSync(path.resolve(__dirname, '../../scripts/run_plan_amend.ts'), 'utf8');
    // 5-arg propose including existing.deltas…
    expect(src).toMatch(/getPlanDeltas\(options\.planId\)[\s\S]*?chatService\.propose\(\s*options\.planId,[\s\S]*?existing\.deltas,?\s*\)/);
    // …and 4-arg triageAndAnnotate including semanticNotes.
    expect(src).toMatch(/semanticNotesForPlan\([\s\S]*?graph\.deltas,?\s*\)[\s\S]*?triageAndAnnotate\(options\.planId,\s*graph\.deltas,\s*amendmentDiagnostics,\s*semanticNotes\)/);
  });
});
