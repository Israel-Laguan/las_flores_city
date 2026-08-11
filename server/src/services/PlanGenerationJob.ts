import { ContentPlanSchema, type ContentPlanItem, type JobType } from '@las-flores/shared';
import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import { setCache, getCache, deleteCache } from '@las-flores/infra';
import {
  startJobRun,
  getJobRun,
  updateJobRun,
  nextAttempt,
  markOrphanedResumable,
} from './JobRunService.js';
import { sleep } from '../utils/retryBackoff.js';
import { createLLMProvider } from './LLMService.js';
import { contentPlanService } from './ContentPlanService.js';
import { finiteInt } from '../utils/env.js';
import { fillFields, mergeFilledFields } from './ContentFillService.js';
import type { LLMProvider } from './types/LLMTypes.js';
import { resolveContentDir } from './StoryBuilderLore.js';
import { generateYaml, resolveFilePath } from './ContentSkeletonGenerator.js';
import { generateForItem } from './LoreGenerator.js';
import { generatePromptForItem } from './PromptFileGenerator.js';
import path from 'node:path';
import fs from 'node:fs/promises';

const GEN_CACHE_PREFIX = 'story-builder:gen:';

export interface PlanFillJobStatus {
  planId: string;
  status: 'pending' | 'filling' | 'done' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  items: Array<{
    itemId: string;
    status: 'pending' | 'filling' | 'done' | 'failed';
    error?: string;
  }>;
  startedAt: string;
  updatedAt: string;
  error?: string;
}

export async function setPlanFillJobStatus(planId: string, status: Partial<PlanFillJobStatus>): Promise<boolean> {
  const now = new Date().toISOString();
  const existing = await getCache<PlanFillJobStatus>(`${GEN_CACHE_PREFIX}${planId}`);
  const nextStatus = status.status ?? existing?.status ?? 'pending';
  const merged: PlanFillJobStatus = {
    planId,
    status: nextStatus,
    progress: status.progress ?? existing?.progress ?? { total: 0, completed: 0, failed: 0 },
    items: status.items ?? existing?.items ?? [],
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    error: status.error ?? (nextStatus === 'failed' ? existing?.error : undefined),
  };
  return setCache(`${GEN_CACHE_PREFIX}${planId}`, merged, 1800);
}

export async function getPlanFillJobStatus(planId: string): Promise<PlanFillJobStatus | null> {
  return getCache<PlanFillJobStatus>(`${GEN_CACHE_PREFIX}${planId}`);
}

/** Best-effort cancel: drop the cached fill-job status so generation-status polling stops reporting this plan as filling. */
export async function cancelPlanFillStatus(planId: string): Promise<boolean> {
  return deleteCache(`${GEN_CACHE_PREFIX}${planId}`);
}

export async function runPlanFill(planId: string, _userId?: string): Promise<void> {
  let jobId: string | undefined;
  try {
    const run = await startJobRun(planId, 'plan_fill');
    jobId = run.id;
  } catch (err) {
    console.warn(`[plan-fill] Could not create job run for ${planId}:`, (err as Error).message);
  }
  try {
    await runPlanFillCore(planId, jobId);
  } catch (error: any) {
    console.error(`[plan-fill] Job failed for ${planId}:`, error);
    // Compensation: mark cache as failed first, then mark DB as failed.
    let cacheCompensationOk = false;
    let dbCompensationOk = false;
    try {
      const cacheSetOk = await setPlanFillJobStatus(planId, {
        status: 'failed',
        error: error.message,
      });
      if (!cacheSetOk) {
        throw new Error('setCache returned false (Redis write not acknowledged)');
      }
      cacheCompensationOk = true;
    } catch (cacheErr) {
      console.error(`[plan-fill] Failed to mark cache as failed for ${planId}:`, cacheErr);
    }
    try {
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', planId],
      );
      dbCompensationOk = true;
    } catch (dbErr) {
      console.error(`[plan-fill] Failed to mark DB as failed for ${planId}:`, dbErr);
    }
    if (jobId) {
      await updateJobRun(jobId, { status: 'resumable', error: error.message }).catch(() => {});
    }
    if (!cacheCompensationOk || !dbCompensationOk) {
      throw new Error(
        `[plan-fill] Incomplete compensation for ${planId}: cache=${cacheCompensationOk}, db=${dbCompensationOk}: ${error.message}`,
      );
    }
  }
}

