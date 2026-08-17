import { randomUUID } from 'node:crypto';
import { ContentPlanSchema, type VerificationReport, type ContentPlan } from '@las-flores/shared';
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
import { isNeo4jEnabled } from './Neo4jClient.js';
import { detectGraphDrift } from './GraphMerger.js';
import { exportContentPlan, GraphExportError } from './GraphExporter.js';
import { getDeltasForPlan, getPlanDeltaRevision } from './GraphDeltaService.js';
import {
  startJobRun,
  updateJobRun,
  getJobRun,
  nextAttempt,
} from './JobRunService.js';
import { runSolidify } from './StoryBuilderSolidify.js';
import { setJobStatus, JOB_CACHE_PREFIX } from './StoryBuilderJobStatus.js';
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
  /**
   * Per-run token used for compare-and-set (CAS) of the cache. A retry/approve
   * of the same plan issues a fresh token; stale terminal writes from a prior
   * run that are still in flight are rejected so they cannot overwrite a newer
   * run's status. Set by the `pending` write that initializes a run.
   */
  runToken?: string;
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
  // --- M28 graph-authoritative path (OUTSIDE the OLTP transaction) ---
  // Drift detection + export hit Neo4j and the whole content store; running
  // them inside the advisory/row lock would stall approvals (and other plans'
  // approvals behind the advisory lock) if Neo4j is slow. Pre-compute the
  // exported plan here, then re-validate inside the transaction and persist it
  // only if the status is still approvable.
  let exported: ContentPlan | null = null;
  if (isNeo4jEnabled()) {
    // Lightweight existence/status guard BEFORE any graph I/O: a plan that is
    // already gone or not in an approvable state must fail immediately with a
    // clear PlanStatusError/PlanNotFoundError — never with a graph-availability
    // error that masks the real reason for the rejection.
    const pre = await queryOLTP<{ status: string }>(
      'SELECT status FROM content_plans WHERE id = $1',
      [planId],
    );
    if (pre.rows.length === 0) {
      throw new PlanNotFoundError(planId);
    }
    const preStatus = pre.rows[0].status;
    if (preStatus !== 'proposed' && preStatus !== 'approved' && preStatus !== 'failed') {
      throw new PlanStatusError(`Plan must be 'proposed', 'approved', or 'failed' to approve. Current: ${preStatus}`);
    }

    const deltas = await getDeltasForPlan(planId);
    if (deltas.length > 0) {
      const drift = await detectGraphDrift();
      if (!drift.inSync) {
        throw new PlanStatusError(
          `Graph has drifted from the content store (orphan: ${drift.orphanNodes.length}, missing: ${drift.missingNodes.length}, orphanEdges: ${drift.orphanEdges.length}, missingEdges: ${drift.missingEdges.length}). Run \`npm run resync:graph\` before approving.`,
        );
      }
      try {
        const planRow = await queryOLTP<{ description: string }>(
          'SELECT plan_json->>\'description\' AS description FROM content_plans WHERE id = $1',
          [planId],
        );
        const description = planRow.rows[0]?.description ?? 'Graph-authored plan';
        exported = await exportContentPlan(planId, description);
      } catch (err) {
        if (err instanceof GraphExportError) {
          throw new PlanStatusError(err.message);
        }
        throw err;
      }
    }
  }

  // M28: bind the export to the graph revision it was built from. A concurrent
  // applyDelta/applyDeltaEdge (Neo4j) between the export read above and this
  // re-check would change the plan's delta set; abort the approve so plan_json is
  // never persisted against a graph the exporter did not actually read, and whose
  // newer deltas commitGraph would later promote past it. Kept OUTSIDE the OLTP
  // transaction to honor the design goal that Neo4j latency never holds the plan
  // advisory/row lock — this is one lightweight delta-list read, not the export.
  if (exported) {
    let nowRevision: string;
    try {
      nowRevision = await getPlanDeltaRevision(planId);
    } catch (err) {
      throw new PlanStatusError(
        `Could not re-validate the graph revision before persisting; approve aborted (${(err as Error).message})`,
      );
    }
    if (nowRevision !== exported._meta?.plan_revision) {
      throw new PlanStatusError(
        'Graph changed during approve (a new delta was detected after export); please review and retry.',
      );
    }
  }

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

    // Persist the pre-computed export only if this plan still carries deltas
    // and is still approvable (status may have changed between the read above
    // and now — the FOR UPDATE lock guards that window).
    if (exported) {
      await client.query(
        'UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2',
        [exported, planId],
      );
    }

    // 1. Lock the plan and set pending status.
    await ContentPlanService.setStatus(planId, 'pending', client);
  });

  // 2. Write initial cache status only after the transaction commits, so a
  //    commit failure cannot leave a stale pending cache entry. Issue a fresh
  //    run token so stale terminal writes from a prior run can be rejected.
  const runToken = randomUUID();
  await setJobStatus(planId, { status: 'pending' }, runToken);

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
  runSolidify(planId, userId, jobRunId, runToken).catch((err) => {
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

  // Preserve the ownership token issued by the original approve-and-solidify run
  // (carried in the cached job status) so resumes and retries observe the same
  // compare-and-set protocol as the initial run — instead of mixing in the
  // job-run id, which the CAS would treat as a foreign/stale token. If the cache
  // was evicted (or the plan is resumable with no cached status), writes fall
  // back to the legacy best-effort path (no token), which is safe for a resume.
  const cachedStatus = await getSolidifyJobStatus(planId);
  const runToken = cachedStatus?.runToken;

  const adv = await nextAttempt(planId, 'solidify');
  if (adv.exhausted) {
    await updateJobRun(run.id, { status: 'failed', error: 'Attempts exhausted during resume' });
    await setJobStatus(planId, { status: 'failed', error: 'Attempts exhausted during resume' }, runToken);
    return;
  }
  if (adv.delayMs && adv.delayMs > 0) {
    setTimeout(() => {
      runSolidify(planId, userId, run.id, runToken).catch((err) => {
        console.error(`[story-builder] Resumed runSolidify failed for ${planId}:`, err);
      });
    }, adv.delayMs).unref?.();
    return;
  }
  await runSolidify(planId, userId, run.id, runToken);
}
