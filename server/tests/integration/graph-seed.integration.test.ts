import { beforeAll, afterAll, describe, test, expect } from '@jest/globals';
import { GraphDeltaSchema, type GraphEdge } from '@las-flores/shared';

// M27 — graph authoring substrate integration test.
//
// Part A (always): the seed DATA SOURCE contract — `gatherBaseGraphData()` reads
// the migrated content store (DB + location YAML) into well-formed nodes/edges.
//
// Part B (optionally Neo4j-backed): when NEO4J_ENABLED=true AND Neo4j is
// reachable, exercise the real substrate end-to-end with dedicated synthetic
// UUIDs (base upsert → delta write → merged view → impact traversal → cleanup).
// When the graph is off/unreachable these tests soft-skip (no real connections).

import {
  isNeo4jEnabled,
  verifyNeo4j,
  closeNeo4j,
  runNeo4jQuery,
} from '../../src/services/Neo4jClient.js';
import {
  ensureGraphConstraints,
  upsertContentNode,
  upsertContentRelationship,
  countContentNodes,
  hasContentNode,
} from '../../src/services/GraphBaseService.js';
import { applyDelta, getDeltasForPlan, clearDeltasForPlan } from '../../src/services/GraphDeltaService.js';
import { getMergedView, getImpactAnalysis, detectCycles } from '../../src/services/GraphQueryService.js';
import { gatherBaseGraphData } from '../../src/services/GraphSeedSource.js';

// Dedicated synthetic UUIDs — never collide with content entities or sibling tests.
const PLAN_ID = 'e1000000-e29b-41d4-a716-446655440001';
const CHAR_A = 'e1000000-e29b-41d4-a716-446655440011';
const SCENE_B = 'e1000000-e29b-41d4-a716-446655440012';
const MISSION_C = 'e1000000-e29b-41d4-a716-446655440013';

let neo4jLive = false;

beforeAll(async () => {
  neo4jLive = isNeo4jEnabled() && (await verifyNeo4j());
  if (!neo4jLive) return;
  await cleanupNeo4j();
  await ensureGraphConstraints();
  // A minimal synthetic canon: Character A appears in Scene B.
  await upsertContentNode({ nodeType: 'Character', nodeId: CHAR_A, name: 'Original A', canonicalFields: { role: 'npc' } });
  await upsertContentNode({ nodeType: 'Scene', nodeId: SCENE_B, name: 'Scene B', canonicalFields: { district: 'Downtown' } });
  await upsertContentRelationship({
    sourceNodeType: 'Character', sourceNodeId: CHAR_A,
    targetNodeType: 'Scene', targetNodeId: SCENE_B, type: 'APPEARS_IN',
  } as GraphEdge);
});

afterAll(async () => {
  if (neo4jLive) await cleanupNeo4j();
  await closeNeo4j();
});

async function cleanupNeo4j(): Promise<void> {
  await runNeo4jQuery(`MATCH (d:ContentDelta { planId: $planId }) DETACH DELETE d`, { planId: PLAN_ID });
  await runNeo4jQuery(
    `MATCH (c:Content) WHERE c.nodeId IN $ids DETACH DELETE c`,
    { ids: [CHAR_A, SCENE_B, MISSION_C] },
  );
}

describe('graph seed source (DB-backed, always)', () => {
  test('gatherBaseGraphData returns well-formed nodes + edges from the content store', async () => {
    const data = await gatherBaseGraphData();
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
    for (const node of data.nodes) {
      expect(typeof node.nodeType).toBe('string');
      expect(typeof node.nodeId).toBe('string');
      expect(node.nodeId.length).toBeGreaterThan(0);
    }
    for (const edge of data.edges) {
      expect(edge).toMatchObject({
        sourceNodeType: expect.any(String),
        sourceNodeId: expect.any(String),
        targetNodeType: expect.any(String),
        targetNodeId: expect.any(String),
        type: expect.any(String),
      });
    }
  });
});

