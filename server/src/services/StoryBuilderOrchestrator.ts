import { ContentPlanSchema, type VerificationReport } from '@las-flores/shared';
import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import { setCache, getCache } from '@las-flores/infra';
import { migrateContent } from '../content/migrate.js';
import { ContentPlanService } from './ContentPlanService.js';
import { publishChosenDrafts, type PublishResult } from './AssetPublishService.js';
import { resolveContentDir } from './StoryBuilderLore.js';
import { verifyPlanCrossReferences } from './PlanVerificationService.js';
import { runValidationHarness } from './ValidationHarnessService.js';
import type { HarnessReport } from '@las-flores/shared';
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
import {
  startJobRun,
  updateJobRun,
  commitStage,
  hasCommittedStageById,
  getJobRun,
  getJobRunById,
  nextAttempt,
} from './JobRunService.js';


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
      throw new PlanStatusError(`Plan must be staged or approved before migration. Current status: ${result.rows[0].status}. Use the retry flow to re-stage a failed plan first.`);
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
 * Runs the full solidify pipeline outside a transaction.
 * Updates cache status at each stage and persists final status to DB.
 */
async function failWithHarnessReport(
  planId: string,
  harnessReport: HarnessReport,
  userId?: string,
): Promise<void> {
  const blocking = harnessReport.findings.filter(f => f.severity === 'error');
  const message = blocking.map(f => f.message).join('; ');
  const verificationReport: VerificationReport = {
    planId,
    checkedAt: new Date().toISOString(),
    passed: false,
    checks: harnessReport.findings.map(f => ({
      name: f.code,
      description: f.message,
      status: f.severity === 'error' ? 'fail' : 'warn',
      details: f.itemIds,
    })),
    errors: blocking.map(f => f.message),
    warnings: harnessReport.findings.filter(f => f.severity === 'warning').map(f => f.message),
  };
  await queryOLTP(
    'UPDATE content_plans SET status = $1, verification_report = $2, updated_at = NOW() WHERE id = $3',
    ['failed', JSON.stringify(verificationReport), planId],
  );
  await setJobStatus(planId, {
    status: 'failed',
    verificationReport,
    error: `Validation harness blocked approval: ${message}`,
  });
  emitAdminEvent('plan_failed', { status: 'failed', error: message, harness: harnessReport }, planId, userId);
}

async function failWithVerificationReport(
  planId: string,
  stageResult: StagingResult,
  publishResult: PublishResult,
  migrationResult: MigrationResult,
  verificationReport: VerificationReport,
  userId?: string,
): Promise<void> {
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
}

