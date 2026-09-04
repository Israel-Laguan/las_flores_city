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
import { getDeltasForPlan, getPlanDeltaRevisionWithEdges, getDeltaEdgesForPlan } from './GraphDeltaService.js';
import type { GraphDelta } from '@las-flores/shared';
import { PlanConsistencyChecker, Neo4jGraphView } from './PlanConsistencyChecker.js';
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
  /**
   * Optimistic-concurrency version for the cache entry. Every write mints a
   * fresh value; `setJobStatus` passes the version it read back into the CAS so
   * a concurrent same-run write that landed between the read and the write is
   * detected (the CAS returns a snapshot-conflict code and the write is retried
   * against the newer entry) instead of silently erasing the other write's
   * stage/publish/migration data.
   */
  version?: string;
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

      // M50 AC7: attach a non-blocking semantic consistency report (see helper).
      try {
        exported = await attachConsistencyReport(planId, deltas, exported);
      } catch (err) {
        console.warn(
          `[PlanConsistencyCheck] skipped for ${planId}: ${(err as Error).message}`,
        );
      }
    }
  }

  // M28: bind the export to the graph revision it was built from. A concurrent
  // applyDelta/applyDeltaEdge (Neo4j) between the export read above and the
  // re-check below would change the plan's delta set or edges. To minimize the
  // TOCTOU window, we perform the re-check INSIDE the OLTP transaction's advisory
  // lock. This means Neo4j latency briefly holds the lock, but it ensures the
  // revision we check is the same one we persist against. The lock is held for
  // only the duration of the Neo4j read + comparison, not the full export.
  // Mint a fresh run token BEFORE the transaction so the durable job_runs row
  // (created inside the transaction below) can carry it. A legacy resume reads
  // this same token from the DB, so it must exist before the plan commits to
  // `pending`.
  const runToken = randomUUID();
  let jobRunId: string | undefined;

  await withOLTPTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [planId]);

    // Re-validate the graph revision INSIDE the lock to ensure atomicity:
    // if a concurrent applyDelta/applyDeltaEdge modified the graph after our
    // export, the revision will differ and we abort before persisting.
    if (exported) {
      let nowRevision: string;
      try {
        nowRevision = await getPlanDeltaRevisionWithEdges(planId);
      } catch (err) {
        throw new PlanStatusError(
          `Could not re-validate the graph revision before persisting; approve aborted (${(err as Error).message})`,
        );
      }
      if (nowRevision !== exported._meta?.plan_revision) {
        throw new PlanStatusError(
          'Graph changed during approve (a new delta or edge was detected after export); please review and retry.',
        );
      }
    }

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

    // 2b. Create the durable job-runs row INSIDE the same transaction and under
    //     the plan-row lock. This synchronizes run insertion with the legacy
    //     resume ownership check in `resumeSolidify` (which also takes the plan
    //     row `FOR UPDATE`): because both serialize on the plan row, a newer
    //     approve-and-solidify can only observe the NEW run, so a legacy resume
    //     can never flip the plan back to `failed` behind it. Creating the run
    //     outside the lock (as before) left a window where the plan was `pending`
    //     but no new run row existed yet, letting a concurrent legacy resume see
    //     the OLD run and clobber the plan to `failed`. If the table is
    //     unavailable the whole transaction rolls back and the caller surfaces
    //     the error instead of leaving a half-created run.
    const run = await startJobRun(planId, 'solidify', { runToken }, client);
    jobRunId = run.id;
  });

  // 2. Write initial cache status only after the transaction commits, so a
  //    commit failure cannot leave a stale pending cache entry. Issue the run
  //    token so stale terminal writes from a prior run can be rejected.
  await setJobStatus(planId, { status: 'pending' }, runToken);

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
 * M50 AC7: attach a non-blocking semantic consistency report to the exported
 * plan before it is persisted. Runs after drift check + export; warns (never
 * blocks) on location-district mismatches, prose-vs-field contradictions, and
 * orphan relationships. Findings land on `exported._consistency` for the review
 * UI. A checker/view error is swallowed as an advisory skip — approval is never
 * gated on the semantic layer.
 */
