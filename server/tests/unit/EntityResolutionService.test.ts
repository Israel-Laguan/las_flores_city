import { describe, it, expect } from '@jest/globals';
import type { GraphDelta } from '@las-flores/shared';
import {
  EntityResolutionService,
  type CanonicalCandidate,
  type CandidateSource,
} from '../../src/services/EntityResolutionService.js';

function fakeSource(candidates: CanonicalCandidate[]): CandidateSource {
  return { listCandidates: async () => candidates };
}

const INDUSTRIAL = {
  nodeType: 'District',
  nodeId: 'd-industrial',
  name: 'Industrial District',
  aliasNames: ['Industrial Zone'],
} as CanonicalCandidate;

const CITY = {
  nodeType: 'District',
  nodeId: 'd-city',
  name: 'City District',
  aliasNames: ['El Centro'],
} as CanonicalCandidate;

describe('EntityResolutionService', () => {
  it('resolves an exact name match with confidence 1.0', async () => {
    const svc = new EntityResolutionService(fakeSource([INDUSTRIAL, CITY]));
    const block = await svc.resolve('Industrial District', { targetNodeType: 'District' });
    expect(block.status).toBe('resolved');
    expect(block.candidates[0].nodeId).toBe('d-industrial');
    expect(block.candidates[0].confidence).toBe(1);
  });

  it('resolves a fuzzy alias reference (typo) to the canonical node with confidence >= 0.9', async () => {
    const svc = new EntityResolutionService(fakeSource([INDUSTRIAL, CITY]));
    const block = await svc.resolve('Industrail Zone', { targetNodeType: 'District' });
    expect(block.status).toBe('resolved');
    expect(block.candidates[0].nodeId).toBe('d-industrial');
    expect(block.candidates[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('resolves via a curated alias (El Centro -> City District)', async () => {
    const svc = new EntityResolutionService(fakeSource([INDUSTRIAL, CITY]));
    const block = await svc.resolve('El Centro', { targetNodeType: 'District' });
    expect(block.status).toBe('resolved');
    expect(block.candidates[0].nodeId).toBe('d-city');
  });

  it('reports ambiguous when two candidates match comparably', async () => {
    const a = { nodeType: 'District', nodeId: 'd-riv-n', name: 'Riverside District' } as CanonicalCandidate;
    const b = { nodeType: 'District', nodeId: 'd-riv-s', name: 'Riverside Quarter' } as CanonicalCandidate;
    const svc = new EntityResolutionService(fakeSource([a, b]));
    const block = await svc.resolve('Riverside', { targetNodeType: 'District' });
    expect(block.status).toBe('ambiguous');
    expect(block.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('reports unresolved when nothing matches', async () => {
    const svc = new EntityResolutionService(fakeSource([INDUSTRIAL]));
    const block = await svc.resolve('Atlantis Metropolis', { targetNodeType: 'District' });
    expect(block.status).toBe('unresolved');
    expect(block.candidates.length).toBe(0);
  });

  it('graph-context disambiguation boosts a referenced neighbor over an equal match', async () => {
    const referenced = { nodeType: 'Location', nodeId: 'loc-1' };
    const linked = {
      nodeType: 'District',
      nodeId: 'd-riv-n',
      name: 'Riverside District',
      neighbors: [referenced],
    } as CanonicalCandidate;
    const other = {
      nodeType: 'District',
      nodeId: 'd-riv-s',
      name: 'Riverside Quarter',
    } as CanonicalCandidate;
    const svc = new EntityResolutionService(fakeSource([linked, other]));
    const refIds = new Set([`${referenced.nodeType}:${referenced.nodeId}`]);

    // Both candidates substring-match "Riverside" equally -> ambiguous.
    const alone = await svc.resolve('Riverside', { targetNodeType: 'District' });
    expect(alone.status).toBe('ambiguous');

    // With the neighbor referenced, the matching candidate is boosted to the top
    // and its confidence is raised above the unreferenced competitor.
    const withContext = await svc.resolve('Riverside', {
      targetNodeType: 'District',
      referencedNodeIds: refIds,
    });
    const boosted = withContext.candidates.find((c) => c.nodeId === 'd-riv-n')!;
    const competitor = withContext.candidates.find((c) => c.nodeId === 'd-riv-s')!;
    expect(boosted.confidence).toBeGreaterThan(competitor.confidence);
    expect(boosted.confidence).toBe(1);
    expect(withContext.candidates[0].nodeId).toBe('d-riv-n');
  });

  it('resolvePlanDeltas attaches _resolution to NL references and skips UUIDs', async () => {
    const svc = new EntityResolutionService(fakeSource([INDUSTRIAL, CITY]));
    const deltas: GraphDelta[] = [
      {
        id: '1',
        planId: 'p',
        nodeType: 'Scene',
        nodeId: 's-1',
        op: 'MODIFY',
        fields: { name: 'Rooftop', district: 'Industrial Zone' },
        createdAt: new Date().toISOString(),
      } as GraphDelta,
      {
        id: '2',
        planId: 'p',
        nodeType: 'Scene',
        nodeId: 's-2',
        op: 'ADD',
        fields: { name: 'Indoor', district: '11111111-1111-1111-1111-111111111111' },
        createdAt: new Date().toISOString(),
      } as GraphDelta,
      {
        id: '3',
        planId: 'p',
        nodeType: 'Character',
        nodeId: 'c-1',
        op: 'ADD',
        fields: { name: 'Mara' },
        createdAt: new Date().toISOString(),
      } as GraphDelta,
    ];

    const resolved = await svc.resolvePlanDeltas(deltas);
    expect(resolved[0]._resolution).toBeDefined();
    expect(resolved[0]._resolution?.[0].status).toBe('resolved');
    expect(resolved[0]._resolution?.[0].field).toBe('district');
    // UUID reference is skipped (already canonical identity)
    expect(resolved[1]._resolution).toBeUndefined();
    // Non-reference node type gets no resolution block
    expect(resolved[2]._resolution).toBeUndefined();
  });
});
