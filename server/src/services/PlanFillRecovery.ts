// ============================================================
// PlanFillRecovery - crash recovery for plan-fill jobs (M22)
//
// `resumePlanFill` re-enters a `resumable` fill run after a crash;
// `resetOrphanedFillJobs` reclaims stalled draft plans and resumes
// any orphaned runs. Split out of PlanGenerationJob.ts to keep that
// file within the eslint max-lines budget.
// ============================================================

import { queryOLTP, deleteCache } from '@las-flores/infra';
import type { JobType } from '@las-flores/shared';
import { markOrphanedResumable, getJobRun, nextAttempt, updateJobRun } from './JobRunService.js';
import { sleep } from '../utils/retryBackoff.js';
import { GEN_CACHE_PREFIX, runPlanFillCore, setPlanFillJobStatus } from './PlanGenerationJob.js';

/**
 * Resume a plan-fill job that was left `resumable` after a crash (M22). Consumes
 * one attempt with exponential backoff, then re-enters `runPlanFillCore`, which
 * skips items whose `filled_fields` already exist. No-op when there is no
 * resumable plan-fill run for the plan.
 */
export async function resumePlanFill(planId: string): Promise<void> {
  const run = await getJobRun(planId, 'plan_fill');
  if (!run || run.status !== 'resumable') return;

  const adv = await nextAttempt(planId, 'plan_fill', { existingRun: run });
  if (adv.exhausted) {
    await updateJobRun(run.id, { status: 'failed', error: 'Attempts exhausted during resume' }).catch(() => {});
    await setPlanFillJobStatus(planId, { status: 'failed', error: 'Attempts exhausted during resume' });
    return;
  }
  if (adv.delayMs && adv.delayMs > 0) await sleep(adv.delayMs);

  // Re-enter the fill core; it will read the plan, skip done items, and write
  // back the full result.
  try {
    await runPlanFillCore(planId, run.id);
  } catch (error: any) {
    console.error(`[plan-fill] Resume failed for ${planId}:`, error.message);
    await updateJobRun(run.id, { status: 'resumable', error: error.message }).catch(() => {});
    throw error;
  }
}

export async function resetOrphanedFillJobs(
  orphanedRuns?: Array<{ planId: string; jobType: JobType }>,
  cutoff?: Date,
): Promise<number> {
  const result = await queryOLTP<{ id: string; plan_json: any; updated_at: string }>(
    `SELECT id, plan_json, updated_at FROM content_plans WHERE status = 'draft'`,
  );

  let reset = 0;
  for (const row of result.rows) {
    try {
      const planJson = row.plan_json as any;
      if (planJson?._meta?.scaffolded_at) {
        const updatedAt = new Date(row.updated_at).getTime();
        const now = Date.now();
        const fiveMin = 5 * 60 * 1000;

        // Reclaim only when the plan itself is stale. A missing cache entry alone
        // is not proof of a dead job (best-effort cache writes, TTL expiry), so the
        // age check must always hold before a recent draft is marked failed.
        if ((now - updatedAt) > fiveMin) {
          const items = planJson.items?.filter((i: any) => i.action === 'create') || [];
          const hasProcessed = items.some((i: any) => i.filled_fields?.length > 0);

          if (!hasProcessed) {
            await queryOLTP(
              'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
              ['failed', row.id],
            );
            await deleteCache(`${GEN_CACHE_PREFIX}${row.id}`);
            reset++;
          }
        }
      }
    } catch (err) {
      console.warn(`[plan-fill] Orphan check failed for ${row.id}:`, err);
    }
  }

  if (reset > 0) {
    console.log(`[plan-fill] Reset ${reset} orphaned fill job(s) to failed`);
  }

  // M22: resume any `plan_fill` runs left `running` after a crash. When the caller
  // did not supply the already-claimed orphans, perform a fallback claim bounded
  // by `cutoff` (when provided) so this reconciliation can never reclaim a live
  // run that an intake route created after the startupCutoff.
  const orphaned = orphanedRuns ?? await markOrphanedResumable(cutoff);
  const orphanedFills = orphaned.filter(o => o.jobType === 'plan_fill');
  if (orphanedFills.length > 0) {
    console.log(`[plan-fill] Resuming ${orphanedFills.length} orphaned plan-fill job(s)`);
    for (const { planId } of orphanedFills) {
      try {
        await resumePlanFill(planId);
      } catch (err: any) {
        console.error(`[plan-fill] Resume failed for ${planId}:`, err.message);
      }
    }
  }

  return reset + orphanedFills.length;
}