describe('graph authoring (Neo4j-backed, optional)', () => {
  test('base upsert is idempotent and keyed on (nodeType,nodeId)', async () => {
    if (!neo4jLive) return;
    const before = await countContentNodes();
    // Re-upsert the same node — no new node should appear.
    await upsertContentNode({ nodeType: 'Character', nodeId: CHAR_A, name: 'Original A', canonicalFields: { role: 'npc' } });
    expect(await hasContentNode('Character', CHAR_A)).toBe(true);
    expect(await countContentNodes()).toBe(before);
  });

  test('impact analysis returns 1-hop neighbors', async () => {
    if (!neo4jLive) return;
    const impact = await getImpactAnalysis('Character', CHAR_A);
    expect(impact.target?.nodeId).toBe(CHAR_A);
    expect(impact.outgoing.some((e) => e.targetNodeId === SCENE_B && e.type === 'APPEARS_IN')).toBe(true);
    expect(impact.neighbors.some((n) => n.nodeId === SCENE_B)).toBe(true);
  });

  test('delta write + merged-view previews the post-approve state', async () => {
    if (!neo4jLive) return;
    await applyDelta(GraphDeltaSchema.parse({
      id: 'e1000000-e29b-41d4-a716-446655441001',
      planId: PLAN_ID,
      nodeType: 'Character',
      nodeId: CHAR_A,
      op: 'MODIFY',
      fields: { name: 'Modified A', personality: 'shrewd' },
      createdAt: new Date().toISOString(),
    }));
    await applyDelta(GraphDeltaSchema.parse({
      id: 'e1000000-e29b-41d4-a716-446655441002',
      planId: PLAN_ID,
      nodeType: 'Scene',
      nodeId: SCENE_B,
      op: 'DELETE',
      fields: {},
      createdAt: new Date().toISOString(),
    }));
    await applyDelta(GraphDeltaSchema.parse({
      id: 'e1000000-e29b-41d4-a716-446655441003',
      planId: PLAN_ID,
      nodeType: 'Mission',
      nodeId: MISSION_C,
      op: 'ADD',
      fields: { name: 'New Mission', description: 'fresh' },
      createdAt: new Date().toISOString(),
    }));

    const deltas = await getDeltasForPlan(PLAN_ID);
    expect(deltas).toHaveLength(3);
    expect(deltas.map((d) => d.op).sort()).toEqual(['ADD', 'DELETE', 'MODIFY']);

    const merged = await getMergedView(PLAN_ID);
    const byKey = new Map(merged.nodes.map((n) => [`${n.nodeType}:${n.nodeId}`, n]));
    // MODIFY shadow wins over base (only one node for Character A, new name).
    const modified = byKey.get(`Character:${CHAR_A}`);
    expect(modified).toBeDefined();
    expect(modified!.name).toBe('Modified A');
    expect(modified!.planId).toBe(PLAN_ID);
    // DELETE omits the scene.
    expect(byKey.has(`Scene:${SCENE_B}`)).toBe(false);
    // ADD introduces the new mission.
    expect(byKey.get(`Mission:${MISSION_C}`)?.name).toBe('New Mission');
    // Edge to the tombstoned scene is dropped.
    expect(merged.edges.some((e) => e.targetNodeId === SCENE_B)).toBe(false);
  });

  test('cycle detection reports a deliberate self-loop (bounded depth)', async () => {
    if (!neo4jLive) return;
    await runNeo4jQuery(
      `MATCH (a:Content { nodeId: $id }), (b:Content { nodeId: $id })
       MERGE (a)-[:DEPENDS_ON]->(b)`,
      { id: CHAR_A },
    );
    const cycles = await detectCycles('DEPENDS_ON', 8);
    expect(cycles.length).toBeGreaterThan(0);
  });

  test('clearDeltasForPlan removes every delta for the plan', async () => {
    if (!neo4jLive) return;
    await clearDeltasForPlan(PLAN_ID);
    expect(await getDeltasForPlan(PLAN_ID)).toHaveLength(0);
  });
});
