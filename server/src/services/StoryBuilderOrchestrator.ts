import { ContentPlanSchema, type VerificationReport } from '@las-flores/shared';
import { queryOLTP, withOLTPTransaction, getCache } from '@las-flores/infra';
import { ContentPlanService } from './ContentPlanService.js';
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
import type { PublishResult } from './AssetPublishService.js';
import { PlanNotFoundError, PlanStatusError } from './errors.js';
import {
  startJobRun,
  updateJobRun,
  getJobRun,
  nextAttempt,
} from './JobRunService.js';
import {
  runSolidify,
  setJobStatus,
  JOB_CACHE_PREFIX,
} from './StoryBuilderSolidify.js';
import { verifyPlan, migrateStagedPlan } from './StoryBuilderMigration.js';

export {
  executePlan,
  previewPlan,
  stagePlan,
  verifyPlan,
  migrateStagedPlan,
};
export type {
  ExecutionResult,
  PreviewResult,
  StagingResult,
};

export interface SolidifyJobStatus {
  planId: string;
  status: 'pending' | 'staging' | 'migrating' | 'verifying' | 'verified' | 'failed';
  stage?: StagingResult;
  publish?: PublishResult;
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
  publish?: PublishResult;
  migration?: MigrationResult;
  verificationReport?: VerificationReport;
  error?: string;
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

  // 2b. Create a durable job-runs row so the solidify job can be resumed from
  //     its last persisted stage if this process dies mid-way (M22). Best-effort:
  //     if the job_runs table is unavailable we fall back to the legacy
  //     fire-and-forget behavior (no resume).
  let jobRunId: string | undefined;
  try {
    const run = await startJobRun(planId, 'solidify');
    jobRunId = run.id;
  } catch (err) {
    console.warn(`[story-builder] Could not create job run for ${planId}:`, (err as Error).message);
  }

  // 3. Fire async solidify OUTSIDE the transaction.
  //    Errors are caught and persisted to status by runSolidify.
  runSolidify(planId, userId, jobRunId).catch((err) => {
    console.error(`[story-builder] Unhandled runSolidify error for ${planId}:`, err);
  });

  return {
    success: true,
    status: 'pending',
  };
}

/**
 * Resume a solidify job that was left `resumable` after a crash (M22). Consumes
 * one attempt with exponential backoff, then re-enters `runSolidify`, which
 * resumes from the last persisted stage (content_plans.status) instead of from
 * scratch. No-op when there is no resumable solidify run for the plan.
 */
export async function resumeSolidify(planId: string, userId?: string): Promise<void> {
  const run = await getJobRun(planId, 'solidify');
  if (!run || run.status !== 'resumable') return;

  const adv = await nextAttempt(planId, 'solidify');
  if (adv.exhausted) {
    await updateJobRun(run.id, { status: 'failed', error: 'Attempts exhausted during resume' });
    await setJobStatus(planId, { status: 'failed', error: 'Attempts exhausted during resume' });
    return;
  }
  if (adv.delayMs && adv.delayMs > 0) {
    setTimeout(() => {
      runSolidify(planId, userId, run.id).catch((err) => {
        console.error(`[story-builder] Resumed runSolidify failed for ${planId}:`, err);
      });
    }, adv.delayMs).unref?.();
    return;
  }
  await runSolidify(planId, userId, run.id);
}
