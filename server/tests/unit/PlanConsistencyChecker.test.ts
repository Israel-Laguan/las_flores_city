import { describe, it, expect } from '@jest/globals';
import type { GraphDelta, GraphDeltaEdge } from '@las-flores/shared';
import {
  PlanConsistencyChecker,
  type CanonicalGraphView,
} from '../../src/services/PlanConsistencyChecker.js';

interface DistrictDef {
  name: string;
  aliases: string[];
  nodeId: string;
}

class FakeView implements CanonicalGraphView {
  constructor(
    private readonly districts: DistrictDef[],
    private readonly nodes: Map<string, { name: string; fields: Record<string, unknown> }>,
  ) {}

  async getNode(nodeType: string, nodeId: string) {
    const n = this.nodes.get(`${nodeType}:${nodeId.toLowerCase()}`);
    if (!n) return null;
    return { nodeType, nodeId, name: n.name, fields: n.fields };
  }

  async resolveByName(nodeType: string, name: string) {
    if (nodeType === 'District') {
      const hit = this.districts.find(
        (d) => d.name.toLowerCase() === name.toLowerCase() || d.aliases.some((a) => a.toLowerCase() === name.toLowerCase()),
      );
      if (hit) return { nodeType, nodeId: hit.nodeId, name: hit.name };
      return null;
    }
    const n = this.nodes.get(`${nodeType}:${name.toLowerCase()}`);
    if (n) return { nodeType, nodeId: name, name: n.name };
    return null;
  }

  async hasNode(nodeType: string, nodeId: string) {
    return this.nodes.has(`${nodeType}:${nodeId.toLowerCase()}`);
  }

  async listDistrictNames() {
    return this.districts.map((d) => ({ name: d.name, aliases: d.aliases }));
  }
}

const DISTRICTS: DistrictDef[] = [
  { name: 'City District', aliases: ['El Centro'], nodeId: 'd-city' },
  { name: 'Industrial District', aliases: ['Industrial Zone'], nodeId: 'd-industrial' },
];

function node(nodeType: string, nodeId: string, fields: Record<string, unknown>) {
  return [`${nodeType}:${nodeId.toLowerCase()}`, { name: nodeId, fields }] as const;
}

function sceneDelta(district: string, description = ''): GraphDelta {
  return {
    id: '1',
    planId: 'p',
    nodeType: 'Scene',
    nodeId: 's-1',
    op: 'MODIFY',
    fields: { name: 'Rooftop', district, description },
    createdAt: new Date().toISOString(),
  } as GraphDelta;
}

const locEdge: GraphDeltaEdge = {
  planId: 'p',
  sourceNodeType: 'Scene',
  sourceNodeId: 's-1',
  targetNodeType: 'Location',
  targetNodeId: 'loc-1',
  type: 'SET_IN',
};