async function runSolidify(planId: string, userId?: string, jobId?: string): Promise<void> {
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
    let currentStatus = load.rows[0].status;

    // Already fully verified — nothing to do (idempotent resume).
    if (currentStatus === 'verified') {
      await setJobStatus(planId, { status: 'verified' });
      if (jobId) await updateJobRun(jobId, { status: 'succeeded', stage: 'verified' });
      return;
    }

    let stageResult: StagingResult | undefined;
    let publishResult: PublishResult | undefined;
    let migrationResult: MigrationResult | undefined;

    // Prefer durable cross-stage state (partial_result) over the ephemeral cache.
    const resumingRun = jobId ? await getJobRunById(jobId) : null;
    if (resumingRun?.partialResult && typeof resumingRun.partialResult === 'object') {
      const pr = resumingRun.partialResult as Record<string, unknown>;
      stageResult = pr.stage as StagingResult | undefined;
      publishResult = pr.publish as PublishResult | undefined;
    }
    if (!stageResult || !publishResult) {
      const cached = await getCache<SolidifyJobStatus>(`${JOB_CACHE_PREFIX}${planId}`);
      stageResult = stageResult ?? cached?.stage;
      publishResult = publishResult ?? cached?.publish;
    }

    // --- Resume rewind (M22) ---
    // A `failed` plan is re-entered from its last COMMITTED stage (the job's
    // idempotency guard), not blindly treated as already staged + published:
    //   * staging + publish committed → rewind to `staged` and migrate
    //   * otherwise                   → rewind to `staging` so the harness /
    //     stage / publish block below re-runs the missing stages first.
    // `migrating` is always rewound to `staged` so migration can complete.
    if (currentStatus === 'failed') {
      if (!resumingRun) {
        throw new PlanStatusError(`Plan ${planId} has failed and cannot be resumed.`);
      }
      const committed = resumingRun.committedStages ?? [];
      if (committed.includes('staging') && committed.includes('publish')) {
        await queryOLTP(
          'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
          ['staged', planId],
        );
        currentStatus = 'staged';
      } else {
        await queryOLTP(
          'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
          ['staging', planId],
        );
        currentStatus = 'staging';
      }
    } else if (currentStatus === 'migrating') {
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['staged', planId],
      );
      currentStatus = 'staged';
    }

    // --- Deterministic pre-approve harness gate + staging ---
    // Runs for a fresh approve, or for a resume whose staging/publish had not
    // fully committed (rewound to `staging` above) so the missing stages are
    // re-run before migration.
    if (currentStatus === 'pending' || currentStatus === 'staging') {
      if (jobId) await updateJobRun(jobId, { status: 'running', stage: 'harness' });

      const context = await contentPlanService.gatherContext();
      const harnessReport: HarnessReport = runValidationHarness(plan, context);
      if (!harnessReport.passed) {
        await failWithHarnessReport(planId, harnessReport, userId);
        if (jobId) await updateJobRun(jobId, { status: 'failed', stage: 'harness', error: 'Validation harness blocked approval' });
        return;
      }
      if (jobId) await commitStage(jobId, 'harness');

      // --- Stage: write YAML + lore + prompt files to disk ---
      await setJobStatus(planId, { status: 'staging' });
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['staging', planId],
      );

      const provider = createLLMProvider();
      stageResult = await stagePlan(plan, { provider, context });
      if (!stageResult.success) {
        throw new Error(stageResult.error ?? 'Staging failed');
      }

      // Persist LLM-filled fields
      await queryOLTP(
        'UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2',
        [plan, planId],
      );
      if (jobId) await commitStage(jobId, 'staging');
      if (jobId) {
        await updateJobRun(jobId, { partialResult: { stage: stageResult } });
      }

      // Publish chosen drafts (idempotent: dev-label URL entry updated in place;
      // already-published plans are skipped via the committed-stage guard).
      if (jobId && (await hasCommittedStageById(jobId, 'publish'))) {
        // Load existing publish result from durable state so we don't overwrite
        // it with an empty value in the cache below.
        const run = await getJobRunById(jobId);
        if (run?.partialResult && typeof run.partialResult === 'object') {
          publishResult = (run.partialResult as Record<string, unknown>).publish as PublishResult | undefined;
        }
      } else {
        publishResult = await publishChosenDrafts(planId);
      }
      if (publishResult && !publishResult.success) {
        throw new Error('Asset publish failed');
      }
      // Persist the publish result BEFORE committing the stage guard, so a crash
      // between the two still leaves the publish result durable for resume (M22).
      if (jobId && publishResult !== undefined) {
        const run = await getJobRunById(jobId);
        const partial = (run?.partialResult as Record<string, unknown> | undefined) ?? {};
        await updateJobRun(jobId, { partialResult: { ...partial, publish: publishResult } });
      }
      if (jobId) await commitStage(jobId, 'publish');
      const statusPatch: Partial<SolidifyJobStatus> = {
        status: 'staging',
        stage: stageResult,
      };
      if (publishResult !== undefined) {
        statusPatch.publish = publishResult;
      }
      await setJobStatus(planId, statusPatch);

      // --- Stage complete → mark as 'staged' for migrateStagedPlan validation ---
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['staged', planId],
      );
      if (jobId) await commitStage(jobId, 'staged');
      currentStatus = 'staged';
    }

    // --- Migrate (idempotent via migration_log + content_migration lock) ---
    // migrateStagedPlan requires status 'staged'/'approved'; a run that died
    // mid-migrate is rewound to 'staged' so migration can complete (already
    // migrated files are skipped by checksum inside migrateContent).
    if (currentStatus === 'migrated' || currentStatus === 'verifying' || currentStatus === 'verified') {
      // already migrated — resume directly to verify (rewind 'verifying' for verifyPlan)
      if (currentStatus === 'verifying') {
        await queryOLTP(
          'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
          ['migrated', planId],
        );
      }
    } else {
      // Note: rewind of `failed` / `migrating` plans happens at the top of
      // runSolidify so the correct stage gate runs on this very resume.
      if (jobId) await updateJobRun(jobId, { status: 'running', stage: 'migrating' });
      await setJobStatus(planId, { status: 'migrating', stage: stageResult, publish: publishResult });

      migrationResult = await migrateStagedPlan(planId, undefined, stageResult?.createdFiles);
      await setJobStatus(planId, { status: 'migrating', stage: stageResult, publish: publishResult, migration: migrationResult });

      if (!migrationResult.success) {
        if (jobId) await updateJobRun(jobId, { status: 'resumable', stage: 'migrating', error: migrationResult.error });
        throw new Error(migrationResult.error ?? 'Migration failed');
      }
      if (jobId) await commitStage(jobId, 'migrated');
    }

    // --- Verify (read-only; no double-apply risk) ---
    if (jobId) await updateJobRun(jobId, { status: 'running', stage: 'verifying' });
    await setJobStatus(planId, { status: 'verifying', stage: stageResult, publish: publishResult, migration: migrationResult });
    if (currentStatus !== 'verifying') {
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['verifying', planId],
      );
    }

    const verificationReport = await verifyPlan(planId);

    // --- Terminal: verified or failed ---
    if (!verificationReport.passed) {
      await failWithVerificationReport(
        planId,
        stageResult ?? { success: false, createdFiles: [], updatedFiles: [], validationErrors: [], warnings: [] },
        publishResult ?? { success: false, published: [], errors: [] },
        migrationResult ?? { success: false, migrationResult: null },
        verificationReport,
        userId,
      );
      if (jobId) await updateJobRun(jobId, { status: 'failed', stage: 'verifying', error: verificationReport.errors[0] });
      return;
    }

    await queryOLTP(
      'UPDATE content_plans SET status = $1, verification_report = $2, updated_at = NOW() WHERE id = $3',
      ['verified', JSON.stringify(verificationReport), planId],
    );
    if (jobId) {
      await commitStage(jobId, 'verified');
      await updateJobRun(jobId, { status: 'succeeded', stage: 'verified' });
    }
    await setJobStatus(planId, {
      status: 'verified',
      stage: stageResult,
      publish: publishResult,
      migration: migrationResult,
      verificationReport,
    });
    emitAdminEvent('plan_verified', { status: 'verified' }, planId, userId);
    // Terminal signal for the single-click "Approve & Solidify" capstone: emit
    // only after the pipeline fully succeeds. Failures emit `plan_failed` above.
    emitAdminEvent('plan_solidified', { status: 'verified', success: true }, planId, userId);
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
    if (jobId) {
      const isPermanent = error instanceof PlanNotFoundError ||
        error instanceof PlanStatusError ||
        error.name === 'ZodError';
      await updateJobRun(jobId, { status: isPermanent ? 'failed' : 'resumable', error: error.message });
    }
    emitAdminEvent('plan_failed', { status: 'failed', error: error.message }, planId, userId);
  }
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
