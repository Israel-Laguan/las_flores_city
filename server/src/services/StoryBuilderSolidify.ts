// ============================================================
// StoryBuilderSolidify - "Approve & Solidify" async pipeline
//
// Holds the long-running solidify flow (runSolidify) and its
// helpers, migrated out of StoryBuilderOrchestrator.ts to keep
// that file within the eslint max-lines budget. The pipeline is
// staged (harness → stage → publish → migrate → verify) and is
// crash-resumable via durable job_runs state (M22).
// ============================================================

import { ContentPlanSchema, type ContentPlan, type VerificationReport, type HarnessReport } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { getCache, setCache } from '@las-flores/infra';
import { runValidationHarness } from './ValidationHarnessService.js';
import { publishChosenDrafts, type PublishResult } from './AssetPublishService.js';
import { createLLMProvider } from './LLMService.js';
import { contentPlanService } from './ContentPlanService.js';
import { emitAdminEvent } from './AdminEventEmitter.js';
import {
  updateJobRun,
  commitStage,
  hasCommittedStageById,
  getJobRunById,
} from './JobRunService.js';
import { PlanNotFoundError, PlanStatusError } from './errors.js';
import { stagePlan, type StagingResult } from './StoryBuilderPlanOps.js';
import { migrateStagedPlan, verifyPlan } from './StoryBuilderMigration.js';
import type { MigrationResult, SolidifyJobStatus } from './StoryBuilderOrchestrator.js';

export const JOB_CACHE_PREFIX = 'story-builder:job:';

/** Write job status to cache (hot read path for polling). */
export async function setJobStatus(planId: string, status: Partial<SolidifyJobStatus>): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getCache<SolidifyJobStatus>(`${JOB_CACHE_PREFIX}${planId}`);
  // Preserve previously cached fields (stage / publish / migration /
  // verificationReport / error) then overlay only the *defined* values from
  // `status`. Callers such as runMigrationStage and runVerifyAndTerminal pass
  // `stage`/`publish`/`migration` unconditionally even when they have no value
  // to report — stripping those undefined keys here keeps the last known value
  // for polling instead of erasing it. status/startedAt/planId/updatedAt are
  // pinned last so a stale `existing` spread can never win.
  const merged: SolidifyJobStatus = {
    ...existing,
    ...Object.fromEntries(Object.entries(status).filter(([, v]) => v !== undefined)),
    status: status.status ?? existing?.status ?? 'pending',
    startedAt: existing?.startedAt ?? now,
    planId,
    updatedAt: now,
  };
  // When a NEW run is initialized (`pending` is only ever written at the start
  // of a solidify run in approveAndSolidifyPlan), discard per-run fields from a
  // prior run (error / verificationReport / stage / publish / migration) so a
  // retry within the cache TTL never surfaces a stale failure on a fresh,
  // pending or later success.
  if (merged.status === 'pending') {
    merged.stage = undefined;
    merged.publish = undefined;
    merged.migration = undefined;
    merged.verificationReport = undefined;
    merged.error = undefined;
  }
  // Cache TTL: 30 minutes — long enough for slow plans, short enough to not leak
  await setCache(`${JOB_CACHE_PREFIX}${planId}`, merged, 1800);
}

interface SolidifyState {
  currentStatus: string;
  stageResult?: StagingResult;
  publishResult?: PublishResult;
  migrationResult?: MigrationResult;
}

/**
 * Runs the full solidify pipeline outside a transaction.
 * Updates cache status at each stage and persists final status to DB.
 */
