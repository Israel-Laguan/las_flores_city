// ============================================================
// ai-critique integration tests (M26)
//
// Exercises the full AICritiqueService critique loop against real Postgres:
//   * runCritique writes a :Conflict annotation row with evidence + provenance
//   * re-running on an unchanged subgraph is cached (no re-analyze / no new rows)
//   * live override (dismiss) hides a false-positive
//   * clearAnnotations removes the plan's annotations
//
// Determinism: a fixed `neighborhood` override is passed to runCritique so the
// critique result + input hash are independent of the shared DB's character
// population (which parallel test workers mutate). The MockProvider flags a
// create item whose name collides with an existing canon name.
//
// Isolation (AGENTS.md): dedicated synthetic UUIDs; test user/plan/annotations
// cleaned up in afterAll. Schema DDL serialized via withSchemaLock.
// ============================================================

import { withSchemaLock } from '../helpers/schemaLock.js';
import { queryOLTP, closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';
import { AICritiqueService } from '../../src/services/AICritiqueService.js';
import { MockProvider } from '../../src/services/MockProvider.js';
import type { ExistingContentContext } from '../../src/services/types/LLMTypes.js';

// --- Dedicated synthetic IDs (collision-avoidance per AGENTS.md) ---
const TEST_USER_ID = 'd0000000-0000-4000-8000-00000000ac01';
const TEST_PLAN_ID = 'd0000000-1111-4111-8111-00000000ac02';
const ITEM_ID = 'd0000000-2222-4111-8111-00000000ac03';

const canonicName = 'CritiqueDupeSeven';

// A plan item that collides with an existing canon name → MockProvider flags a
// deterministic duplicate_name :Conflict.
const planJson = {
  id: TEST_PLAN_ID,
  description: 'M26 ai-critique integration plan',
  status: 'draft',
  links: [],
  items: [
    {
      id: ITEM_ID,
      type: 'character',
      action: 'create',
      name: canonicName,
      slug: 'critique_dupe_seven',
      description: 'A character that should collide with canon.',
      fields: { description: 'A character that should collide with canon.' },
      assetNeeds: [],
      dependsOn: [],
    },
  ],
};

// Fixed neighborhood: existing canon declares a character with the same name, so
// the mock 'create' item is flagged. This bypasses real gatherContext so the
// result + input hash are stable regardless of parallel DB churn.
const fixedNeighborhood: ExistingContentContext = {
  characters: [{ id: 'e0000000-0000-4000-8000-00000000ac09', name: canonicName }],
  scenes: [],
  dialogues: [],
  missions: [],
  overlays: [],
  locations: [],
};

describe('AICritiqueService (Postgres-backed, M26)', () => {
  const service = new AICritiqueService(new MockProvider());

  beforeAll(async () => {
    // Ensure the 070 `critique_annotations` table exists regardless of whether
    // the migration runner has applied it yet (same pattern as conflict-detector).
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
           created_at TIMESTAMPTZ DEFAULT NOW()
         )`,
      );
    });

    await queryOLTP(
      `INSERT INTO users (id, username, email, display_name, password_hash)
       VALUES ($1, 'ai_critique_t', 'ai_critique_t@example.com', 'AI Critique', 'x')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_USER_ID],
    );
    await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status, created_by)
       VALUES ($1, 'M26 ai-critique integration', $2::jsonb, 'draft', $3)
       ON CONFLICT (id) DO NOTHING`,
      [TEST_PLAN_ID, JSON.stringify(planJson), TEST_USER_ID],
    );
  });

  afterAll(async () => {
    await queryOLTP(`DELETE FROM critique_annotations WHERE plan_id = $1`, [TEST_PLAN_ID]).catch(() => {});
    await queryOLTP(`DELETE FROM content_plans WHERE id = $1`, [TEST_PLAN_ID]).catch(() => {});
    await queryOLTP(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID]).catch(() => {});
    await closeConnections();
    await closeRedis();
  });
  it('runs a critique and persists a :Conflict with evidence + provenance', async () => {
    const result = await service.runCritique(TEST_PLAN_ID, 'entity', { neighborhood: fixedNeighborhood });

    expect(result.cached).toBe(false);
    const conflict = result.annotations.find((a) => a.type === 'conflict' && a.severity === 'error');
    expect(conflict).toBeDefined();
    expect(conflict!.description).toContain(canonicName);
    // Evidence excerpt includes the name (anti-hallucination guard).
    expect(conflict!.evidence.length).toBeGreaterThan(0);
    expect(conflict!.evidence[0].excerpt).toContain(canonicName);
    expect(conflict!.aiModel).toBe('mock');
    expect(conflict!.planId).toBe(TEST_PLAN_ID);

    // Confirmed written in the DB with provenance columns populated.
    const row = await queryOLTP<{ type: string; ai_model: string; input_hash: string; evidence: any }>(
      `SELECT type, ai_model, input_hash, evidence FROM critique_annotations WHERE plan_id = $1 AND id = $2`,
      [TEST_PLAN_ID, conflict!.id],
    );
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].ai_model).toBe('mock');
    expect(row.rows[0].input_hash.length).toBe(64); // sha256 hex
  });

  it('is cached (no re-analyze) on an unchanged subgraph', async () => {
    // Self-seed: force a run first so this test never depends on the preceding
    // one (which may be filtered out when running this file selectively). This
    // guarantees there is a matching (scope, hash) row to hit against.
    const seeded = await service.runCritique(TEST_PLAN_ID, 'entity', {
      forceReanalyze: true,
      neighborhood: fixedNeighborhood,
    });
    expect(seeded.cached).toBe(false);
    expect(seeded.annotations.length).toBeGreaterThan(0);

    const before = await queryOLTP<{ count: string }>(
      'SELECT count(*)::text AS count FROM critique_annotations WHERE plan_id = $1',
      [TEST_PLAN_ID],
    );

    const result = await service.runCritique(TEST_PLAN_ID, 'entity', { neighborhood: fixedNeighborhood });

    expect(result.cached).toBe(true);
    expect(result.annotations.length).toBeGreaterThan(0);

    const after = await queryOLTP<{ count: string }>(
      'SELECT count(*)::text AS count FROM critique_annotations WHERE plan_id = $1',
      [TEST_PLAN_ID],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it('supports dismissing a false-positive via live override', async () => {
    const all = await service.getAnnotations(TEST_PLAN_ID);
    expect(all.length).toBeGreaterThan(0);
    const target = all[0];

    await service.setAnnotationStatus(target.id, 'dismissed');

    const visible = await service.getAnnotations(TEST_PLAN_ID);
    expect(visible.find((a) => a.id === target.id)).toBeUndefined();
  });

  it('clearAnnotations empties the plan annotations', async () => {
    await service.clearAnnotations(TEST_PLAN_ID);
    const after = await service.getAnnotations(TEST_PLAN_ID);
    expect(after).toHaveLength(0);
  });
});

