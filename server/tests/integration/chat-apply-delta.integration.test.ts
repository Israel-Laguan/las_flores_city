// ============================================================
// chat-apply-delta integration (M29) — the human-in-the-loop delta write gate.
//
// Part A (always): the ChatService contract is well-formed and the validate-
// before-write gate works: an invalid delta is rejected, a cross-plan delta is
// rejected, and a valid delta throws the 409-style graph-disabled error when
// Neo4j is off — in every case a referenced annotation stays 'open'.
//
// Part B (optionally Neo4j-backed): when NEO4J_ENABLED=true and Neo4j is
// reachable, apply a valid MODIFY delta end-to-end: the delta is written
// (getDeltasForPlan), the annotation is marked 'addressed' in durable Postgres,
// and the returned merged-view refresh contains the new shadow node. When the
// graph is off/unreachable these tests soft-skip (no real contacts).
//
// Isolation (AGENTS.md): dedicated synthetic UUIDs; own user/plan/annotation;
// cleanup in afterAll; schema DDL serialized via withSchemaLock.
// ============================================================

import crypto from 'node:crypto';
import { withSchemaLock } from '../helpers/schemaLock.js';
import { queryOLTP, closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';
import { GraphDeltaSchema } from '@las-flores/shared';
import { ChatService, ChatDeltaValidationError, ChatGraphDisabledError } from '../../src/services/ChatService.js';
import { MockProvider } from '../../src/services/MockProvider.js';
import { getDeltasForPlan } from '../../src/services/GraphDeltaService.js';
import { isNeo4jEnabled, verifyNeo4j, closeNeo4j, runNeo4jQuery } from '../../src/services/Neo4jClient.js';
import { ensureGraphConstraints, upsertContentNode } from '../../src/services/GraphBaseService.js';
import { aiCritiqueService } from '../../src/services/AICritiqueService.js';

// --- Dedicated synthetic IDs (collision-avoidance) ---
const TEST_USER_ID = 'f0000000-4000-4000-8000-00000000cf01';
const TEST_PLAN_ID = 'f0000000-4111-4111-8111-00000000cf02';
const CHAR_ID = 'f0000000-4222-4111-8111-00000000cf03';
const ANNOTATION_ID = 'f0000000-4333-4111-8111-00000000cf04';

const canonicName = 'ChatApplyDeltaNine';

const planJson = {
  id: TEST_PLAN_ID,
  description: 'M29 chat-apply-delta integration plan',
  status: 'draft',
  links: [],
  items: [
    {
      id: 'f0000000-4444-4111-8111-00000000cf05',
      type: 'character',
      action: 'create',
      name: canonicName,
      slug: 'chat_apply_delta_nine',
      description: 'Fixture only — no critique runs in this suite.',
      fields: {},
      assetNeeds: [],
      dependsOn: [],
    },
  ],
};

function validDelta(): unknown {
  return GraphDeltaSchema.parse({
    id: crypto.randomUUID(),
    planId: TEST_PLAN_ID,
    nodeType: 'Character',
    nodeId: CHAR_ID,
    op: 'MODIFY',
    fields: { name: canonicName, description: 'M29 apply-delta MODIFY — shadow copy.' },
    createdAt: new Date().toISOString(),
  });
}

let neo4jLive = false;

beforeAll(async () => {
  // Ensure the `critique_annotations` table exists (same pattern as ai-critique).
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
     VALUES ($1, 'chat_apply_delta_t', 'chat_apply_delta_t@example.com', 'Chat Apply Delta', 'x')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID],
  );
  await queryOLTP(
    `INSERT INTO content_plans (id, description, plan_json, status, created_by)
     VALUES ($1, 'M29 chat-apply-delta integration', $2::jsonb, 'draft', $3)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_PLAN_ID, JSON.stringify(planJson), TEST_USER_ID],
  );
  // Durable open annotation — the "to be resolved" conflict the apply marks.
  await queryOLTP(
    `INSERT INTO critique_annotations
       (id, type, severity, description, evidence, related_entities,
        scope, ai_model, input_hash, status, plan_id, item_ids, created_at, is_marker)
     VALUES ($1, 'conflict', 'error', 'Fixture conflict for M29 apply-delta',
             $2::jsonb, '[]'::jsonb, 'entity', 'mock', '', 'open', $3, '{}', NOW(), FALSE)
     ON CONFLICT (id) DO NOTHING`,
    [ANNOTATION_ID, JSON.stringify([{ nodeType: 'Character', nodeId: CHAR_ID, slug: canonicName, excerpt: 'Fixture excerpt.' }]), TEST_PLAN_ID],
  );

  neo4jLive = isNeo4jEnabled() && (await verifyNeo4j());
  if (!neo4jLive) return;
  await cleanupNeo4j();
  await ensureGraphConstraints();
  // A canonical base node the MODIFY delta must shadow to be write-valid.
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
  await runNeo4jQuery(`MATCH (d:ContentDelta) WHERE d.planId = $planId DETACH DELETE d`, { planId: TEST_PLAN_ID });
  await runNeo4jQuery(`MATCH (c:Content) WHERE c.nodeId IN $ids DETACH DELETE c`, { ids: [CHAR_ID] });
}

describe('chat-apply-delta contract (always)', () => {
  const service = new ChatService(new MockProvider(), aiCritiqueService);

  it('ChatService is constructed and exposes the write-gate methods', () => {
    expect(service).toBeDefined();
    expect(typeof service.applyDeltas).toBe('function');
    expect(typeof service.discardDelta).toBe('function');
    expect(typeof service.getReviewQueue).toBe('function');
  });

  it('rejects a malformed delta with ChatDeltaValidationError and leaves the annotation open', async () => {
    const bad = { id: crypto.randomUUID(), planId: TEST_PLAN_ID, nodeType: 'Character', nodeId: CHAR_ID, op: 'DOES_NOT_EXIST', fields: {}, createdAt: new Date().toISOString() };
    await expect(service.applyDeltas(TEST_PLAN_ID, [bad as never], [], ANNOTATION_ID)).rejects.toBeInstanceOf(ChatDeltaValidationError);

    const row = await queryOLTP<{ status: string }>(`SELECT status FROM critique_annotations WHERE id = $1`, [ANNOTATION_ID]);
    expect(row.rows[0].status).toBe('open');
  });

  it('rejects a delta scoped to another plan (400-style) without touching the graph', async () => {
    const crossPlan = GraphDeltaSchema.parse({
      id: crypto.randomUUID(),
      planId: 'f0000000-4999-4999-8999-00000000cf09', // not TEST_PLAN_ID
      nodeType: 'Character',
      nodeId: CHAR_ID,
      op: 'MODIFY',
      fields: {},
      createdAt: new Date().toISOString(),
    });
    await expect(service.applyDeltas(TEST_PLAN_ID, [crossPlan], [], ANNOTATION_ID)).rejects.toBeInstanceOf(ChatDeltaValidationError);
  });

  it('throws ChatGraphDisabledError (409-style) when Neo4j is disabled', async () => {
    const prev = process.env.NEO4J_ENABLED;
    process.env.NEO4J_ENABLED = 'false';
    try {
      await expect(service.applyDeltas(TEST_PLAN_ID, [validDelta()], [], ANNOTATION_ID)).rejects.toBeInstanceOf(ChatGraphDisabledError);
    } finally {
      if (prev === undefined) delete process.env.NEO4J_ENABLED;
      else process.env.NEO4J_ENABLED = prev;
    }
    // The gate threw before any write or status change.
    const row = await queryOLTP<{ status: string }>(`SELECT status FROM critique_annotations WHERE id = $1`, [ANNOTATION_ID]);
    expect(row.rows[0].status).toBe('open');
  });
});

describe('chat-apply-delta run (Neo4j-backed, optional)', () => {
  const service = new ChatService(new MockProvider(), aiCritiqueService);

  it('applies a valid MODIFY delta, writes it to the graph, marks the conflict addressed, and refreshes the merged view', async () => {
    if (!neo4jLive) return;

    const result = await service.applyDeltas(TEST_PLAN_ID, [validDelta()], [], ANNOTATION_ID);
    expect(result.appliedCount).toBe(1);

    const deltas = await getDeltasForPlan(TEST_PLAN_ID);
    expect(deltas.some((d) => d.nodeId === CHAR_ID && d.op === 'MODIFY')).toBe(true);

    const ann = await queryOLTP<{ status: string }>(`SELECT status FROM critique_annotations WHERE id = $1`, [ANNOTATION_ID]);
    expect(ann.rows[0].status).toBe('addressed');

    // The merged-view refresh surfaces the new shadow node (planId = the plan).
    expect(result.mergedView.nodes.some((n) => n.nodeId === CHAR_ID && n.planId === TEST_PLAN_ID)).toBe(true);
  });
});