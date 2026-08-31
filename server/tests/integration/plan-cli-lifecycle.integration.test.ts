/* eslint-disable max-lines */
// ============================================================
// M50 Part 2 — plan lifecycle CLI integration tests.
//
// Exercises the four new CLIs against a real Postgres + (when enabled) Neo4j
// stack, calling `GraphIntakeService` directly so the tests do not require the
// dev LiteLLM provider or the CLI entrypoint shims.
//
// Each CLI corresponds to a service method on `GraphIntakeService`:
//
//   `plan:reject`  → service.rejectPlan(planId)
//   `plan:delete`  → service.deletePlan(planId)
//   `plan:get`     → service.getPlanState(planId)
//   `plan:list`    → service.listPlans({ status, createdBy, since })
//
// Isolation (AGENTS.md):
//   * Dedicated synthetic UUIDs that do not collide with content entities or
//     sibling test fixtures.
//   * Test user is created in beforeAll and removed in afterAll.
//   * Per-test plan rows + their intake annotations are cleaned up in afterAll
//     (and afterEach for the destructive blocks) — never rely on another test
//     to clean up.
//   * Schema DDL is serialized via withSchemaLock so concurrent suites cannot
//     deadlock on ACCESS EXCLUSIVE table locks.
//
// Neo4j path is gated on `neo4jLive`; the PG-only contract (row + annotations
// + status) is asserted even when Neo4j is off, because the CLIs must work
// against any local dev stack.
// ============================================================

import '../helpers/enableTestNeo4j.js';

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, afterAll, afterEach, describe, test, expect } from '@jest/globals';
import { queryOLTP } from '@las-flores/infra';
import { withSchemaLock } from '../helpers/schemaLock.js';
import {
  isNeo4jEnabled,
  verifyNeo4j,
  closeNeo4j,
} from '../../src/services/Neo4jClient.js';
import { clearDeltasForPlan, getDeltasForPlan } from '../../src/services/GraphDeltaService.js';
import { GraphIntakeService } from '../../src/services/GraphIntakeService.js';
import { GraphIntakeValidationError } from '../../src/services/GraphIntakeService.js';

// Dedicated synthetic UUIDs reserved for this suite. They must not collide with
// seed data or fixtures in other integration suites. Names are prefixes so it's
// obvious which block owns which id.
const USER_ID = 'b0500000-0000-4000-8000-0000000000a1';
const USER_EMAIL = 'plan_cli_intake_t@example.com';

const PLAN_REJECT = 'b0500000-0000-4000-8000-0000000000b1';
const PLAN_DELETE = 'b0500000-0000-4000-8000-0000000000b2';
const PLAN_GET = 'b0500000-0000-4000-8000-0000000000b3';
const PLAN_LIST_A = 'b0500000-0000-4000-8000-0000000000b4';
const PLAN_LIST_B = 'b0500000-0000-4000-8000-0000000000b5';
const PLAN_LIST_C = 'b0500000-0000-4000-8000-0000000000b6';
const PLAN_IMMUTABLE = 'b0500000-0000-4000-8000-0000000000b7';

const ANNOTATION_REJECT_A = 'b0500000-0000-4000-8000-0000000000c1';
const ANNOTATION_REJECT_B = 'b0500000-0000-4000-8000-0000000000c2';
const ANNOTATION_DELETE = 'b0500000-0000-4000-8000-0000000000c3';
const ANNOTATION_GET = 'b0500000-0000-4000-8000-0000000000c4';
const ANNOTATION_GET_ENTITY = 'b0500000-0000-4000-8000-0000000000c5';
const ANNOTATION_GET_2 = 'b0500000-0000-4000-8000-0000000000c6';

// Plan id used by plan:list that we create during the test and clean up after.
// Must NOT collide with content plans or other suites' fixtures.
const PLAN_DIFF_PREFIX = 'b0500000-0000-4000-8000-0000000000d%';

let neo4jLive = false;
const createdPlanIds: string[] = [];

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8',
  );
  await withSchemaLock(async (client) => {
    await client.query(sql);
  });
}

async function insertPlan(
  planId: string,
  status: string,
  description: string,
  createdBy: string,
): Promise<void> {
  await queryOLTP(
    `INSERT INTO content_plans (id, description, plan_json, status, created_by)
     VALUES ($1, $2, '{}'::jsonb, $3, $4)
     ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status,
           description = EXCLUDED.description,
           created_by = EXCLUDED.created_by`,
    [planId, description, status, createdBy],
  );
}