export async function runSolidify(planId: string, userId?: string, jobId?: string): Promise<void> {
  const state: SolidifyState = { currentStatus: '' };
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
    state.currentStatus = load.rows[0].status;

    // Already fully verified — nothing to do (idempotent resume).
    if (state.currentStatus === 'verified') {
      await setJobStatus(planId, { status: 'verified' });
      if (jobId) await updateJobRun(jobId, { status: 'succeeded', stage: 'verified' });
      return;
    }

    // Prefer durable cross-stage state (partial_result) over the ephemeral cache.
    const resumingRun = jobId ? await getJobRunById(jobId) : null;
    if (resumingRun?.partialResult && typeof resumingRun.partialResult === 'object') {
      const pr = resumingRun.partialResult as Record<string, unknown>;
      state.stageResult = pr.stage as StagingResult | undefined;
      state.publishResult = pr.publish as PublishResult | undefined;
      state.migrationResult = pr.migration as MigrationResult | undefined;
    }
    if (!state.stageResult || !state.publishResult || state.migrationResult === undefined) {
      const cached = await getCache<SolidifyJobStatus>(`${JOB_CACHE_PREFIX}${planId}`);
      state.stageResult = state.stageResult ?? cached?.stage;
      state.publishResult = state.publishResult ?? cached?.publish;
      // Recover migrationResult from the job cache when it is not yet durable in
      // partialResult: runMigrationStage writes migration into the cache (status
      // `migrating`, line before the success check) immediately after
      // migrateStagedPlan returns, so a crash between the DB `migrated` commit and
      // the partialResult write still leaves the result recoverable here on resume.
      state.migrationResult = state.migrationResult ?? cached?.migration;
    }

    // --- Resume rewind (M22) ---
    // A `failed` plan is re-entered from its last COMMITTED stage (the job's
    // idempotency guard), not blindly treated as already staged + published:
    //   * staging + publish committed → rewind to `staged` and migrate
    //   * otherwise                   → rewind to `staging` so the harness /
    //     stage / publish block below re-runs the missing stages first.
    // `migrating` is always rewound to `staged` so migration can complete.
    await applyResumeRewind(planId, state, resumingRun, jobId);

    // --- Deterministic pre-approve harness gate + staging ---
    if (state.currentStatus === 'pending' || state.currentStatus === 'staging') {
      const harnessBlocked = await runHarnessStagePublish(planId, plan, state, jobId, userId);
      if (harnessBlocked) return;
    }

    // --- Migrate (idempotent via migration_log + content_migration lock) ---
    // migrateStagedPlan requires status 'staged'/'approved'; a run that died
    // mid-migrate is rewound to 'staged' so migration can complete (already
    // migrated files are skipped by checksum inside migrateContent).
    // `verified` is intentionally NOT listed here — runSolidify already returns
    // early for a fully-verified plan (idempotent resume), so it is unreachable
    // at this point.
    if (state.currentStatus === 'migrated' || state.currentStatus === 'verifying') {
      // already migrated — resume directly to verify (rewind 'verifying' for verifyPlan)
      if (state.currentStatus === 'verifying') {
        await queryOLTP(
          'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
          ['migrated', planId],
        );
      }
    } else {
      await runMigrationStage(planId, state, jobId, userId);
    }

    // --- Verify (read-only; no double-apply risk) ---
    const verificationFailed = await runVerifyAndTerminal(planId, plan, state, jobId, userId);
    if (verificationFailed) return;
  } catch (error: any) {
    console.error(`[story-builder] runSolidify failed for ${planId}:`, error.message);
    // Claim/ownership conflicts (PlanStatusError) and a missing plan
    // (PlanNotFoundError) are NOT migration failures of *this* run: a concurrent
    // direct /migrate request may have won the conditional `migrating` claim and
    // legitimately own the row, or the plan may have been archived away. Setting
    // the DB row to `failed` here would corrupt the winner's valid `migrating`
    // plan (and emitting `plan_failed` would misreport a real failure). Match the
    // direct /migrate route, which already preserves plan status for these typed
    // errors, and only flip the plan to `failed` for genuine failures (ZodError /
    // unexpected runtime errors).
    const preservesPlanStatus =
      error instanceof PlanStatusError || error instanceof PlanNotFoundError;
    if (!preservesPlanStatus) {
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
    if (jobId) {
      const isPermanent = preservesPlanStatus || error.name === 'ZodError';
      await updateJobRun(jobId, { status: isPermanent ? 'failed' : 'resumable', error: error.message });
    }
  }
}

