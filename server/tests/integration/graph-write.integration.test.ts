import { beforeAll, afterAll, afterEach, describe, test, expect } from '@jest/globals';

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
//
// Each test sets up its own deltas/edges (cleared in afterEach) so they do not
// depend on shared state. The baseline fixtures (canonical graph nodes + the
// matching content-store rows) keep `detectGraphDrift()` in-sync assertions
// meaningful.

import {
  isNeo4jEnabled,
  verifyNeo4j,
  closeNeo4j,
  runNeo4jQuery,
} from '../../src/services/Neo4jClient.js';
import { queryOLTP } from '@las-flores/infra';
import {
  ensureGraphConstraints,
  upsertContentNode,
  upsertContentRelationship,
} from '../../src/services/GraphBaseService.js';
import { applyDelta, applyDeltaEdge, getDeltasForPlan, getDeltaEdgesForPlan, clearDeltasForPlan } from '../../src/services/GraphDeltaService.js';
import { buildMergedRevision, commitGraph, detectGraphDrift } from '../../src/services/GraphMerger.js';
import { exportContentPlan, GraphExportError } from '../../src/services/GraphExporter.js';
import { GraphDeltaSchema, GraphDeltaEdgeSchema } from '@las-flores/shared';
import type { GraphDeltaEdge } from '@las-flores/shared';

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
  await insertSourceRows();
  // Minimal synthetic canon: Dialogue E owned by Character A, Scene B in District D.
  await seedBaselineGraph();
});

afterAll(async () => {
  if (neo4jLive) {
    await cleanupNeo4j();
    await deleteSourceRows();
  }
  await closeNeo4j();
});

// Reset plan deltas between tests so each test is self-contained.
afterEach(async () => {
  if (neo4jLive) await clearDeltasForPlan(PLAN_ID);
});

// Canonical graph nodes + edges matching the content-store rows, so the graph
// stays in sync with the store when no deltas are present.
async function seedBaselineGraph(): Promise<void> {
  await upsertContentNode({ nodeType: 'Character', nodeId: CHAR_A, name: 'Character A', canonicalFields: { role: 'npc' } });
  await upsertContentNode({ nodeType: 'Scene', nodeId: SCENE_B, name: 'Scene B', canonicalFields: { district: 'Downtown' } });
  await upsertContentNode({ nodeType: 'District', nodeId: DISTRICT_D, name: 'Los Andes', canonicalFields: {} });
  await upsertContentNode({ nodeType: 'Dialogue', nodeId: DIALOGUE_E, name: 'Dialogue E', canonicalFields: {} });
  await upsertContentRelationship({ sourceNodeType: 'Scene', sourceNodeId: SCENE_B, targetNodeType: 'District', targetNodeId: DISTRICT_D, type: 'IN_DISTRICT' });
  await upsertContentRelationship({ sourceNodeType: 'Dialogue', sourceNodeId: DIALOGUE_E, targetNodeType: 'Character', targetNodeId: CHAR_A, type: 'OWNED_BY' });
}

// Matching content-store rows so detectGraphDrift sees no orphan nodes.
// Dedicated synthetic UUIDs (f1…) avoid collisions with real content.
async function insertSourceRows(): Promise<void> {
  await queryOLTP(
    `INSERT INTO characters (id, name, description) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [CHAR_A, 'Character A', 'synthetic canon fixture'],
  );
  await queryOLTP(
    `INSERT INTO districts (id, name, slug, description) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [DISTRICT_D, 'Los Andes', 'los_andes', 'synthetic canon fixture'],
  );
  await queryOLTP(
    `INSERT INTO scenes (id, name, description, district_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [SCENE_B, 'Scene B', 'synthetic canon fixture', DISTRICT_D],
  );
  await queryOLTP(
    `INSERT INTO dialogue_trees (id, name, start_node_id, character_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [DIALOGUE_E, 'Dialogue E', 'root', CHAR_A],
  );
}

async function deleteSourceRows(): Promise<void> {
  await queryOLTP('DELETE FROM dialogue_trees WHERE id = $1', [DIALOGUE_E]);
  await queryOLTP('DELETE FROM scenes WHERE id = $1', [SCENE_B]);
  await queryOLTP('DELETE FROM districts WHERE id = $1', [DISTRICT_D]);
  await queryOLTP('DELETE FROM characters WHERE id = $1', [CHAR_A]);
}

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
    // Self-contained: ADD source delta (Dialogue E) + MODIFY target delta (Character A).
    await applyDelta(delta({ op: 'ADD', nodeType: 'Dialogue', nodeId: DIALOGUE_E, fields: { name: 'Dlg' } }));
    await applyDelta(delta({ op: 'MODIFY', nodeType: 'Character', nodeId: CHAR_A, fields: { name: 'Modified A', personality: 'shrewd' } }));
    await applyDeltaEdge(edge({}));

    const revision = await buildMergedRevision(PLAN_ID);
    expect(revision.deltaEdges).toHaveLength(1);
    expect(revision.deltaEdges[0]).toMatchObject({ sourceNodeId: DIALOGUE_E, targetNodeId: CHAR_A, type: 'OWNED_BY' });
  });

  test('export → ContentPlanSchema validates; ADD slug regenerates id', async () => {
    if (!neo4jLive) return;
    // Self-contained: Character target delta + Dialogue source delta + OWNED_BY edge.
    await applyDelta(delta({ op: 'MODIFY', nodeType: 'Character', nodeId: CHAR_A, fields: { name: 'Modified A', personality: 'shrewd' } }));
    await applyDelta(delta({ op: 'ADD', nodeType: 'Dialogue', nodeId: DIALOGUE_E, fields: { name: 'New Dialogue' } }));
    await applyDeltaEdge(edge({}));

    const plan = await exportContentPlan(PLAN_ID, 'graph-authored plan');
    expect(() => require('@las-flores/shared').ContentPlanSchema.parse(plan)).not.toThrow();
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
    // Re-establish the matched baseline (the commit test may have removed Scene B).
    await seedBaselineGraph();
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