async function insertAnnotation(
  annotationId: string,
  planId: string,
  status: 'open' | 'addressed' | 'dismissed' = 'open',
): Promise<void> {
  await queryOLTP(
    `INSERT INTO critique_annotations
       (id, type, severity, description, evidence, related_entities,
        scope, ai_model, input_hash, status, plan_id, item_ids, created_at, is_marker)
     VALUES ($1, 'suggestion', 'info', 'fixture intake note', '[]'::jsonb, '[]'::jsonb,
             'intake', 'mock', '', $2, $3, '{}', NOW(), FALSE)
     ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status`,
    [annotationId, status, planId],
  );
}

async function cleanupPlanArtifacts(planId: string): Promise<void> {
  if (neo4jLive) {
    try {
      await clearDeltasForPlan(planId);
    } catch {
      /* ignore */
    }
  }
  await queryOLTP('DELETE FROM critique_annotations WHERE plan_id = $1', [planId]).catch(
    () => {},
  );
  await queryOLTP('DELETE FROM content_plans WHERE id = $1', [planId]).catch(() => {});
}

beforeAll(async () => {
  // 001: users table.
  // 047: content_plans + status CHECK (initial set, no 'rejected' yet).
  // 070: critique_annotations table (with initial scope CHECK).
  // 084: widen critique_annotations.scope CHECK to include 'intake'.
  // 086: widen content_plans.status CHECK to include 'rejected'.
  await applyMigration('001_initial_schema.sql');
  await applyMigration('047_content_plans.sql');
  await applyMigration('070_critique_annotations.sql');
  await applyMigration('084_critique_scope_intake.sql');
  await applyMigration('086_content_plans_rejected.sql');

  // Test user — created in beforeAll, removed in afterAll. The `role` column
  // is added by 043_user_roles.sql; if the test DB has not yet applied it, the
  // INSERT below still succeeds because the default is 'player', and the
  // service-level role check (admin/developer) is exercised only on the
  // intake/amend CLIs, not the lifecycle CLIs under test here.
  await queryOLTP(
    `INSERT INTO users (id, username, email, display_name, password_hash)
     VALUES ($1, 'plan_cli_intake_t', $2, 'Plan CLI Intake', 'x')
     ON CONFLICT (id) DO NOTHING`,
    [USER_ID, USER_EMAIL],
  );

  neo4jLive = isNeo4jEnabled() && (await verifyNeo4j());
});

afterEach(async () => {
  for (const id of createdPlanIds) {
    await cleanupPlanArtifacts(id);
  }
  createdPlanIds.length = 0;
});

afterAll(async () => {
  try {
    // Pre-existing fixtures: remove any plan the test might have forgotten.
    for (const id of [
      PLAN_REJECT,
      PLAN_DELETE,
      PLAN_GET,
      PLAN_LIST_A,
      PLAN_LIST_B,
      PLAN_LIST_C,
      PLAN_IMMUTABLE,
    ]) {
      await cleanupPlanArtifacts(id);
    }
    await queryOLTP('DELETE FROM critique_annotations WHERE id IN ($1, $2, $3, $4, $5)', [
      ANNOTATION_REJECT_A,
      ANNOTATION_REJECT_B,
      ANNOTATION_DELETE,
      ANNOTATION_GET,
      ANNOTATION_GET_2,
      ANNOTATION_GET_ENTITY,
    ]).catch(() => {});
    await queryOLTP('DELETE FROM content_plans WHERE id::text LIKE $1', [
      PLAN_DIFF_PREFIX,
    ]).catch(() => {});
    await queryOLTP('DELETE FROM users WHERE id = $1', [USER_ID]).catch(() => {});
  } finally {
    await closeNeo4j();
  }
});