async function applyResumeRewind(
  planId: string,
  state: SolidifyState,
  resumingRun: Awaited<ReturnType<typeof getJobRunById>> | null,
  _jobId: string | undefined,
): Promise<void> {
  if (state.currentStatus === 'failed') {
    if (!resumingRun) {
      throw new PlanStatusError(`Plan ${planId} has failed and cannot be resumed.`);
    }
    const committed = resumingRun.committedStages ?? [];
    if (committed.includes('staging') && committed.includes('publish')) {
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['staged', planId],
      );
      state.currentStatus = 'staged';
    } else {
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['staging', planId],
      );
      state.currentStatus = 'staging';
    }
  } else if (state.currentStatus === 'migrating') {
    await queryOLTP(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      ['staged', planId],
    );
    state.currentStatus = 'staged';
  }
}

async function runHarnessStagePublish(
  planId: string,
  plan: ContentPlan,
  state: SolidifyState,
  jobId: string | undefined,
  userId: string | undefined,
): Promise<boolean> {
  if (jobId) await updateJobRun(jobId, { status: 'running', stage: 'harness' });

  const context = await contentPlanService.gatherContext();
  const harnessReport: HarnessReport = runValidationHarness(plan, context);
  if (!harnessReport.passed) {
    await failWithHarnessReport(planId, harnessReport, userId);
    if (jobId) await updateJobRun(jobId, { status: 'failed', stage: 'harness', error: 'Validation harness blocked approval' });
    return true;
  }
  if (jobId) await commitStage(jobId, 'harness');

  // --- Stage: write YAML + lore + prompt files to disk ---
  await setJobStatus(planId, { status: 'staging' });
  await queryOLTP(
    'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
    ['staging', planId],
  );

  const provider = createLLMProvider();
  const stageResult = await stagePlan(plan, { provider, context });
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
      state.publishResult = (run.partialResult as Record<string, unknown>).publish as PublishResult | undefined;
    }
  } else {
    state.publishResult = await publishChosenDrafts(planId);
  }
  if (state.publishResult && !state.publishResult.success) {
    throw new Error('Asset publish failed');
  }
  // Persist the publish result BEFORE committing the stage guard, so a crash
  // between the two still leaves the publish result durable for resume (M22).
  if (jobId && state.publishResult !== undefined) {
    const run = await getJobRunById(jobId);
    const partial = (run?.partialResult as Record<string, unknown> | undefined) ?? {};
    await updateJobRun(jobId, { partialResult: { ...partial, publish: state.publishResult } });
  }
  if (jobId) await commitStage(jobId, 'publish');
  const statusPatch: Partial<SolidifyJobStatus> = {
    status: 'staging',
    stage: stageResult,
  };
  if (state.publishResult !== undefined) {
    statusPatch.publish = state.publishResult;
  }
  await setJobStatus(planId, statusPatch);

  // --- Stage complete → mark as 'staged' for migrateStagedPlan validation ---
  await queryOLTP(
    'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
    ['staged', planId],
  );
  if (jobId) await commitStage(jobId, 'staged');
  state.currentStatus = 'staged';
  state.stageResult = stageResult;
  return false;
}

