// ============================================================
// RevisionService - patch-level canon versioning (M24)
//
// `patches` is the unit of versioning. A rejected proposal is a
// `patch → rejected → no-op` (rejectPatch mutates nothing in canon).
// Applying a patch records, per affected entity, a new immutable
// `canon_revisions` row carrying the post-patch snapshot, so that a
// rollback is a *lookup* (find the before-snapshot we already stored)
// rather than an inverse-reasoning task against the DB.
//
// Snapshot/restore is entity-agnostic: we read a content row into a
// jsonb snapshot and restore it with `jsonb_populate_record`, so the
// service works for any content table that has a UUID `id` column.
// ============================================================

import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import type pg from 'pg';
import type {
  Patch,
  PatchCreate,
  CanonRevision,
  RollbackResult,
  PatchOp,
} from '@las-flores/shared';
import { PatchSchema, CanonRevisionSchema } from '@las-flores/shared';
import { emitAdminEvent } from './AdminEventEmitter.js';
import {
  PatchNotFoundError,
  PatchStatusError,
} from './errors.js';
import { uuidv4 } from './ContentPlanValidation.js';

// Content tables that have a UUID `id` column and can be snapshotted /
// restored generically. `story` / `story_beat` use a text slug PKs and are
// excluded from snapshot restore (their canon_revisions are not recorded).
const SNAPSHOT_TABLE_BY_TYPE: Record<string, string | undefined> = {
  character: 'characters',
  dialogue: 'dialogue_trees',
  overlay: 'dialogue_overlays',
  scene: 'scenes',
  location: 'scenes',
  gig: 'gigs',
  mission: 'mysteries',
  vault: 'vault_items',
  shop_item: 'shop_items',
  map_tile: 'map_tiles',
};

export interface MigrationPatchInput {
  planId: string;
  title: string;
  description?: string;
  userId?: string;
  /** contentType + contentId pairs from `migrateContent().appliedMigrations`. */
  appliedMigrations: Array<{ contentType: string; contentId: string; action: string }>;
}

/**
 * Read the current full row of a content entity as a jsonb snapshot.
 * Returns null when the table is unknown (not snapshot-able) or the row is
 * not present.
 */
async function readSnapshot(
  contentType: string,
  entityId: string,
  exec: (text: string, params: any[]) => Promise<pg.QueryResult>,
): Promise<{ table: string; snapshot: unknown } | null> {
  const table = SNAPSHOT_TABLE_BY_TYPE[contentType];
  if (!table) return null;

  // Run the snapshot SELECT inside a savepoint so a failed read (which leaves the
  // enclosing transaction in the aborted state) is scoped and rolled back here,
  // letting later statements in the same withOLTPTransaction continue.
  const savepoint = `snap_${Math.random().toString(36).slice(2, 10)}`;
  await exec(`SAVEPOINT ${savepoint}`, []);
  try {
    const result = await exec(
      `SELECT row_to_json(t) AS snapshot FROM ${table} t WHERE t.id = $1::uuid`,
      [entityId],
    );
    await exec(`RELEASE SAVEPOINT ${savepoint}`, []);
    if (result.rows.length === 0) return null;
    return { table, snapshot: result.rows[0].snapshot };
  } catch (err) {
    await exec(`ROLLBACK TO SAVEPOINT ${savepoint}`, []);
    // Release the savepoint after rolling back to it so a later failed read in
    // the same transaction does not accumulate stale savepoints (each failed
    // snapshot would otherwise leave its guard savepoint active until the
    // enclosing withOLTPTransaction finishes).
    await exec(`RELEASE SAVEPOINT ${savepoint}`, []);
    console.warn(`[revision] Could not snapshot ${contentType}/${entityId}:`, (err as Error).message);
    return null;
  }
}

/** Returns the next revision_number for an entity. */
async function nextRevisionNumber(
  entityType: string,
  entityId: string,
  exec: (text: string, params: any[]) => Promise<pg.QueryResult>,
): Promise<number> {
  const res = await exec(
    `SELECT COALESCE(MAX(revision_number), 0) + 1 AS next
       FROM canon_revisions
      WHERE entity_type = $1 AND entity_id = $2::uuid`,
    [entityType, entityId],
  );
  return Number(res.rows[0]?.next ?? 1);
}

/**
 * Create a new patch in `proposed` state (no canon mutation yet).
 * Used for manually-authored patches before any migration runs.
 */