// =====================================================================
// plan:reject
// =====================================================================
describe('M50 plan:reject CLI — integration', () => {
  test('soft-rejects a proposed plan: status flips, deltas pruned (Neo4j), annotations closed', async () => {
    const service = new GraphIntakeService();
    await insertPlan(
      PLAN_REJECT,
      'proposed',
      'M50 plan:reject — proposed → rejected happy path',
      USER_ID,
    );
    createdPlanIds.push(PLAN_REJECT);

    // Two open intake annotations, one of which we will verify gets addressed.
    await insertAnnotation(ANNOTATION_REJECT_A, PLAN_REJECT, 'open');
    await insertAnnotation(ANNOTATION_REJECT_B, PLAN_REJECT, 'open');

    const result = await service.rejectPlan(PLAN_REJECT);

    expect(result.planId).toBe(PLAN_REJECT);
    expect(result.status).toBe('rejected');
    // `deltaPruned` mirrors whether the Neo4j path actually ran; the service
    // reports it as true when `isNeo4jEnabled()` is true at call time.
    expect(result.deltaPruned).toBe(neo4jLive);
    expect(result.annotationCount).toBe(2);

    // Postgres: status flipped to 'rejected' (acceptance criterion: the
    // `rejected` value is in the 086-widened CHECK).
    const row = await queryOLTP<{ status: string }>(
      'SELECT status FROM content_plans WHERE id = $1',
      [PLAN_REJECT],
    );
    expect(row.rows[0]?.status).toBe('rejected');

    // Postgres: both open intake annotations are now 'addressed'.
    const annRows = await queryOLTP<{ status: string }>(
      `SELECT status FROM critique_annotations
       WHERE plan_id = $1 AND scope = 'intake'`,
      [PLAN_REJECT],
    );
    expect(annRows.rows).toHaveLength(2);
    for (const r of annRows.rows) {
      expect(r.status).toBe('addressed');
    }

    // Neo4j (when enabled): no plan-scoped deltas remain.
    if (neo4jLive) {
      const deltas = await getDeltasForPlan(PLAN_REJECT);
      expect(deltas).toHaveLength(0);
    }
  });

  test('refuses to reject a plan that is already rejected (idempotent error)', async () => {
    const service = new GraphIntakeService();
    await insertPlan(PLAN_REJECT, 'rejected', 'M50 plan:reject — already-rejected refusal', USER_ID);
    createdPlanIds.push(PLAN_REJECT);

    await expect(service.rejectPlan(PLAN_REJECT)).rejects.toBeInstanceOf(
      GraphIntakeValidationError,
    );
    await expect(service.rejectPlan(PLAN_REJECT)).rejects.toThrow(/already rejected/);
  });

  test('refuses to reject a plan past the point of rejection (approved)', async () => {
    const service = new GraphIntakeService();
    await insertPlan(
      PLAN_IMMUTABLE,
      'approved',
      'M50 plan:reject — approved refusal (immutable status)',
      USER_ID,
    );
    createdPlanIds.push(PLAN_IMMUTABLE);

    await expect(service.rejectPlan(PLAN_IMMUTABLE)).rejects.toBeInstanceOf(
      GraphIntakeValidationError,
    );
    await expect(service.rejectPlan(PLAN_IMMUTABLE)).rejects.toThrow(
      /past the point of rejection/,
    );
  });

  test('throws on a non-existent plan id', async () => {
    const service = new GraphIntakeService();
    const ghostId = 'b0500000-0000-4000-8000-00000000ffff';
    await expect(service.rejectPlan(ghostId)).rejects.toBeInstanceOf(
      GraphIntakeValidationError,
    );
    await expect(service.rejectPlan(ghostId)).rejects.toThrow(/Plan not found/);
  });
});

