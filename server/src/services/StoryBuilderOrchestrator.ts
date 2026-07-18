import { ContentPlanSchema, type VerificationReport } from '@las-flores/shared';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { setCache, getCache } from '../database/redis.js';
import { migrateContent } from '../content/migrate.js';
import { ContentPlanService } from './ContentPlanService.js';
import { publishChosenDrafts } from './AssetPublishService.js';
import { resolveContentDir } from './StoryBuilderLore.js';
import { verifyPlanCrossReferences } from './PlanVerificationService.js';
import { PlanNotFoundError, PlanStatusError } from './errors.js';
import {
  executePlan,
  previewPlan,
  stagePlan,
} from './StoryBuilderPlanOps.js';
import type {
  ExecutionResult,
  PreviewResult,
  StagingResult,
} from './StoryBuilderPlanOps.js';
import { createLLMProvider } from './LLMService.js';
import { contentPlanService } from './ContentPlanService.js';
import { emitAdminEvent } from './AdminEventEmitter.js';


export {
  executePlan,
  previewPlan,
  stagePlan,
};
export type {
  ExecutionResult,
  PreviewResult,
  StagingResult,
};

const JOB_CACHE_PREFIX = 'story-builder:job:';

export interface SolidifyJobStatus {
  planId: string;
  status: 'pending' | 'staging' | 'migrating' | 'verifying' | 'verified' | 'failed';
  stage?: StagingResult;
  publish?: import('./AssetPublishService.js').PublishResult;
  migration?: MigrationResult;
  verificationReport?: VerificationReport;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

/** Read the current async solidify job status from cache (hot path) or DB. */
export async function getSolidifyJobStatus(planId: string): Promise<SolidifyJobStatus | null> {
  const cached = await getCache<SolidifyJobStatus>(`${JOB_CACHE_PREFIX}${planId}`);
  if (cached) return cached;

  // Cache miss — fall back to DB status
  const result = await queryOLTP<{ status: string; verification_report: any }>(
    'SELECT status, verification_report FROM content_plans WHERE id = $1',
    [planId],
  );
  if (result.rows.length === 0) return null;

  const dbStatus = result.rows[0].status;
  const terminalStatuses = ['verified', 'failed'];
  if (!terminalStatuses.includes(dbStatus)) return null;

  return {
    planId,
    status: dbStatus as SolidifyJobStatus['status'],
    verificationReport: result.rows[0].verification_report ?? undefined,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Write job status to cache (hot read path for polling). */
async function setJobStatus(planId: string, status: Partial<SolidifyJobStatus>): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getCache<SolidifyJobStatus>(`${JOB_CACHE_PREFIX}${planId}`);
  const merged: SolidifyJobStatus = {
    planId,
    status: status.status ?? existing?.status ?? 'pending',
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    ...status,
  };
  // Cache TTL: 30 minutes — long enough for slow plans, short enough to not leak
  await setCache(`${JOB_CACHE_PREFIX}${planId}`, merged, 1800);
}

export interface MigrationResult {
  success: boolean;
  migrationResult: any;
  error?: string;
}

export interface SolidifyResult {
  success: boolean;
  status: 'approved' | 'staged' | 'migrated' | 'verified' | 'failed'
    | 'pending' | 'staging' | 'migrating' | 'verifying';
  stage?: StagingResult;
  publish?: import('./AssetPublishService.js').PublishResult;
  migration?: MigrationResult;
  verificationReport?: VerificationReport;
  error?: string;
}

export async function migrateStagedPlan(planId: string, client?: import('pg').PoolClient, files?: string[]): Promise<MigrationResult> {
  const exec = (text: string, params: any[]) =>
    client ? client.query<any>(text, params) : queryOLTP<any>(text, params);
  try {
    const result = await exec(
      'SELECT plan_json, status FROM content_plans WHERE id = $1',
      [planId]
    );

    if (result.rows.length === 0) {
      throw new PlanNotFoundError(planId);
    }

    if (result.rows[0].status !== 'staged' && result.rows[0].status !== 'approved') {
      throw new PlanStatusError(`Plan must be staged before migration. Current status: ${result.rows[0].status}`);
    }

    // Take ownership of the migrating transition here so callers do not set
    // status to migrating before this function validates the plan.
    await exec(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      ['migrating', planId]
    );

    const contentDir = resolveContentDir();

    const migrationResult = await migrateContent(contentDir, files);

    // Propagate migration failure: do not flip to 'migrated' on partial failure.
    if (!migrationResult.success) {
      await exec(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', planId]
      );
      return {
        success: false,
        migrationResult,
        error: migrationResult.errors.join('; '),
      };
    }

    const newStatus = 'migrated';
    await exec(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, planId]
    );

    return {
      success: true,
      migrationResult,
      error: undefined,
    };
  } catch (error: any) {
    try {
      await exec(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', planId]
      );
    } catch { /* ignore */ }

    return {
      success: false,
      migrationResult: null,
      error: error.message,
    };
  }
}

/**
 * Single-click "Approve & Solidify" — async launcher.
 *
 * Validates the plan, sets status to `pending`, fires `runSolidify` outside
 * the transaction, and returns immediately. The caller polls
 * `GET /plans/:id/status` for progress.
 */
export async function approveAndSolidifyPlan(planId: string, userId?: string): Promise<SolidifyResult> {
  // Serialize concurrent approve-and-solidify calls per-plan using an
  // advisory lock held for the duration of the transaction.
  await withOLTPTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [planId]);