async function attachConsistencyReport(
  planId: string,
  deltas: GraphDelta[],
  exported: ContentPlan | null,
): Promise<ContentPlan | null> {
  if (!exported) return exported;
  const edges = await getDeltaEdgesForPlan(planId);
  const report = await new PlanConsistencyChecker(new Neo4jGraphView()).check(
    planId,
    deltas,
    edges,
  );
  if (!report.hasConflicts) return exported;
  exported._consistency = report;
  for (const f of report.findings) {
    const loc = `${f.nodeType ?? '?'}:${f.nodeId ?? '?'}`;
    console.warn(
      `[PlanConsistencyCheck] [${planId}] ${f.code}: ${f.message} (${loc})`,
    );
  }
  return exported;
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

  // Preserve the ownership token issued by the original approve-and-solidify run.
  // First try the cache (hot path), then fall back to the durable job run's
  // run_token field (survives cache eviction). This ensures resumes and retries
  // observe the same compare-and-set protocol as the initial run.
  const cachedStatus = await getSolidifyJobStatus(planId);
  let runToken = cachedStatus?.runToken;
  
  // If cache was evicted, try to get the token from the durable job run
  if (!runToken && run?.runToken) {
    runToken = run.runToken;
    console.log(
      `[story-builder] Using runToken from DB for resume of plan ${planId} (cache was evicted)`,
    );
  }

  // A resume MUST carry the original run's ownership token so its status writes
  // flow through the compare-and-set (CAS) guard. Without one — cache evicted
  // AND the durable job run has no run_token (e.g. a pre-074 run) — the writes
  // below would fall into unguarded `legacy` mode and could silently replace a
  // (possibly newer) run's stage/publish/migration. Reject the resume so it can
  // never clobber another run's state.
  //
  // We mark THIS job run failed in the DB (scoped by run.id, and it flips its
  // status away from `resumable` so it stops here), but we deliberately do NOT
  // touch the shared plan-status cache: we hold no token to guard that write
  // with, and a write without one is exactly the unguarded `legacy` overwrite
  // that could clobber a newer run's cached status.
  if (!runToken) {
    console.warn(
      `[story-builder] Refusing to resume solidify for plan ${planId}: no runToken ` +
      '(cache evicted and job run has no run_token); cannot resume in unguarded legacy mode.',
    );
    await updateJobRun(run.id, { status: 'failed', error: 'Cannot resume: missing run_token' });
    // The polling endpoint reads `content_plans.status` whenever the job-status
    // cache is miss (e.g. evicted). Mark the plan terminal via the DB so the
    // endpoint stops reporting a nonterminal status and the user can retry.
    //
    // Two guards make this write safe:
    //
    //  1. Status guard: only the nonterminal statuses a crashed solidify run
    //     could have left behind are flipped. The transient statuses
    //     (`pending`/`staging`/`migrating`/`verifying`) are written ONLY by
    //     runSolidify (never by the manual /stage or /migrate routes), so a crash
    //     mid-stage always strands the plan in one of them and they can be
    //     flipped unconditionally. `staged` and `migrated`, however, are ALSO
    //     set by the manual /stage and /migrate routes WITHOUT creating a
    //     solidify job run. Flipping them purely on status would let a stale
    //     legacy resumable run clobber a plan that was staged/migrated manually
    //     (e.g. a valid `migrated` plan flipped to `failed`, blocking /verify).
    //     So for those two we additionally require that THIS legacy run's own
    //     lifecycle committed the matching stage (`run.committedStages`): a
    //     crash right after solidify's own commit leaves the marker set, while a
    //     manual migration leaves it unset. `verified` is excluded because it is
    //     a successful terminal state.
    //
    //  2. Ownership guard: `getJobRun` is only a snapshot, so a retry could
    //     start a NEWER solidify run between that read and this write. The
    //     status predicate alone is not enough — a newer run legitimately sets
    //     `staging`/`migrating` again, and a stale write would clobber it. So
    //     the update is bound to this legacy run still being the latest
    //     solidify run for the plan; if a newer run exists, the subquery no
    //     longer matches `run.id` and the write no-ops.
    // Serialize this failure write with the approve-and-solidify retry path by
    // taking the SAME `content_plans` row lock (`FOR UPDATE`) the approve
    // transaction holds. Both lock the plan row, so a newer retry run cannot be
    // inserted (startJobRun runs inside that locked transaction) between the
    // ownership check and this UPDATE. Inside the lock we re-read the latest
    // solidify run and only flip the plan to `failed` when this legacy run is
    // still the owner — otherwise the newer run legitimately owns the plan and
    // the write no-ops.
    await withOLTPTransaction(async (client) => {
      await client.query('SELECT 1 FROM content_plans WHERE id = $1 FOR UPDATE', [planId]);
      await client.query(
        `UPDATE content_plans SET status = 'failed', updated_at = NOW()
         WHERE id = $1
           AND status IN ('pending', 'staging', 'migrating', 'verifying')
           AND $2 = (
             SELECT id FROM job_runs
              WHERE plan_id = $1 AND job_type = 'solidify'
              ORDER BY created_at DESC, id DESC
              LIMIT 1
           )`,
         [planId, run.id],
       );
    });
    return;
  }

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
