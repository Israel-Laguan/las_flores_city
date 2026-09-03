/* eslint-disable max-lines-per-function */
/**
 * Integration test — StoryBuilderMigration partial-failure audit coverage (M24).
 *
 * Verifies that when `migrateContent` partially fails (earlier files already
 * committed to canon tables + migration_log), the failed `migrateStagedPlan`
 * still records an applied patch + per-entity canon_revisions for the files
 * that DID succeed, so a partial canon change retains audit/rollback coverage.
 *
 * `migrateContent` is stubbed (jest.mock) so we can deterministically inject a
 * partial-failure result; the rest of the flow hits the real DB via
 * @las-flores/infra. Dedicated synthetic UUIDs; schema DDL runs under
 * withSchemaLock; cleanup in afterAll (per AGENTS.md test-isolation rules).
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { closeConnections } from '@las-flores/infra';
import { withSchemaLock } from '../helpers/schemaLock.js';
import { migrateStagedPlan } from '../../src/services/StoryBuilderMigration.js';

jest.mock('../../src/content/migrate.js', () => ({
  migrateContent: jest.fn(),
}));

import { migrateContent } from '../../src/content/migrate.js';

const { Pool } = pg;

// Dedicated synthetic IDs (collision-avoidance per AGENTS.md).
const PLAN_ID = 'c7f2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c7e';
const USER_ID = 'c7f2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c7f';
const CHAR_OK = 'c7a2b3c4-0000-4000-8000-0000000000aa';
const SCENE_OK = 'c7a2b3c4-0000-4000-8000-0000000000bb';
const DISTRICT_ID = 'd7f2a3b4-0000-4000-8000-0000000000cc';

let pool: pg.Pool;

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8',
  );
  await withSchemaLock(async (client) => {
    await client.query(sql);
  });
}

async function clearState(): Promise<void> {
  await pool.query(
    `DELETE FROM canon_revisions WHERE plan_id = $1::uuid OR entity_id = ANY($2::uuid[])`,
    [PLAN_ID, [CHAR_OK, SCENE_OK]],
  );
  await pool.query(`DELETE FROM patches WHERE plan_id = $1::uuid`, [PLAN_ID]);
  await pool.query(`DELETE FROM characters WHERE id = $1::uuid`, [CHAR_OK]);
  await pool.query(`DELETE FROM scenes WHERE id = $1::uuid`, [SCENE_OK]);
  await pool.query(`DELETE FROM districts WHERE id = $1::uuid`, [DISTRICT_ID]);
  await pool.query(`DELETE FROM users WHERE id = $1::uuid`, [USER_ID]);
  await pool.query(`DELETE FROM content_plans WHERE id = $1::uuid`, [PLAN_ID]);
}

describe('story-builder-migration — partial failure audit', () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
      connectionTimeoutMillis: 5000,
    });
    await applyMigration('064_patch_versioning.sql');
    await applyMigration('066_claims.sql');
    await applyMigration('067_admin_events_audit.sql');
    await applyMigration('068_admin_events_audit_validate.sql');
    await clearState();

    // Plan row (required FK for plan_id) in a migrated-eligible status.
    await pool.query(
      `INSERT INTO content_plans (id, description, plan_json, status)
       VALUES ($1::uuid, 'partial migration fixture', '{"items":[],"links":[]}'::jsonb, 'staged')`,
      [PLAN_ID],
    );
    // USER_ID is passed to recordMigrationCanon → patches.applied_by, which has
    // an FK to users(id); seed a user row so the FK is satisfied.
    await pool.query(
      `INSERT INTO users (id, email, username, display_name, ai_enabled, is_in_simulation)
       VALUES ($1::uuid, 'migration-audit@example.com', 'migration-audit', 'Migration Audit', false, false)`,
      [USER_ID],
    );
    // Seed the two entities that migrateContent "succeeded" on (already committed
    // to canon tables, simulating the partial-success state before recordMigrationCanon).
    // A district row is required for the scenes.district_id FK (schema uses
    // district_id, not the legacy `district` text column).
    await pool.query(
      `INSERT INTO districts (id, name, slug, description, x, y)
       VALUES ($1::uuid, 'Migration Audit District', 'migration-audit', 'fixture', 0, 0)`,
      [DISTRICT_ID],
    );
    await pool.query(
      `INSERT INTO characters (id, name, description) VALUES ($1::uuid, 'Good', 'committed')`,
      [CHAR_OK],
    );
    await pool.query(
      `INSERT INTO scenes (id, name, district_id, description) VALUES ($1::uuid, 'Good Scene', $2::uuid, 'committed')`,
      [SCENE_OK, DISTRICT_ID],
    );
  });

  afterAll(async () => {
    await clearState();
    await pool.end();
    await closeConnections();
  });

  // Each migration test needs independent plan state. The first test flips
  // PLAN_ID to `failed`, which would make follow-up tests hit PlanStatusError;
  // reset the plan to `staged` and remove any partial-migration audit rows so
  // every case starts cleanly.
  beforeEach(async () => {
    await pool.query(
      `DELETE FROM canon_revisions WHERE plan_id = $1::uuid OR entity_id = ANY($2::uuid[])`,
      [PLAN_ID, [CHAR_OK, SCENE_OK]],
    );
    await pool.query(`DELETE FROM patches WHERE plan_id = $1::uuid`, [PLAN_ID]);
    await pool.query(
      `INSERT INTO content_plans (id, description, plan_json, status)
       VALUES ($1::uuid, 'partial migration fixture', '{"items":[],"links":[]}'::jsonb, 'staged')
       ON CONFLICT (id) DO UPDATE SET status = 'staged', plan_json = EXCLUDED.plan_json, updated_at = NOW()`,
      [PLAN_ID],
    );
  });

  test('records canon_revisions for succeeded entities and marks plan failed on partial migration failure', async () => {
    const mockMigrate = migrateContent as jest.MockedFunction<typeof migrateContent>;
    mockMigrate.mockResolvedValueOnce({
      success: false,
      filesProcessed: 1,
      filesSkipped: 0,
      filesFailed: 1,
      errors: ['Failed to migrate scenes/bad_scene.yaml: checksum mismatch'],
      appliedMigrations: [
        { filePath: 'characters/char_good.yaml', contentType: 'character', contentId: CHAR_OK, action: 'created' },
        { filePath: 'scenes/scene_good.yaml', contentType: 'scene', contentId: SCENE_OK, action: 'updated' },
      ],
    });

    const result = await migrateStagedPlan(PLAN_ID, undefined, undefined, USER_ID);

    // Failure result + message unchanged.
    expect(result.success).toBe(false);
    expect(result.error).toContain('checksum mismatch');

    // Plan status flipped to failed (real DB assertion).
    const statusRes = await pool.query<{ status: string }>(
      `SELECT status FROM content_plans WHERE id = $1::uuid`,
      [PLAN_ID],
    );
    expect(statusRes.rows[0].status).toBe('failed');

    // A patch row was recorded against the plan (audit trail for partial change).
    const patchRes = await pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM patches WHERE plan_id = $1::uuid`,
      [PLAN_ID],
    );
    expect(patchRes.rows).toHaveLength(1);
    expect(patchRes.rows[0].status).toBe('applied');
    const patchId = patchRes.rows[0].id;

    // canon_revisions exist for BOTH succeeded entities.
    const revRes = await pool.query<{ entity_type: string; entity_id: string }>(
      `SELECT entity_type, entity_id FROM canon_revisions WHERE applied_patch_id = $1::uuid`,
      [patchId],
    );
    const entityIds = revRes.rows.map((r) => r.entity_id);
    expect(entityIds).toContain(CHAR_OK);
    expect(entityIds).toContain(SCENE_OK);
  });

  test('does not record canon when a failed migration had only skipped applied migrations', async () => {
    const mockMigrate = migrateContent as jest.MockedFunction<typeof migrateContent>;
    mockMigrate.mockResolvedValueOnce({
      success: false,
      filesProcessed: 0,
      filesSkipped: 1,
      filesFailed: 1,
      errors: ['Failed to migrate scenes/bad_scene.yaml: checksum mismatch'],
      appliedMigrations: [
        { filePath: 'characters/char_skip.yaml', contentType: 'character', contentId: CHAR_OK, action: 'skipped' },
      ],
    });

    const result = await migrateStagedPlan(PLAN_ID, undefined, undefined, USER_ID);
    expect(result.success).toBe(false);

    const patchRes = await pool.query<{ id: string }>(
      `SELECT id FROM patches WHERE plan_id = $1::uuid`,
      [PLAN_ID],
    );
    // This isolated plan has a clean state (reset in beforeEach): a migration with
    // only skipped applied migrations must not have recorded any patch for it.
    expect(patchRes.rows).toHaveLength(0);
  });
});