async function runMigrationStage(
  planId: string,
  state: SolidifyState,
  jobId: string | undefined,
  userId?: string,
): Promise<void> {
  if (jobId) await updateJobRun(jobId, { status: 'running', stage: 'migrating' });
  await setJobStatus(planId, { status: 'migrating', stage: state.stageResult, publish: state.publishResult });

  const migrationResult = await migrateStagedPlan(planId, undefined, state.stageResult?.createdFiles, userId);
  await setJobStatus(planId, { status: 'migrating', stage: state.stageResult, publish: state.publishResult, migration: migrationResult });

  if (!migrationResult.success) {
    if (jobId) await updateJobRun(jobId, { status: 'resumable', stage: 'migrating', error: migrationResult.error });
    throw new Error(migrationResult.error ?? 'Migration failed');
  }
  // Persist the migration result BEFORE committing the `migrated` stage guard, so
  // a crash between the DB `migrated` commit and commitStage() leaves the result
  // durable for resume (matches the publish path). Persist unconditionally rather
  // than gating on `state.migrationResult === undefined`: on resume `migrationResult`
  // may already be populated from the job cache / partialResult (recovery of a crash
  // between the DB `migrated` commit and the earlier partialResult write), but the
  // value computed by THIS run is authoritative and must overwrite any stale entry
  // so durable state always matches the migrated run.
  // Post-commit job_runs bookkeeping is best-effort: a write failure here must not
  // propagate into the enclosing compensation handler and invert an already
  // successful, fully-committed migration.
  if (jobId) {
    const run = await getJobRunById(jobId);
    const partial = (run?.partialResult as Record<string, unknown> | undefined) ?? {};
    await updateJobRun(jobId, { partialResult: { ...partial, migration: migrationResult } }).catch(() => {});
    await commitStage(jobId, 'migrated').catch(() => {});
  }
  state.migrationResult = migrationResult;
}

async function runVerifyAndTerminal(
  planId: string,
  plan: ContentPlan,
  state: SolidifyState,
  jobId: string | undefined,
  userId: string | undefined,
): Promise<boolean> {
  if (jobId) await updateJobRun(jobId, { status: 'running', stage: 'verifying' });
  await setJobStatus(planId, { status: 'verifying', stage: state.stageResult, publish: state.publishResult, migration: state.migrationResult });
  // NOTE: do NOT flip the DB row to `verifying` here. `verifyPlan` requires the
  // row to be `migrated` (StoryBuilderMigration.ts), so switching it to
  // `verifying` would make every normal solidify run fail before verification.
  // The cache (setJobStatus above) already reports `verifying` for polling; the
  // DB row stays `migrated` so a crash mid-verify resumes cleanly and the
  // `verifying` resume-rewind in runSolidify (which rewinds to `migrated`) stays
  // a no-op safety net for any DB row that somehow carries `verifying`.

  const verificationReport = await verifyPlan(planId);

  // --- Terminal: verified or failed ---
  if (!verificationReport.passed) {
    await failWithVerificationReport(
      planId,
      state.stageResult ?? { success: false, createdFiles: [], updatedFiles: [], validationErrors: [], warnings: [] },
      state.publishResult ?? { success: false, published: [], errors: [] },
      state.migrationResult ?? { success: false, migrationResult: null },
      verificationReport,
      userId,
    );
    if (jobId) await updateJobRun(jobId, { status: 'failed', stage: 'verifying', error: verificationReport.errors[0] });
    return true;
  }

  await queryOLTP(
    'UPDATE content_plans SET status = $1, verification_report = $2, updated_at = NOW() WHERE id = $3',
    ['verified', JSON.stringify(verificationReport), planId],
  );
  if (jobId) {
    // Post-commit job_runs bookkeeping is best-effort: a write failure here must
    // not propagate into the enclosing compensation handler and invert an already
    // successful, fully-committed verification.
    await commitStage(jobId, 'verified').catch(() => {});
    await updateJobRun(jobId, { status: 'succeeded', stage: 'verified' }).catch(() => {});
  }
  await setJobStatus(planId, {
    status: 'verified',
    stage: state.stageResult,
    publish: state.publishResult,
    migration: state.migrationResult,
    verificationReport,
  });
  emitAdminEvent('plan_verified', { status: 'verified' }, planId, userId);
  // Terminal signal for the single-click "Approve & Solidify" capstone: emit
  // only after the pipeline fully succeeds. Failures emit `plan_failed` above.
  emitAdminEvent('plan_solidified', { status: 'verified', success: true }, planId, userId);
  return false;
}

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