async function runPlanFillCore(planId: string, jobId?: string): Promise<void> {
  await setPlanFillJobStatus(planId, { status: 'filling' });
  if (jobId) await updateJobRun(jobId, { status: 'running', stage: 'filling' });

  const planResult = await queryOLTP<{ plan_json: any }>(
    'SELECT plan_json FROM content_plans WHERE id = $1',
    [planId],
  );
  if (planResult.rows.length === 0) {
    throw new Error(`Plan not found: ${planId}`);
  }

  let plan = ContentPlanSchema.parse(planResult.rows[0].plan_json);
  const createItems = plan.items.filter(i => i.action === 'create');

  if (createItems.length === 0) {
    await setPlanFillJobStatus(planId, {
      status: 'done',
      progress: { total: 0, completed: 0, failed: 0 },
      items: [],
    });
    await withOLTPTransaction(async (client) => {
      await client.query(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        ['proposed', planId],
      );
    });
    if (jobId) await updateJobRun(jobId, { status: 'succeeded', stage: 'done' });
    return;
  }

  // Resume: skip items whose filled_fields already exist (persisted incrementally
  // after each successful fillAndWriteItem, so non-empty filled_fields implies
  // both a successful file commit and completion of the relevant fill targets).
  const items: PlanFillJobStatus['items'] = createItems.map(item => ({
    itemId: item.id,
    status: (item.filled_fields?.length ?? 0) > 0 ? 'done' : 'pending',
  }));

  await setPlanFillJobStatus(planId, {
    status: 'filling',
    progress: { total: createItems.length, completed: items.filter(i => i.status === 'done').length, failed: 0 },
    items,
  });

  const provider = createLLMProvider();
  const context = await contentPlanService.gatherContext();
  const contentDir = resolveContentDir();

  const concurrency = Math.max(1, finiteInt(process.env.PLAN_FILL_CONCURRENCY, 3));
  const timeoutMs = finiteInt(process.env.PLAN_FILL_TIMEOUT_MS, 120000);

  for (let i = 0; i < createItems.length; i += concurrency) {
    const batch = createItems.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (item, batchIdx) => {
        const itemStatusIdx = i + batchIdx;
        if (items[itemStatusIdx].status === 'done') return;
        try {
          items[itemStatusIdx].status = 'filling';
          await setPlanFillJobStatus(planId, { items: [...items] });

          await fillAndWriteItem(item, provider, context, contentDir, timeoutMs);

          // Persist filled_fields incrementally so a crash-resumed run can skip
          // this item without regenerating completed content.
          await queryOLTP(
            'UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2',
            [plan, planId],
          ).catch(err => console.warn(`[plan-fill] Item progress persist failed for ${planId}:`, (err as Error).message));

          items[itemStatusIdx].status = 'done';
          await setPlanFillJobStatus(planId, { items: [...items] });
        } catch (err: any) {
          console.warn(`[plan-fill] Fill failed for ${item.name}: ${err.message}`);
          items[itemStatusIdx].status = 'failed';
          items[itemStatusIdx].error = err.message;
          await setPlanFillJobStatus(planId, { items: [...items] });
        }
      }),
    );

    // Persist partial result once per batch so concurrent updates cannot
    // commit out of order.
    if (jobId) {
      await updateJobRun(jobId, {
        partialResult: {
          completed: items.filter(it => it.status === 'done').length,
          failed: items.filter(it => it.status === 'failed').length,
          items: items.map(it => ({ itemId: it.itemId, status: it.status })),
        },
      }).catch(() => {});
    }

    // Persist merged fields after each batch so a crash-resumed run can skip
    // items whose `filled_fields` are already committed.
    await queryOLTP(
      'UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2',
      [plan, planId],
    ).catch(err => console.warn(`[plan-fill] Batch progress persist failed for ${planId}:`, (err as Error).message));
  }

  const completed = items.filter(i => i.status === 'done').length;
  const failed = items.filter(i => i.status === 'failed').length;
  const finalStatus = failed > 0 && completed === 0 ? 'failed' : 'done';
  await setPlanFillJobStatus(planId, {
    status: finalStatus,
    progress: { total: createItems.length, completed, failed },
  });

  await withOLTPTransaction(async (client) => {
    await client.query(
      'UPDATE content_plans SET plan_json = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [plan, finalStatus === 'failed' ? 'failed' : 'proposed', planId],
    );
  });

  if (jobId) {
    await updateJobRun(jobId, {
      status: finalStatus === 'failed' ? 'failed' : 'succeeded',
      stage: finalStatus,
      partialResult: {
        completed,
        failed,
        items: items.map(it => ({ itemId: it.itemId, status: it.status })),
      },
    });
  }
}

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