    const load = await client.query<{ plan_json: any; status: string }>(
      'SELECT plan_json, status FROM content_plans WHERE id = $1 FOR UPDATE',
      [planId],
    );
    if (load.rows.length === 0) {
      throw new PlanNotFoundError(planId);
    }

    const currentStatus = load.rows[0].status;
    if (currentStatus !== 'proposed' && currentStatus !== 'approved' && currentStatus !== 'failed') {
      throw new PlanStatusError(`Plan must be 'proposed', 'approved', or 'failed' to approve. Current: ${currentStatus}`);
    }

    ContentPlanSchema.parse(load.rows[0].plan_json);

    // 1. Lock the plan and set pending status.
    await ContentPlanService.setStatus(planId, 'pending', client);
  });

  // 2. Write initial cache status only after the transaction commits, so a
  //    commit failure cannot leave a stale pending cache entry.
  await setJobStatus(planId, { status: 'pending' });

  // 3. Fire async solidify OUTSIDE the transaction.
  //    Errors are caught and persisted to status by runSolidify.
  runSolidify(planId, userId).catch((err) => {
    console.error(`[story-builder] Unhandled runSolidify error for ${planId}:`, err);
  });

  return {
    success: true,
    status: 'pending',
  };
}

/**
 * Runs the full solidify pipeline outside a transaction.
 * Updates cache status at each stage and persists final status to DB.
 */