describe('PlanConsistencyChecker', () => {
  it('detects a location-district mismatch', async () => {
    const nodes = new Map<string, { name: string; fields: Record<string, unknown> }>([
      node('Location', 'loc-1', { district: 'Industrial District' }),
    ]);
    const checker = new PlanConsistencyChecker(new FakeView(DISTRICTS, nodes));
    const report = await checker.check('p', [sceneDelta('City District')], [locEdge]);

    expect(report.hasConflicts).toBe(true);
    const finding = report.findings.find((f) => f.code === 'location_district_mismatch');
    expect(finding).toBeDefined();
    expect(finding?.detail).toMatchObject({ sceneDistrict: 'City District', locationDistrict: 'Industrial District' });
  });

  it('detects a prose-vs-field district contradiction', async () => {
    const checker = new PlanConsistencyChecker(new FakeView(DISTRICTS, new Map()));
    const report = await checker.check(
      'p',
      [sceneDelta('City District', 'The Mercado Popular Las Flores in the Industrial Zone still thrives.')],
      [],
    );

    const finding = report.findings.find((f) => f.code === 'prose_district_contradiction');
    expect(finding).toBeDefined();
    expect(finding?.detail).toMatchObject({ setDistrict: 'City District', mentionedDistrict: 'industrial district' });
  });

  it('detects an orphan relationship', async () => {
    const checker = new PlanConsistencyChecker(new FakeView(DISTRICTS, new Map()));
    const report = await checker.check('p', [sceneDelta('City District')], [
      { ...locEdge, targetNodeId: 'ghost-loc' },
    ]);

    const finding = report.findings.find((f) => f.code === 'orphan_relationship');
    expect(finding).toBeDefined();
    expect(finding?.detail).toMatchObject({ targetNodeId: 'ghost-loc' });
  });

  it('produces an empty report for a clean, internally consistent plan', async () => {
    const nodes = new Map<string, { name: string; fields: Record<string, unknown> }>([
      node('Location', 'loc-1', { district: 'City District' }),
    ]);
    const checker = new PlanConsistencyChecker(new FakeView(DISTRICTS, nodes));
    const report = await checker.check('p', [sceneDelta('City District', 'A quiet rooftop.')], [locEdge]);

    expect(report.hasConflicts).toBe(false);
    expect(report.findings).toHaveLength(0);
  });

  it('prefers a Location MODIFY delta district over the stale canonical node', async () => {
    // The canonical Location still reports the OLD district, but this plan MODIFYs
    // it to the new one. The Scene names the new district, so there must be no
    // spurious mismatch warning from the stale canonical value.
    const nodes = new Map<string, { name: string; fields: Record<string, unknown> }>([
      node('Location', 'loc-1', { district: 'City District' }),
    ]);
    const locationModify: GraphDelta = {
      id: '2',
      planId: 'p',
      nodeType: 'Location',
      nodeId: 'loc-1',
      op: 'MODIFY',
      fields: { district: 'Industrial District' },
      createdAt: new Date().toISOString(),
    } as GraphDelta;
    const checker = new PlanConsistencyChecker(new FakeView(DISTRICTS, nodes));
    const report = await checker.check('p', [sceneDelta('Industrial District'), locationModify], [locEdge]);

    expect(report.findings.find((f) => f.code === 'location_district_mismatch')).toBeUndefined();
  });

  it('still flags a real mismatch when the delta district differs from the scene', async () => {
    const nodes = new Map<string, { name: string; fields: Record<string, unknown> }>([
      node('Location', 'loc-1', { district: 'City District' }),
    ]);
    const locationModify: GraphDelta = {
      id: '2',
      planId: 'p',
      nodeType: 'Location',
      nodeId: 'loc-1',
      op: 'MODIFY',
      fields: { district: 'City District' },
      createdAt: new Date().toISOString(),
    } as GraphDelta;
    const checker = new PlanConsistencyChecker(new FakeView(DISTRICTS, nodes));
    const report = await checker.check('p', [sceneDelta('Industrial District'), locationModify], [locEdge]);

    const finding = report.findings.find((f) => f.code === 'location_district_mismatch');
    expect(finding).toBeDefined();
    expect(finding?.detail).toMatchObject({ sceneDistrict: 'Industrial District', locationDistrict: 'City District' });
  });

  it('does not flag an orphan when the edge targets a plan-created ADD delta', async () => {
    // The target node does not exist in the canonical graph, but it is created by
    // this plan (op ADD). Rule C must treat delta-by-key targets as existing.
    const nodes = new Map<string, { name: string; fields: Record<string, unknown> }>();
    const newLocation: GraphDelta = {
      id: '3',
      planId: 'p',
      nodeType: 'Location',
      nodeId: 'loc-new',
      op: 'ADD',
      fields: { name: 'Dockside', district: 'City District' },
      createdAt: new Date().toISOString(),
    } as GraphDelta;
    const edgeToAdd: GraphDeltaEdge = {
      planId: 'p',
      sourceNodeType: 'Scene',
      sourceNodeId: 's-1',
      targetNodeType: 'Location',
      targetNodeId: 'loc-new',
      type: 'SET_IN',
    };
    const checker = new PlanConsistencyChecker(new FakeView(DISTRICTS, nodes));
    const report = await checker.check('p', [sceneDelta('City District'), newLocation], [edgeToAdd]);

    expect(report.findings.find((f) => f.code === 'orphan_relationship')).toBeUndefined();
    expect(report.hasConflicts).toBe(false);
  });

  it('still flags an orphan for a target absent from both canonical and delta set', async () => {
    const nodes = new Map<string, { name: string; fields: Record<string, unknown> }>();
    const checker = new PlanConsistencyChecker(new FakeView(DISTRICTS, nodes));
    const report = await checker.check('p', [sceneDelta('City District')], [locEdge]);

    const finding = report.findings.find((f) => f.code === 'orphan_relationship');
    expect(finding).toBeDefined();
    expect(finding?.detail).toMatchObject({ targetNodeType: 'Location', targetNodeId: 'loc-1' });
  });
});