async function fillAndWriteItem(
  item: ContentPlanItem,
  provider: LLMProvider,
  context: Awaited<ReturnType<typeof contentPlanService.gatherContext>>,
  contentDir: string,
  timeoutMs: number,
): Promise<void> {
  const fillResult = await fillFieldsWithTimeout(item, context, provider, timeoutMs);

  if (Object.keys(fillResult.fields).length > 0) {
    mergeFilledFields(item, fillResult.fields);
  }
  if (fillResult.lore_refs && fillResult.lore_refs.length > 0) {
    const existing = item.lore_refs ?? [];
    item.lore_refs = Array.from(new Set([...existing, ...fillResult.lore_refs]));
  }

  const filePath = resolveFilePath(item);
  const fullPath = path.join(contentDir, filePath);
  const yamlContent = generateYaml(item);
  await fs.writeFile(fullPath, yamlContent, 'utf-8');

  try {
    await generateForItem(item, provider, context, true);
  } catch (loreErr) {
    console.warn(`[plan-fill] Failed to generate lore for ${item.name}: ${(loreErr as Error).message}`);
  }

  try {
    await generatePromptForItem(item, contentDir, true);
  } catch (promptErr) {
    console.warn(`[plan-fill] Failed to generate prompt for ${item.name}: ${(promptErr as Error).message}`);
  }
}

async function fillFieldsWithTimeout(
  item: ContentPlanItem,
  context: Parameters<typeof fillFields>[1],
  provider: Parameters<typeof fillFields>[2],
  timeoutMs: number,
) {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Fill timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([fillFields(item, context, provider), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function resetOrphanedFillJobs(orphanedRuns?: Array<{ planId: string; jobType: JobType }>): Promise<number> {
  const result = await queryOLTP<{ id: string; plan_json: any; updated_at: string }>(
    `SELECT id, plan_json, updated_at FROM content_plans WHERE status = 'draft'`,
  );

  let reset = 0;
  for (const row of result.rows) {
    try {
      const planJson = row.plan_json as any;
      if (planJson?._meta?.scaffolded_at) {
        const cached = await getCache<PlanFillJobStatus>(`${GEN_CACHE_PREFIX}${row.id}`);
        const updatedAt = new Date(row.updated_at).getTime();
        const now = Date.now();
        const fiveMin = 5 * 60 * 1000;

        if (!cached || (now - updatedAt) > fiveMin) {
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

  // M22: resume any `plan_fill` runs left `running` after a crash.
  const orphaned = orphanedRuns ?? await markOrphanedResumable();
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