// =====================================================================
// plan:delete
// =====================================================================
describe('M50 plan:delete CLI — integration', () => {
  test('hard-deletes a proposed plan: row removed, annotations removed, deltas pruned (Neo4j)', async () => {
    const service = new GraphIntakeService();
    await insertPlan(
      PLAN_DELETE,
      'proposed',
      'M50 plan:delete — proposed → hard-delete happy path',
      USER_ID,
    );
    createdPlanIds.push(PLAN_DELETE);

    await insertAnnotation(ANNOTATION_DELETE, PLAN_DELETE, 'open');

    const result = await service.deletePlan(PLAN_DELETE);

    expect(result.planId).toBe(PLAN_DELETE);
    // The service records the pre-delete status (e.g. 'proposed') so the
    // caller can audit the transition. Plan row is gone, but the report
    // carries the last known status.
    expect(result.status).toBe('proposed');
    expect(result.annotationCount).toBe(1);
    expect(result.deltaPruned).toBe(neo4jLive);

    // Postgres: the row is gone.
    const row = await queryOLTP<{ id: string }>(
      'SELECT id FROM content_plans WHERE id = $1',
      [PLAN_DELETE],
    );
    expect(row.rows).toHaveLength(0);

    // Postgres: the scope='intake' annotation is gone.
    const annRows = await queryOLTP<{ id: string }>(
      `SELECT id FROM critique_annotations WHERE plan_id = $1`,
      [PLAN_DELETE],
    );
    expect(annRows.rows).toHaveLength(0);

    // Neo4j: deltas pruned.
    if (neo4jLive) {
      const deltas = await getDeltasForPlan(PLAN_DELETE);
      expect(deltas).toHaveLength(0);
    }
  });

  test('refuses to delete an approved plan (immutable status)', async () => {
    const service = new GraphIntakeService();
    await insertPlan(
      PLAN_IMMUTABLE,
      'approved',
      'M50 plan:delete — approved refusal (immutable status)',
      USER_ID,
    );
    createdPlanIds.push(PLAN_IMMUTABLE);

    await expect(service.deletePlan(PLAN_IMMUTABLE)).rejects.toBeInstanceOf(
      GraphIntakeValidationError,
    );
    await expect(service.deletePlan(PLAN_IMMUTABLE)).rejects.toThrow(
      /past the point of deletion/,
    );

    // The approved row MUST still be present — the refusal is non-destructive.
    const row = await queryOLTP<{ id: string }>(
      'SELECT id FROM content_plans WHERE id = $1',
      [PLAN_IMMUTABLE],
    );
    expect(row.rows).toHaveLength(1);
  });

  test('throws on a non-existent plan id', async () => {
    const service = new GraphIntakeService();
    const ghostId = 'b0500000-0000-4000-8000-00000000fffe';
    await expect(service.deletePlan(ghostId)).rejects.toBeInstanceOf(
      GraphIntakeValidationError,
    );
    await expect(service.deletePlan(ghostId)).rejects.toThrow(/Plan not found/);
  });
});

// =====================================================================
// plan:get
// =====================================================================
describe('M50 plan:get CLI — integration', () => {
  test('returns full resumable state for an existing plan, including annotations', async () => {
    const service = new GraphIntakeService();
    await insertPlan(
      PLAN_GET,
      'proposed',
      'M50 plan:get — full-state surface',
      USER_ID,
    );
    createdPlanIds.push(PLAN_GET);

    await insertAnnotation(ANNOTATION_GET, PLAN_GET, 'open');
    // A non-intake annotation (scope='entity') must NOT show up in the open
    // list — the CLI surfaces only intake-scoped notes an author can reply to.
    await queryOLTP(
      `INSERT INTO critique_annotations
         (id, type, severity, description, evidence, related_entities,
          scope, ai_model, input_hash, status, plan_id, item_ids, created_at, is_marker)
       VALUES ($1, 'conflict', 'info', 'entity-scope note', '[]'::jsonb, '[]'::jsonb,
               'entity', 'mock', '', 'open', $2, '{}', NOW(), FALSE)
       ON CONFLICT (id) DO NOTHING`,
      [ANNOTATION_GET_ENTITY, PLAN_GET],
    );

    const state = await service.getPlanState(PLAN_GET);

    expect(state).not.toBeNull();
    expect(state!.planId).toBe(PLAN_GET);
    expect(state!.status).toBe('proposed');
    expect(state!.created_by).toBe(USER_ID);
    expect(state!.description).toContain('M50 plan:get');
    expect(state!.deltaCount).toBe(0);
    expect(state!.edgeCount).toBe(0);
    expect(state!.deltas).toEqual([]);
    expect(state!.edges).toEqual([]);
    expect(state!.diff).toEqual([]);
    expect(state!.openAnnotations).toHaveLength(1);
    expect(state!.openAnnotations[0]!.id).toBe(ANNOTATION_GET);
    expect(state!.reviewUrl).toMatch(/\/story-builder\?planId=/);
    expect(state!.reviewUrl).toContain(encodeURIComponent(PLAN_GET));
  });

  test('returns null for a non-existent plan id (CLI maps this to "not found")', async () => {
    const service = new GraphIntakeService();
    const ghostId = 'b0500000-0000-4000-8000-00000000fffd';
    const state = await service.getPlanState(ghostId);
    expect(state).toBeNull();
  });
});