export async function createPatch(input: PatchCreate, userId?: string): Promise<string> {
  const result = await queryOLTP<{ id: string }>(
    `INSERT INTO patches (plan_id, title, description, patch_json, status, created_by)
     VALUES ($1, $2, $3, $4::jsonb, 'proposed', $5)
     RETURNING id`,
    [
      input.planId || null,
      input.title,
      input.description || null,
      JSON.stringify(input.patchJson ?? { ops: [] }),
      userId || null,
    ],
  );
  const patchId = result.rows[0].id;
  emitAdminEvent('patch_created', { patchId, title: input.title, status: 'proposed' }, input.planId ?? undefined, userId);
  return patchId;
}
/**
 * Apply a proposed patch: transitions it to `applied`, records a
 * `canon_revisions` row for each op in the patch_json (the post state is
 * captured from the DB at apply time), and stamps applied_by/at.
 */
export async function applyPatch(patchId: string, userId?: string): Promise<void> {
  await withOLTPTransaction(async (client) => {
    const exec = (text: string, params: any[]): Promise<pg.QueryResult> => client.query(text, params);
    const load = await exec('SELECT id, status, patch_json FROM patches WHERE id = $1 FOR UPDATE', [patchId]);
    if (load.rows.length === 0) throw new PatchNotFoundError(patchId);
    if (load.rows[0].status !== 'proposed') {
      throw new PatchStatusError(`Patch must be 'proposed' to apply. Current: ${load.rows[0].status}`);
    }
    const ops: PatchOp[] = load.rows[0].patch_json?.ops ?? [];

    for (const op of ops) {
      const after = await readSnapshot(op.entityType, op.entityId, exec);
      // For a `delete` op the live row is already gone at apply time, so there
      // is no post-patch snapshot to read — but rollback needs the *pre-delete*
      // state to restore the entity, so fall back to op.before. Non-delete ops
      // keep using the live snapshot; ops with no recoverable state are skipped.
      const snapshot = after ? after.snapshot : (op.op === 'delete' ? op.before : undefined);
      if (snapshot === undefined) continue;
      const rev = await nextRevisionNumber(op.entityType, op.entityId, exec);
      await exec(
        `INSERT INTO canon_revisions
           (entity_type, entity_id, revision_number, content_snapshot, applied_patch_id, created_by)
         VALUES ($1, $2::uuid, $3, $4::jsonb, $5, $6)`,
        [op.entityType, op.entityId, rev, JSON.stringify(snapshot), patchId, userId || null],
      );
    }

    await exec(
      `UPDATE patches SET status = 'applied', applied_by = $1, applied_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [userId || null, patchId],
    );
  });

  emitAdminEvent('patch_applied', { patchId }, undefined, userId);
}

/**
 * Reject an AI proposal: `patch → rejected → no-op`. No canon mutation is
 * performed; the patch is merely marked rejected with the conflict reason.
 */
export async function rejectPatch(patchId: string, conflictReason: string, userId?: string): Promise<void> {
  await withOLTPTransaction(async (client) => {
    const exec = (text: string, params: any[]): Promise<pg.QueryResult> => client.query(text, params);
    const load = await exec('SELECT status FROM patches WHERE id = $1 FOR UPDATE', [patchId]);
    if (load.rows.length === 0) throw new PatchNotFoundError(patchId);
    // Only a `proposed` patch may be rejected. Rejecting an `applied` patch
    // would strand its canon_revisions in an unreachable state (rollback only
    // accepts `applied`), so restrict the transition here.
    if (load.rows[0].status !== 'proposed') {
      throw new PatchStatusError(`Only proposed patches can be rejected. Current: ${load.rows[0].status}`);
    }
    await exec(
      `UPDATE patches
          SET status = 'rejected', conflict_reason = $1, rejected_at = NOW(), updated_at = NOW()
        WHERE id = $2`,
      [conflictReason || null, patchId],
    );
  });
  emitAdminEvent('patch_rejected', { patchId, conflictReason }, undefined, userId);
}
/**
 * Rollback an applied patch by restoring each entity's prior canon snapshot.
 * This is a pure *lookup*: the before-state was stored when the patch was
 * applied, so we never compute an "inverse" of the patch — we restore the
 * recorded snapshot.
 */
export async function rollbackPatch(patchId: string, userId?: string): Promise<RollbackResult> {
  const { planId, restored } = await withOLTPTransaction(async (client) => {
    const exec = (text: string, params: any[]): Promise<pg.QueryResult> => client.query(text, params);
    const load = await exec('SELECT id, status, plan_id FROM patches WHERE id = $1 FOR UPDATE', [patchId]);
    if (load.rows.length === 0) throw new PatchNotFoundError(patchId);
    if (load.rows[0].status !== 'applied') {
      throw new PatchStatusError(`Only applied patches can be rolled back. Current: ${load.rows[0].status}`);
    }
    const planId: string | null = load.rows[0].plan_id;

    const revisionsResult = await exec(
      `SELECT entity_type, entity_id, revision_number, content_snapshot
         FROM canon_revisions
        WHERE applied_patch_id = $1
        ORDER BY revision_number ASC`,
      [patchId],
    );
    const revisions = revisionsResult.rows as Array<{
      entity_type: string; entity_id: string; revision_number: number; content_snapshot: any;
    }>;

    const restored: RollbackResult['restored'] = [];

    for (const revRow of revisions) {
      const entityType = revRow.entity_type;
      const entityId = revRow.entity_id;
      const table = SNAPSHOT_TABLE_BY_TYPE[entityType];
      if (!table) continue; // not snapshot-able; nothing to restore generically

      // Find the prior snapshot (the state before this patch's revision) via lookup.
      const priorResult = await exec(
        `SELECT content_snapshot, revision_number
           FROM canon_revisions
          WHERE entity_type = $1 AND entity_id = $2::uuid
            AND revision_number < $3
          ORDER BY revision_number DESC
          LIMIT 1`,
        [entityType, entityId, revRow.revision_number],
      );

      const prior = priorResult.rows as Array<{ content_snapshot: any; revision_number: number }>;

      if (prior.length === 0) {
        // The entity was created by this patch — rollback removes it.
        await exec(`DELETE FROM ${table} WHERE id = $1::uuid`, [entityId]);
        restored.push({ entityType, entityId, toRevision: null });
        continue;
      }

      const priorSnapshot = prior[0].content_snapshot;
      if (priorSnapshot == null) continue;

      // Determine whether the live row still exists. Three distinct cases:
      //   1) updated by this patch  → row exists → restore IN PLACE
      //      (preserves the primary key / generated columns and keeps any
      //      ON DELETE CASCADE dependents attached)
      //   2) created by this patch  → handled above by DELETE when prior is empty
      //   3) deleted by this patch  → row is gone but has a prior snapshot → we
      //      must re-INSERT it (an in-place UPDATE would match 0 rows).
      const existsResult = await exec(
        `SELECT 1 FROM ${table} WHERE id = $1::uuid`,
        [entityId],
      );
      if (existsResult.rows.length === 0) {
        // Case 3 — restore a deleted entity by re-inserting its prior snapshot.
        await exec(
          `INSERT INTO ${table}
             SELECT * FROM jsonb_populate_record(NULL::${table}, $1::jsonb)`,
          [JSON.stringify(priorSnapshot)],
        );
      } else {
        const colResult = await exec(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
              AND is_identity = 'NO' AND is_generated = 'NEVER'
            ORDER BY ordinal_position`,
          [table],
        );
        const cols: string[] = colResult.rows.map((r) => r.column_name as string);
        if (cols.length > 0) {
          const setList = cols.map((c) => `${c} = (p).${c}`).join(', ');
          await exec(
            `UPDATE ${table} t
                SET ${setList}
               FROM jsonb_populate_record(NULL::${table}, $1::jsonb) AS p
              WHERE t.id = $2::uuid`,
            [JSON.stringify(priorSnapshot), entityId],
          );
        }
      }
      restored.push({ entityType, entityId, toRevision: prior[0].revision_number });
    }

    await exec(
      `UPDATE patches SET status = 'rolled_back', updated_at = NOW() WHERE id = $1`,
      [patchId],
    );

    return { planId, restored };
  });

  // Emit only after the transaction has committed: a rollback that fails mid-way
  // must not record a patch_rolled_back event for an audit entry that never
  // happened (matches applyPatch / rejectPatch post-commit emission).
  emitAdminEvent('patch_rolled_back', { patchId, restored }, planId ?? undefined, userId);
  return { patchId, restored };
}
/**
 * Record canon changes produced by a successful `migrateContent`. Creates a
 * `patches` row (status `applied`) plus one `canon_revisions` row per
 * affected entity. Best-effort: a snapshot-ability failure for one entity
 * must not fail the whole migration.
 */
