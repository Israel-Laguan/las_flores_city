// ============================================================
// graph-critique integration (M27-b) — a single optionally-Neo4j-backed
// critique run.
//
// Part A (always): the GraphCritiqueService singleton is well-formed (imports
// cleanly against real Postgres/Neo4j client modules).
//
// Part B (optionally Neo4j-backed): when NEO4J_ENABLED=true AND Neo4j is
// reachable, exercise the real graph end-to-end with dedicated synthetic UUIDs:
// analyze writes a (:Conflict) node with evidence + provenance linked
// -[:FLAGGED_IN]-> (:Content); re-analyze on an unchanged subgraph is cached
// from the graph; markAddressed sets status; clearAnnotations empties the plan.
// When the graph is off/unreachable these tests soft-skip (no real contacts).
//
// Isolation (AGENTS.md): dedicated synthetic UUIDs; test user/plan/annotations
// cleaned up in afterAll; schema DDL serialized via withSchemaLock.
// ============================================================

import { withSchemaLock } from '../helpers/schemaLock.js';
import { queryOLTP, closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';
import { AICritiqueService } from '../../src/services/AICritiqueService.js';
import { MockProvider } from '../../src/services/MockProvider.js';
import { graphCritiqueService } from '../../src/services/GraphCritiqueService.js';
import { isNeo4jEnabled, verifyNeo4j, closeNeo4j, runNeo4jQuery } from '../../src/services/Neo4jClient.js';
import { ensureGraphConstraints, upsertContentNode } from '../../src/services/GraphBaseService.js';
import type { ExistingContentContext } from '../../src/services/types/LLMTypes.js';

// --- Dedicated synthetic IDs (collision-avoidance per AGENTS.md) ---
const TEST_USER_ID = 'd0000000-3000-4000-8000-00000000be01';
const TEST_PLAN_ID = 'd0000000-3111-4111-8111-00000000be02';
const ITEM_ID = 'd0000000-3222-4111-8111-00000000be03';
const CHAR_ID = 'd0000000-3333-4111-8111-00000000be04';

const canonicName = 'CritiqueGraphEight';

const planJson = {
  id: TEST_PLAN_ID,
  description: 'M27-b graph-critique integration plan',
  status: 'draft',
  links: [],
  items: [
    {
      id: ITEM_ID,
      type: 'character',
      action: 'create',
      name: canonicName,
      slug: 'critique_graph_eight',
      description: 'A character that should collide with canon.',
      fields: { description: 'A character that should collide with canon.' },
      assetNeeds: [],
      dependsOn: [],
    },
  ],
};

// Fixed neighborhood: canon declares a character with the same name, so the mock
// 'create' item is flagged. Stable result + input hash regardless of DB churn.
const fixedNeighborhood: ExistingContentContext = {
  characters: [{ id: CHAR_ID, name: canonicName }],
  scenes: [],
  dialogues: [],
  missions: [],
  overlays: [],
  locations: [],
};

let neo4jLive = false;

beforeAll(async () => {
  // Ensure the 070 `critique_annotations` table exists regardless of whether the
  // migration runner has applied it yet (same pattern as ai-critique).
  await withSchemaLock(async (client) => {
    await client.query(
      `CREATE TABLE IF NOT EXISTS critique_annotations (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         type VARCHAR(20) NOT NULL CHECK (type IN ('conflict', 'suggestion')),
         severity VARCHAR(10) NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
         description TEXT NOT NULL,
         evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
         related_entities JSONB NOT NULL DEFAULT '[]'::jsonb,
         scope VARCHAR(20) NOT NULL DEFAULT 'entity'
           CHECK (scope IN ('entity', 'cross_entity', 'cross_mission')),
         ai_model VARCHAR(100) NOT NULL,
         input_hash VARCHAR(64) NOT NULL,
         status VARCHAR(20) NOT NULL DEFAULT 'open'
           CHECK (status IN ('open', 'addressed', 'dismissed')),
         plan_id UUID NOT NULL REFERENCES content_plans(id) ON DELETE CASCADE,
         item_ids TEXT[] DEFAULT '{}',
         created_at TIMESTAMPTZ DEFAULT NOW(),
         is_marker BOOLEAN NOT NULL DEFAULT FALSE
       )`,
    );
  });

  await queryOLTP(
    `INSERT INTO users (id, username, email, display_name, password_hash)
     VALUES ($1, 'graph_critique_t', 'graph_critique_t@example.com', 'Graph Critique', 'x')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID],
  );
  await queryOLTP(
    `INSERT INTO content_plans (id, description, plan_json, status, created_by)
     VALUES ($1, 'M27-b graph-critique integration', $2::jsonb, 'draft', $3)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_PLAN_ID, JSON.stringify(planJson), TEST_USER_ID],
  );

  neo4jLive = isNeo4jEnabled() && (await verifyNeo4j());
  if (!neo4jLive) return;
  await cleanupNeo4j();
  await ensureGraphConstraints();
  // A minimal canonical Character the mock's duplicate-name conflict references.
  await upsertContentNode({ nodeType: 'Character', nodeId: CHAR_ID, name: canonicName });
});

