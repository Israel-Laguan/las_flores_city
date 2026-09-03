import { describe, it, expect, jest } from '@jest/globals';
import type { GraphDelta } from '@las-flores/shared';
import type { CanonicalCandidate, CandidateSource } from '../../src/services/EntityResolutionService.js';
import { PlanAwareCandidateSource } from '../../src/services/PlanAwareCandidateSource.js';

jest.mock('../../src/services/GraphDeltaService.js', () => ({
  getDeltasForPlan: jest.fn(async (): Promise<GraphDelta[]> => []),
}));

import { getDeltasForPlan } from '../../src/services/GraphDeltaService.js';

const mockedGetDeltas = getDeltasForPlan as jest.MockedFunction<typeof getDeltasForPlan>;

function fakeSource(candidates: CanonicalCandidate[]): CandidateSource {
  return { listCandidates: async () => candidates };
}

const PLAN_ID = 'c9600000-e000-4000-8000-0000000000c0';

describe('PlanAwareCandidateSource', () => {
  it('returns only canonical candidates when the plan has no deltas', async () => {
    mockedGetDeltas.mockResolvedValue([]);
    const inner = fakeSource([
      { nodeType: 'District', nodeId: 'd-city', name: 'City District' },
    ]);
    const src = new PlanAwareCandidateSource(PLAN_ID, inner);
    const out = await src.listCandidates();
    expect(out).toHaveLength(1);
    expect(out[0].nodeId).toBe('d-city');
  });

  it('appends plan-local deltas that are not in the canonical set', async () => {
    mockedGetDeltas.mockResolvedValue([
      { id: 'x', planId: PLAN_ID, nodeType: 'Character', nodeId: 'diego', op: 'ADD',
        fields: { name: 'Diego el Mock' }, createdAt: '2026-01-01T00:00:00Z' } as GraphDelta,
    ]);
    const inner = fakeSource([
      { nodeType: 'District', nodeId: 'd-city', name: 'City District' },
    ]);
    const src = new PlanAwareCandidateSource(PLAN_ID, inner);
    const out = await src.listCandidates();
    expect(out).toHaveLength(2);
    expect(out.some((c) => c.nodeId === 'diego' && c.nodeType === 'Character')).toBe(true);
  });

  it('de-dupes a plan-local delta whose nodeId already exists canonically', async () => {
    mockedGetDeltas.mockResolvedValue([
      { id: 'x', planId: PLAN_ID, nodeType: 'District', nodeId: 'd-city', op: 'MODIFY',
        fields: { name: 'City District' }, createdAt: '2026-01-01T00:00:00Z' } as GraphDelta,
    ]);
    const canonical = { nodeType: 'District', nodeId: 'd-city', name: 'City District' };
    const src = new PlanAwareCandidateSource(PLAN_ID, fakeSource([canonical]));
    const out = await src.listCandidates();
    expect(out).toHaveLength(1);
    expect(out[0].nodeId).toBe('d-city');
  });

  it('uses the delta nodeId as name when fields.name is absent', async () => {
    mockedGetDeltas.mockResolvedValue([
      { id: 'x', planId: PLAN_ID, nodeType: 'Scene', nodeId: 'rooftop_vigil', op: 'ADD',
        fields: {}, createdAt: '2026-01-01T00:00:00Z' } as GraphDelta,
    ]);
    const src = new PlanAwareCandidateSource(PLAN_ID, fakeSource([]));
    const out = await src.listCandidates();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ nodeType: 'Scene', nodeId: 'rooftop_vigil', name: 'rooftop_vigil' });
  });
});
