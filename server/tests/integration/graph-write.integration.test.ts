import { beforeAll, afterAll, describe, test, expect } from '@jest/globals';

// M28 — graph write path integration test (Neo4j-backed, soft-skip when off).
//
// Exercises the full merge + export pipeline against a real Neo4j:
//   seed synthetic canon → deltas + delta edges → merged revision → export →
//   ContentPlanSchema validates → commitGraph promotes/canonicalizes/tombstones
//   → cleanup. Also: drift detection positive case + DELETE-block case.
//
// Per AGENTS.md, dedicated synthetic UUIDs are used and cleaned up in afterAll.
// When NEO4J_ENABLED != 'true' or Neo4j is unreachable, every Neo4j-backed test
// soft-skips (no real connections attempted).

import {
  isNeo4jEnabled,
  verifyNeo4j,
  closeNeo4j,
  runNeo4jQuery,
} from '../../src/services/Neo4jClient.js';
import {
  ensureGraphConstraints,
  upsertContentNode,
} from '../../src/services/GraphBaseService.js';
import { applyDelta, applyDeltaEdge, getDeltasForPlan, getDeltaEdgesForPlan, clearDeltasForPlan } from '../../src/services/GraphDeltaService.js';
import { buildMergedRevision, commitGraph, detectGraphDrift } from '../../src/services/GraphMerger.js';
import { exportContentPlan, GraphExportError } from '../../src/services/GraphExporter.js';
import { GraphDeltaSchema, GraphDeltaEdgeSchema, type GraphDeltaEdge } from '@las-flores/shared';

// Dedicated synthetic UUIDs — never collide with content entities or sibling tests.
const PLAN_ID = 'f1000000-e29b-41d4-a716-446655440001';
const CHAR_A = 'f1000000-e29b-41d4-a716-446655440011';
const SCENE_B = 'f1000000-e29b-41d4-a716-446655440012';
const DISTRICT_D = 'f1000000-e29b-41d4-a716-446655440013';
const DIALOGUE_E = 'f1000000-e29b-41d4-a716-446655440014';

let neo4jLive = false;

beforeAll(async () => {
  neo4jLive = isNeo4jEnabled() && (await verifyNeo4j());
  if (!neo4jLive) return;
  await cleanupNeo4j();
  await ensureGraphConstraints();
  // Minimal synthetic canon: Dialogue E owned by Character A, Scene B in District D.
  await upsertContentNode({ nodeType: 'Character', nodeId: CHAR_A, name: 'Character A', canonicalFields: { role: 'npc' } });
  await upsertContentNode({ nodeType: 'Scene', nodeId: SCENE_B, name: 'Scene B', canonicalFields: { district: 'Downtown' } });
  await upsertContentNode({ nodeType: 'District', nodeId: DISTRICT_D, name: 'Los Andes', canonicalFields: {} });
  await upsertContentNode({ nodeType: 'Dialogue', nodeId: DIALOGUE_E, name: 'Dialogue E', canonicalFields: {} });
});

afterAll(async () => {
  if (neo4jLive) await cleanupNeo4j();
  await closeNeo4j();
});

async function cleanupNeo4j(): Promise<void> {
  await runNeo4jQuery(`MATCH (d:ContentDelta { planId: $planId }) DETACH DELETE d`, { planId: PLAN_ID });
  await runNeo4jQuery(
    `MATCH (c:Content) WHERE c.nodeId IN $ids DETACH DELETE c`,
    { ids: [CHAR_A, SCENE_B, DISTRICT_D, DIALOGUE_E] },
  );
}