async function runSolidify(planId: string, userId?: string): Promise<void> {
  try {
    // Load plan
    const load = await queryOLTP<{ plan_json: any; status: string }>(
      'SELECT plan_json, status FROM content_plans WHERE id = $1',
      [planId],
    );
    if (load.rows.length === 0) {
      throw new PlanNotFoundError(planId);
    }
    const plan = ContentPlanSchema.parse(load.rows[0].plan_json);

    // --- Stage: write YAML + lore + prompt files to disk ---
    await setJobStatus(planId, { status: 'staging' });
    await queryOLTP(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      ['staging', planId],
    );

    const provider = createLLMProvider();
    const context = await contentPlanService.gatherContext();
    const stageResult = await stagePlan(plan, { provider, context });
    if (!stageResult.success) {
      throw new Error(stageResult.error ?? 'Staging failed');
    }

    // Persist LLM-filled fields
    await queryOLTP(
      'UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2',
      [plan, planId],
    );

    // Publish chosen drafts
    const publishResult = await publishChosenDrafts(planId);
    await setJobStatus(planId, { status: 'staging', stage: stageResult, publish: publishResult });

    if (!publishResult.success) {
      throw new Error('Asset publish failed');
    }

    // --- Migrate ---
    // The migrating DB transition is owned by migrateStagedPlan (after it
    // validates the plan as staged/approved), so we only update the cache here.
    await setJobStatus(planId, { status: 'migrating', stage: stageResult, publish: publishResult });

    const migrationResult = await migrateStagedPlan(planId, undefined, stageResult.createdFiles);
    await setJobStatus(planId, { status: 'migrating', stage: stageResult, publish: publishResult, migration: migrationResult });

    if (!migrationResult.success) {
      throw new Error(migrationResult.error ?? 'Migration failed');
    }

    // --- Verify ---
    await setJobStatus(planId, { status: 'verifying', stage: stageResult, publish: publishResult, migration: migrationResult });
    await queryOLTP(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      ['verifying', planId],
    );

    const verificationReport = await verifyPlan(planId);

    // --- Terminal: verified or failed ---
    if (!verificationReport.passed) {
      await queryOLTP(
        'UPDATE content_plans SET status = $1, verification_report = $2, updated_at = NOW() WHERE id = $3',
        ['failed', JSON.stringify(verificationReport), planId],
      );
      await setJobStatus(planId, {
        status: 'failed',
        stage: stageResult,
        publish: publishResult,
        migration: migrationResult,
        verificationReport,
        error: verificationReport.errors[0] || 'Verification failed',
      });
      emitAdminEvent('plan_failed', { status: 'failed', error: verificationReport.errors[0] }, planId, userId);
      return;
    }

    await queryOLTP(
      'UPDATE content_plans SET status = $1, verification_report = $2, updated_at = NOW() WHERE id = $3',
      ['verified', JSON.stringify(verificationReport), planId],
    );
    await setJobStatus(planId, {
      status: 'verified',
      stage: stageResult,
      publish: publishResult,
      migration: migrationResult,
      verificationReport,
    });
    emitAdminEvent('plan_verified', { status: 'verified' }, planId, userId);
  } catch (error: any) {
    console.error(`[story-builder] runSolidify failed for ${planId}:`, error.message);
    try {
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', planId],
      );
    } catch { /* ignore — best-effort persistence */ }
    await setJobStatus(planId, {
      status: 'failed',
      error: error.message,
    });
    emitAdminEvent('plan_failed', { status: 'failed', error: error.message }, planId, userId);
  }
}

/**
 * Reset orphaned in-flight plans to failed on server startup.
 * Plans stuck in pending/staging/migrating/verifying are from a previous
 * process that was interrupted.
 */
export async function resetOrphanedSolidifyJobs(): Promise<number> {
  const result = await queryOLTP(
    `UPDATE content_plans SET status = 'failed', updated_at = NOW()
     WHERE status IN ('pending', 'staging', 'migrating', 'verifying')
     RETURNING id`,
  );
  if (result.rowCount && result.rowCount > 0) {
    console.log(`[story-builder] Reset ${result.rowCount} orphaned in-flight plan(s) to failed`);
    // Also update cache for each
    for (const row of result.rows) {
      await setJobStatus(row.id, { status: 'failed', error: 'Server restarted during solidify' });
    }
  }
  return result.rowCount ?? 0;
}

/**
 * Verify a migrated plan's cross-references.
 * Loads the plan from DB, runs all cross-reference checks, and returns the report.
 */
export async function verifyPlan(planId: string): Promise<VerificationReport> {
  const result = await queryOLTP<{ plan_json: any; status: string }>(
    'SELECT plan_json, status FROM content_plans WHERE id = $1',
    [planId],
  );

  if (result.rows.length === 0) {
    throw new PlanNotFoundError(planId);
  }

  if (result.rows[0].status !== 'migrated') {
    throw new PlanStatusError(`Plan must be migrated before verification. Current status: ${result.rows[0].status}`);
  }

  const plan = ContentPlanSchema.parse(result.rows[0].plan_json);
  const contentDir = resolveContentDir();

  return verifyPlanCrossReferences(plan, contentDir);
}
