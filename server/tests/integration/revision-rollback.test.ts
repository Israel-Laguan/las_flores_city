/**
 * Integration test — M24 patch-level versioning: rollback by lookup.
 *
 * Flow (real DB):
 *   1. record a canon revision for a synthetic character (state "Alpha")
 *   2. mutate the character to "Beta", record a second revision (patch2)
 *   3. rollback patch2   → assert the character is restored to "Alpha"
 *      via the stored prior snapshot (a lookup, not inverse reasoning)
 *
 * Uses dedicated synthetic UUIDs and cleans up in afterAll. Schema DDL
 * (applying 064/066/067/068) runs under withSchemaLock so it serializes
 * against sibling workers.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { withSchemaLock } from '../helpers/schemaLock.js';
import {
  recordMigrationCanon,
  rollbackPatch,
  getPatch,
  rejectPatch,
} from '../../src/services/RevisionService.js';
import { queryOLTP } from '@las-flores/infra';

const { Pool } = pg;

// Dedicated synthetic IDs (collision-avoidance per AGENTS.md).
const CHARACTER_ID = 'f0000000-0000-4000-8000-000000000001';
const NEW_CHARACTER_ID = 'f0000000-0000-4000-8000-0000000000bb';
const PLAN_ID = 'f0000000-0000-4000-8000-0000000000aa';

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
    `DELETE FROM canon_revisions WHERE plan_id = $1 OR entity_id = $2::uuid`,
    [PLAN_ID, CHARACTER_ID],
  );
  await pool.query(
    `DELETE FROM patches WHERE plan_id = $1`,
    [PLAN_ID],
  );
  await pool.query(`DELETE FROM characters WHERE id = ANY($1::uuid[])`, [
    [CHARACTER_ID, NEW_CHARACTER_ID],
  ]);
  await pool.query(`DELETE FROM content_plans WHERE id = $1::uuid`, [PLAN_ID]);
}

describe('revision-rollback', () => {
  beforeAll(async () => {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores',
      connectionTimeoutMillis: 5000,
    });
    // Ensure the M24 tables + extended admin_events CHECK exist.
    await applyMigration('064_patch_versioning.sql');
    await applyMigration('066_claims.sql');
    await applyMigration('067_admin_events_audit.sql');
    await applyMigration('068_admin_events_audit_validate.sql');

    // Clean any prior state for our synthetic ids.
    await clearState();

    // Create a synthetic content_plans row (required FK for plan_id).
    await pool.query(
      `INSERT INTO content_plans (id, description, plan_json, status)
       VALUES ($1::uuid, 'revision rollback fixture', '{"items":[],"links":[]}'::jsonb, 'draft')`,
      [PLAN_ID],
    );
  });

  afterAll(async () => {
    await clearState();
    await pool.end();
  });
test('rollback restores the prior canon snapshot via lookup', async () => {
    // 1. Insert a synthetic character in its initial state ("Alpha").
    await pool.query(
      `INSERT INTO characters (id, name, description)
       VALUES ($1::uuid, 'Alpha', 'initial description')`,
      [CHARACTER_ID],
    );

    // 2. Record the first revision (snapshot = Alpha).
    const patch1 = await recordMigrationCanon({
      planId: PLAN_ID,
      title: 'seed alpha',
      userId: undefined,
      appliedMigrations: [{ contentType: 'character', contentId: CHARACTER_ID, action: 'updated' }],
    });
    expect(patch1).toBeTruthy();

    // 3. Mutate the character and record a second revision (patch2).
    await pool.query(
      `UPDATE characters SET name = 'Beta', description = 'changed description' WHERE id = $1::uuid`,
      [CHARACTER_ID],
    );
    const patch2 = await recordMigrationCanon({
      planId: PLAN_ID,
      title: 'mutate to beta',
      userId: undefined,
      appliedMigrations: [{ contentType: 'character', contentId: CHARACTER_ID, action: 'updated' }],
    });

    // Sanity: the DB currently holds "Beta".
    const beforeRollback = await pool.query<{ name: string }>(
      `SELECT name FROM characters WHERE id = $1::uuid`,
      [CHARACTER_ID],
    );
    expect(beforeRollback.rows[0].name).toBe('Beta');

    // 4. Rollback patch2 — should restore "Alpha" from the prior snapshot.
    const result = await rollbackPatch(patch2, undefined);
    expect(result.patchId).toBe(patch2);
    expect(result.restored).toHaveLength(1);
    expect(result.restored[0].entityType).toBe('character');
    expect(result.restored[0].entityId).toBe(CHARACTER_ID);

    const afterRollback = await pool.query<{ name: string; description: string }>(
      `SELECT name, description FROM characters WHERE id = $1::uuid`,
      [CHARACTER_ID],
    );
    expect(afterRollback.rows[0].name).toBe('Alpha');
    expect(afterRollback.rows[0].description).toBe('initial description');

    // patch2 is now rolled_back.
    const rolledBack = await getPatch(patch2);
    expect(rolledBack.status).toBe('rolled_back');
  });

  test('rollback of a patch that created an entity removes the row (toRevision null)', async () => {
    // Fresh synthetic id created by a single patch with no prior revision.
    const newCharId = NEW_CHARACTER_ID;
    await pool.query(
      `INSERT INTO characters (id, name, description)
       VALUES ($1::uuid, 'Newborn', 'freshly created')`,
      [newCharId],
    );
    const patch = await recordMigrationCanon({
      planId: PLAN_ID,
      title: 'create newborn',
      userId: undefined,
      appliedMigrations: [{ contentType: 'character', contentId: newCharId, action: 'created' }],
    });

    const result = await rollbackPatch(patch, undefined);
    expect(result.restored).toHaveLength(1);
    expect(result.restored[0].toRevision).toBeNull();

    const gone = await pool.query(
      `SELECT 1 FROM characters WHERE id = $1::uuid`,
      [newCharId],
    );
    expect(gone.rows).toHaveLength(0);
  });

  test('rejecting a patch is a no-op on canon', async () => {
    // Reject does not touch canon — this is the "patch → rejected → no-op" contract.
    const c = await queryOLTP<{ id: string }>(
      `INSERT INTO patches (plan_id, title, status) VALUES ($1, 'proposed noop', 'proposed') RETURNING id`,
      [PLAN_ID],
    );
    const patchId = c.rows[0].id;
    await rejectPatch(patchId, 'author rejected', undefined);
    const patch = await getPatch(patchId);
    expect(patch.status).toBe('rejected');
    expect(patch.conflictReason).toBe('author rejected');
  });
});