afterAll(async () => {
  await queryOLTP(`DELETE FROM critique_annotations WHERE plan_id = $1`, [TEST_PLAN_ID]).catch(() => {});
  await queryOLTP(`DELETE FROM content_plans WHERE id = $1`, [TEST_PLAN_ID]).catch(() => {});
  await queryOLTP(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID]).catch(() => {});
  if (neo4jLive) await cleanupNeo4j();
  await closeNeo4j();
  await closeConnections();
  await closeRedis();
});

async function cleanupNeo4j(): Promise<void> {
  await runNeo4jQuery(`MATCH (a:Conflict|Suggestion|CacheMarker) WHERE a.planId = $planId DETACH DELETE a`, { planId: TEST_PLAN_ID });
  await runNeo4jQuery(
    `MATCH (c:Content) WHERE c.nodeId IN $ids DETACH DELETE c`,
    { ids: [CHAR_ID, ITEM_ID] },
  );
}

describe('graph-critique contract (always)', () => {
  it('GraphCritiqueService singleton is constructed and imports cleanly', () => {
    expect(graphCritiqueService).toBeDefined();
    expect(typeof graphCritiqueService.markAddressed).toBe('function');
    expect(typeof graphCritiqueService.clearAnnotations).toBe('function');
  });
});

describe('graph-critique run (Neo4j-backed, optional)', () => {
  const service = new AICritiqueService(new MockProvider());

  it('analyze writes a (:Conflict) node with evidence + provenance and a :FLAGGED_IN edge', async () => {
    if (!neo4jLive) return;
    const result = await service.runCritique(TEST_PLAN_ID, 'entity', { forceReanalyze: true, neighborhood: fixedNeighborhood });
    expect(result.cached).toBe(false);
    const conflict = result.annotations.find((a) => a.type === 'conflict' && a.severity === 'error');
    expect(conflict).toBeDefined();

    // Graph node written with the portable node contract.
    const nodeRows = await runNeo4jQuery<{ id: string; aiModel: string; inputHash: string; status: string; description: string }>(
      `MATCH (a:Conflict { id: $id, planId: $planId })
       RETURN a.id AS id, a.aiModel AS aiModel, a.inputHash AS inputHash, a.status AS status, a.description AS description`,
      { id: conflict!.id, planId: TEST_PLAN_ID },
    );
    expect(nodeRows).toHaveLength(1);
    expect(nodeRows[0].aiModel).toBe('mock');
    expect(nodeRows[0].status).toBe('open');
    expect(nodeRows[0].inputHash.length).toBe(64);

    // FLAGGED_IN edge to the evidence Content node (the plan item).
    const edgeRows = await runNeo4jQuery<{ nodeType: string; nodeId: string }>(
      `MATCH (a:Conflict { id: $id })-[:FLAGGED_IN]->(c:Content)
       RETURN c.nodeType AS nodeType, c.nodeId AS nodeId`,
      { id: conflict!.id },
    );
    expect(edgeRows.some((e) => e.nodeId === ITEM_ID)).toBe(true);
  });

  it('re-analyze on an unchanged subgraph is cached from the graph', async () => {
    if (!neo4jLive) return;
    const before = await graphCritiqueService.countAnnotations(TEST_PLAN_ID);
    const result = await service.runCritique(TEST_PLAN_ID, 'entity', { neighborhood: fixedNeighborhood });
    expect(result.cached).toBe(true);
    expect(result.annotations.length).toBeGreaterThan(0);
    expect(await graphCritiqueService.countAnnotations(TEST_PLAN_ID)).toBe(before);
  });

  it('markAddressed sets status = addressed on the graph conflict', async () => {
    if (!neo4jLive) return;
    const annotations = await service.getAnnotations(TEST_PLAN_ID);
    const conflict = annotations.find((a) => a.type === 'conflict');
    expect(conflict).toBeDefined();

    await graphCritiqueService.markAddressed(conflict!.id);
    const after = await graphCritiqueService.getAnnotation(conflict!.id);
    expect(after?.status).toBe('addressed');
  });

  it('clearAnnotations empties the plan annotation nodes in the graph', async () => {
    if (!neo4jLive) return;
    await graphCritiqueService.clearAnnotations(TEST_PLAN_ID);
    expect(await graphCritiqueService.countAnnotations(TEST_PLAN_ID)).toBe(0);
  });
});