// =====================================================================
// plan:list
// =====================================================================
describe('M50 plan:list CLI — integration', () => {
  test('default filter returns only non-terminal plans (proposed + rejected)', async () => {
    const service = new GraphIntakeService();
    // Mix of statuses: default should keep A (proposed) and B (rejected), drop C (approved).
    await insertPlan(PLAN_LIST_A, 'proposed', 'M50 plan:list default — proposed', USER_ID);
    await insertPlan(PLAN_LIST_B, 'rejected', 'M50 plan:list default — rejected', USER_ID);
    await insertPlan(PLAN_LIST_C, 'approved', 'M50 plan:list default — approved (hidden)', USER_ID);
    createdPlanIds.push(PLAN_LIST_A, PLAN_LIST_B, PLAN_LIST_C);

    const rows = await service.listPlans({ createdBy: USER_ID });
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual([PLAN_LIST_A, PLAN_LIST_B].sort());
    // deltaCount is 0 for both (no Neo4j writes performed in this test).
    for (const row of rows) {
      expect(row.status === 'proposed' || row.status === 'rejected').toBe(true);
      expect(row.deltaCount).toBe(0);
    }
  });

  test('--status filter narrows the result to a single status', async () => {
    const service = new GraphIntakeService();
    await insertPlan(PLAN_LIST_A, 'proposed', 'M50 plan:list status — proposed', USER_ID);
    await insertPlan(PLAN_LIST_B, 'rejected', 'M50 plan:list status — rejected', USER_ID);
    createdPlanIds.push(PLAN_LIST_A, PLAN_LIST_B);

    const proposed = await service.listPlans({ status: 'proposed', createdBy: USER_ID });
    expect(proposed.map((r) => r.id)).toEqual([PLAN_LIST_A]);

    const rejected = await service.listPlans({ status: 'rejected', createdBy: USER_ID });
    expect(rejected.map((r) => r.id)).toEqual([PLAN_LIST_B]);

    // A status with no rows returns an empty list, not an error.
    const staged = await service.listPlans({ status: 'staged', createdBy: USER_ID });
    expect(staged).toEqual([]);
  });

  test('--created-by filter scopes to the provided user id', async () => {
    const service = new GraphIntakeService();
    // Insert another user-owned plan to ensure the filter is exact, not "at
    // least one match". Other-user plan is deleted in afterAll via cascade.
    const OTHER_USER = 'b0500000-0000-4000-8000-0000000000a2';
    await queryOLTP(
      `INSERT INTO users (id, username, email, display_name, password_hash)
       VALUES ($1, 'plan_cli_intake_t2', $2, 'Plan CLI Intake 2', 'x')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_USER, 'plan_cli_intake_t2@example.com'],
    );
    const OTHER_PLAN = 'b0500000-0000-4000-8000-0000000000b8';
    await insertPlan(OTHER_PLAN, 'proposed', 'M50 plan:list createdBy — other', OTHER_USER);
    createdPlanIds.push(OTHER_PLAN);

    await insertPlan(PLAN_LIST_A, 'proposed', 'M50 plan:list createdBy — mine', USER_ID);
    createdPlanIds.push(PLAN_LIST_A);

    const mine = await service.listPlans({ createdBy: USER_ID, status: 'proposed' });
    const mineIds = mine.map((r) => r.id);
    expect(mineIds).toContain(PLAN_LIST_A);
    expect(mineIds).not.toContain(OTHER_PLAN);

    const theirs = await service.listPlans({ createdBy: OTHER_USER, status: 'proposed' });
    expect(theirs.map((r) => r.id)).toEqual([OTHER_PLAN]);

    // Clean up the second user too.
    await queryOLTP('DELETE FROM users WHERE id = $1', [OTHER_USER]).catch(() => {});
  });

  test('--since filter excludes plans created before the lower bound', async () => {
    const service = new GraphIntakeService();
    await insertPlan(PLAN_LIST_A, 'proposed', 'M50 plan:list since — mine', USER_ID);
    createdPlanIds.push(PLAN_LIST_A);

    // A `since` in the future must exclude all current plans.
    const future = new Date(Date.now() + 60_000).toISOString();
    const futureRows = await service.listPlans({ createdBy: USER_ID, since: future });
    expect(futureRows.map((r) => r.id)).not.toContain(PLAN_LIST_A);

    // A `since` in the past must include the just-inserted plan.
    const past = new Date(Date.now() - 60_000).toISOString();
    const pastRows = await service.listPlans({ createdBy: USER_ID, since: past });
    expect(pastRows.map((r) => r.id)).toContain(PLAN_LIST_A);
  });
});