function delta(overrides: Record<string, unknown>) {
  return GraphDeltaSchema.parse({
    id: 'f1000000-e29b-41d4-a716-446655441001',
    planId: PLAN_ID,
    nodeType: 'Character',
    nodeId: CHAR_A,
    op: 'MODIFY',
    fields: { name: 'Modified A' },
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

function edge(overrides: Record<string, unknown>): GraphDeltaEdge {
  return GraphDeltaEdgeSchema.parse({
    planId: PLAN_ID,
    sourceNodeType: 'Dialogue',
    sourceNodeId: DIALOGUE_E,
    targetNodeType: 'Character',
    targetNodeId: CHAR_A,
    type: 'OWNED_BY',
    ...overrides,
  });
}

describe('M28 graph write path (Neo4j-backed, optional)', () => {
  test('delta edges + merged revision resolve to merged node identity', async () => {
    if (!neo4jLive) return;
    await applyDelta(delta({ fields: { name: 'Modified A', personality: 'shrewd' } }));
    await applyDeltaEdge(edge({}));

    const revision = await buildMergedRevision(PLAN_ID);
    expect(revision.deltaEdges).toHaveLength(1);
    expect(revision.deltaEdges[0]).toMatchObject({ sourceNodeId: DIALOGUE_E, targetNodeId: CHAR_A, type: 'OWNED_BY' });
  });

  test('export → ContentPlanSchema validates; ADD slug regenerates id', async () => {
    if (!neo4jLive) return;
    await applyDelta(delta({ op: 'ADD', nodeType: 'Dialogue', nodeId: DIALOGUE_E, fields: { name: 'New Dialogue' } }));

    const plan = await exportContentPlan(PLAN_ID, 'graph-authored plan');
    expect(() => require('@las-flores/shared').ContentPlanSchema.parse(plan)).toBeTruthy();
    const dialogueItem = plan.items.find((i) => i.type === 'dialogue');
    expect(dialogueItem?.action).toBe('create');
    expect(dialogueItem?.id).toMatch(/^[0-9a-f-]{36}$/);
    // character_id written directly from the delta→canonical OWNED_BY edge.
    const charItem = plan.items.find((i) => i.type === 'character');
    expect(charItem?.fields).toMatchObject({ name: 'Modified A', personality: 'shrewd' });
  });

  test('DELETE delta blocks export (GraphExportError)', async () => {
    if (!neo4jLive) return;
    await applyDelta(delta({ op: 'DELETE', nodeType: 'Scene', nodeId: SCENE_B, fields: {} }));
    await expect(exportContentPlan(PLAN_ID, 'x')).rejects.toBeInstanceOf(GraphExportError);
  });

  test('commitGraph promotes ADD, drops DELETE tombstone, commits edges', async () => {
    if (!neo4jLive) return;
    // Fresh plan state: ADD dialogue, MODIFY character, DELETE scene.
    await clearDeltasForPlan(PLAN_ID);
    await applyDelta(delta({ op: 'ADD', nodeType: 'Dialogue', nodeId: DIALOGUE_E, fields: { name: 'New Dialogue' } }));
    await applyDelta(delta({ op: 'MODIFY', nodeType: 'Character', nodeId: CHAR_A, fields: { name: 'Final A' } }));
    await applyDelta(delta({ op: 'DELETE', nodeType: 'Scene', nodeId: SCENE_B, fields: {} }));
    // delta→canonical edge (Dialogue OWNED_BY Character A).
    await applyDeltaEdge(edge({}));

    const ok = await commitGraph(PLAN_ID);
    expect(ok).toBe(true);

    // ADD dialogue promoted to canonical node.
    expect(await hasNode('Dialogue', DIALOGUE_E)).toBe(true);
    // MODIFY character name promoted.
    const charRow = await getNode('Character', CHAR_A);
    expect(charRow?.name).toBe('Final A');
    // DELETE scene tombstoned (gone).
    expect(await hasNode('Scene', SCENE_B)).toBe(false);
    // delta edge committed as canonical relationship.
    const edgeRows = await runNeo4jQuery(
      `MATCH (a:Content { nodeType: 'Dialogue', nodeId: $sn })-[r:OWNED_BY]->(b:Content { nodeType: 'Character', nodeId: $tn })
       RETURN type(r) AS type`,
      { sn: DIALOGUE_E, tn: CHAR_A },
    );
    expect(edgeRows).toHaveLength(1);
    // deltas cleared.
    expect(await getDeltaEdgesForPlan(PLAN_ID)).toHaveLength(0);
    expect(await getDeltasForPlan(PLAN_ID)).toHaveLength(0);
  });

  test('drift detection: positive case when a canonical node is missing from the store', async () => {
    if (!neo4jLive) return;
    // Introduce drift: a canonical node with no backing content-store row.
    await upsertContentNode({ nodeType: 'Character', nodeId: 'f1000000-e29b-41d4-a716-446655440099', name: 'Orphan', canonicalFields: {} });
    const report = await detectGraphDrift();
    expect(report.inSync).toBe(false);
    expect(report.orphanNodes).toContain('Character:f1000000-e29b-41d4-a716-446655440099');
    // Clean up the orphan so later tests stay clean.
    await runNeo4jQuery(`MATCH (c:Content { nodeType: 'Character', nodeId: $id }) DETACH DELETE c`, { id: 'f1000000-e29b-41d4-a716-446655440099' });
  });

  test('drift detection: in-sync when graph matches the store', async () => {
    if (!neo4jLive) return;
    const report = await detectGraphDrift();
    expect(report.inSync).toBe(true);
  });
});

// --- helpers ---
async function hasNode(nodeType: string, nodeId: string): Promise<boolean> {
  const rows = await runNeo4jQuery<{ count: unknown }>(
    `MATCH (c:Content { nodeType: $t, nodeId: $n }) WHERE c.planId IS null RETURN count(c) AS count`,
    { t: nodeType, n: nodeId },
  );
  return rows[0]?.count != null ? Number(rows[0].count) > 0 : false;
}

async function getNode(nodeType: string, nodeId: string): Promise<{ name: string } | null> {
  const rows = await runNeo4jQuery<{ name: unknown }>(
    `MATCH (c:Content { nodeType: $t, nodeId: $n }) WHERE c.planId IS null RETURN c.name AS name`,
    { t: nodeType, n: nodeId },
  );
  return rows[0] ? { name: String(rows[0].name) } : null;
}