export async function recordMigrationCanon(input: MigrationPatchInput): Promise<string> {
  const patchId = uuidv4();
  const ops: PatchOp[] = [];

  await withOLTPTransaction(async (client) => {
    const exec = (text: string, params: any[]): Promise<pg.QueryResult> => client.query(text, params);
    await exec(
      `INSERT INTO patches
         (id, plan_id, title, description, patch_json, status, applied_by, applied_at, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'applied', $6, NOW(), $7)`,
      [
        patchId,
        input.planId || null,
        input.title,
        input.description || null,
        JSON.stringify({ ops: [] }),
        input.userId || null,
        input.userId || null,
      ],
    );

    for (const m of input.appliedMigrations) {
      if (m.action === 'skipped') continue;
      const table = SNAPSHOT_TABLE_BY_TYPE[m.contentType];
      if (!table) continue;

      // A single content FILE can migrate multiple entities; migrate.ts joins
      // their ids into a comma-separated `contentId`. Split and record one
      // snapshot + revision per entity so a multi-entity file keeps full patch
      // coverage (passing the joined string as one ::uuid would fail the cast
      // and silently skip every entity in the batch).
      const entityIds = m.contentId.split(',').map((s) => s.trim()).filter(Boolean);
      for (const entityId of entityIds) {
        const after = await readSnapshot(m.contentType, entityId, exec);
        if (!after) continue;

        const op: PatchOp = {
          entityType: m.contentType,
          entityId,
          op: m.action === 'updated' ? 'update' : 'create',
          after: after.snapshot,
        };
        ops.push(op);

        const rev = await nextRevisionNumber(m.contentType, entityId, exec);
        await exec(
          `INSERT INTO canon_revisions
             (entity_type, entity_id, revision_number, content_snapshot, applied_patch_id, plan_id, created_by)
           VALUES ($1, $2::uuid, $3, $4::jsonb, $5, $6, $7)`,
          [m.contentType, entityId, rev, JSON.stringify(after.snapshot), patchId, input.planId || null, input.userId || null],
        );
      }
    }

    // Persist the collected ops onto the patch row (we were inside a txn and
    // needed a stable id first).
    await exec(
      `UPDATE patches SET patch_json = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify({ ops }), patchId],
    );
  });

  emitAdminEvent('patch_applied', { patchId, planId: input.planId, entityCount: ops.length }, input.planId, input.userId);
  return patchId;
}

export async function getPatch(patchId: string): Promise<Patch> {
  const result = await queryOLTP<Record<string, any>>(
    `SELECT id, plan_id, title, description, patch_json, status, conflict_reason,
            applied_by, applied_at, rejected_at, created_by, created_at, updated_at
       FROM patches WHERE id = $1`,
    [patchId],
  );
  if (result.rows.length === 0) throw new PatchNotFoundError(patchId);
  const row = result.rows[0];
  return PatchSchema.parse({
    id: row.id,
    planId: row.plan_id,
    title: row.title,
    description: row.description,
    patchJson: row.patch_json ?? { ops: [] },
    status: row.status,
    conflictReason: row.conflict_reason,
    appliedBy: row.applied_by,
    appliedAt: row.applied_at ? new Date(row.applied_at).toISOString() : null,
    rejectedAt: row.rejected_at ? new Date(row.rejected_at).toISOString() : null,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

export async function listPatchesForPlan(planId: string): Promise<Patch[]> {
  const result = await queryOLTP<Record<string, any>>(
    `SELECT id, plan_id, title, description, patch_json, status, conflict_reason,
            applied_by, applied_at, rejected_at, created_by, created_at, updated_at
       FROM patches
      WHERE plan_id = $1
      ORDER BY created_at DESC`,
    [planId],
  );
  return result.rows.map((row) =>
    PatchSchema.parse({
      id: row.id,
      planId: row.plan_id,
      title: row.title,
      description: row.description,
      patchJson: row.patch_json ?? { ops: [] },
      status: row.status,
      conflictReason: row.conflict_reason,
      appliedBy: row.applied_by,
      appliedAt: row.applied_at ? new Date(row.applied_at).toISOString() : null,
      rejectedAt: row.rejected_at ? new Date(row.rejected_at).toISOString() : null,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }),
  );
}

export async function listRevisions(entityType: string, entityId: string): Promise<CanonRevision[]> {
  const result = await queryOLTP<Record<string, any>>(
    `SELECT id, entity_type, entity_id, revision_number, content_snapshot,
            applied_patch_id, plan_id, created_by, created_at
       FROM canon_revisions
      WHERE entity_type = $1 AND entity_id = $2::uuid
      ORDER BY revision_number ASC`,
    [entityType, entityId],
  );
  return result.rows.map((row) =>
    CanonRevisionSchema.parse({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      revisionNumber: row.revision_number,
      contentSnapshot: row.content_snapshot,
      appliedPatchId: row.applied_patch_id,
      planId: row.plan_id,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).toISOString(),
    }),
  );
}