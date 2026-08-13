import { ContentPlanSchema, type ContentPlanItem } from '@las-flores/shared';
import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import { setCache, getCache, deleteCache } from '@las-flores/infra';
import { startJobRun, updateJobRun } from './JobRunService.js';
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
import { resetOrphanedFillJobs } from './PlanFillRecovery.js';

export { resetOrphanedFillJobs };

export const GEN_CACHE_PREFIX = 'story-builder:gen:';

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

type PlanFillContext = Awaited<ReturnType<typeof contentPlanService.gatherContext>>;
type ParsedPlan = ReturnType<typeof ContentPlanSchema.parse>;

async function processFillBatch(
  batch: ContentPlanItem[],
  startIndex: number,
  items: PlanFillJobStatus['items'],
  planId: string,
  jobId: string | undefined,
  provider: LLMProvider,
  context: PlanFillContext,
  contentDir: string,
  timeoutMs: number,
  persistPlanProgress: () => Promise<unknown>,
): Promise<void> {
  await Promise.all(
    batch.map(async (item, batchIdx) => {
      const itemStatusIdx = startIndex + batchIdx;
      if (items[itemStatusIdx].status === 'done') return;
      try {
        items[itemStatusIdx].status = 'filling';
        await setPlanFillJobStatus(planId, { items: [...items] });

        await fillAndWriteItem(item, provider, context, contentDir, timeoutMs);

        // Persist filled_fields incrementally so a crash-resumed run can skip
        // this item without regenerating completed content.
        await persistPlanProgress();

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
}

async function finalizePlanFill(
  planId: string,
  jobId: string | undefined,
  createItems: ContentPlanItem[],
  items: PlanFillJobStatus['items'],
  plan: ParsedPlan,
): Promise<void> {
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
    // Best-effort: a failure to record the final succeeded job run must not
    // propagate into runPlanFillCore's compensation handler and overwrite the
    // just-committed `proposed` plan status with `failed`.
    await updateJobRun(jobId, {
      status: finalStatus === 'failed' ? 'failed' : 'succeeded',
      stage: finalStatus,
      partialResult: {
        completed,
        failed,
        items: items.map(it => ({ itemId: it.itemId, status: it.status })),
      },
    }).catch(() => {});
  }
}

export async function runPlanFillCore(planId: string, jobId?: string): Promise<void> {
  await setPlanFillJobStatus(planId, { status: 'filling' });
  if (jobId) await updateJobRun(jobId, { status: 'running', stage: 'filling' });

  const planResult = await queryOLTP<{ plan_json: any }>(
    'SELECT plan_json FROM content_plans WHERE id = $1',
    [planId],
  );
  if (planResult.rows.length === 0) {
    throw new Error(`Plan not found: ${planId}`);
  }

  const plan = ContentPlanSchema.parse(planResult.rows[0].plan_json);
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

  // Serialize the incremental plan_json checkpoints: each write replaces the
  // ENTIRE shared plan_json, so two in-flight item completes during a concurrent
  // batch could otherwise overwrite one another and lose a completed item. The
  // shared in-memory `plan` accumulates every completed item, so serialized
  // writes preserve the fullest committed state (a crash mid-batch keeps each
  // finished item resumable).
  let planPersistChain: Promise<unknown> = Promise.resolve();
  const persistPlanProgress = (): Promise<unknown> => {
    planPersistChain = planPersistChain
      .then(() =>
        queryOLTP(
          'UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2',
          [plan, planId],
        ),
      )
      .catch((err) => {
        console.warn(`[plan-fill] Item progress persist failed for ${planId}:`, (err as Error).message);
      });
    return planPersistChain;
  };

  for (let i = 0; i < createItems.length; i += concurrency) {
    const batch = createItems.slice(i, i + concurrency);
    await processFillBatch(batch, i, items, planId, jobId, provider, context, contentDir, timeoutMs, persistPlanProgress);

    // Persist merged fields after each batch so a crash-resumed run can skip
    // items whose `filled_fields` are already committed.
    await queryOLTP(
      'UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2',
      [plan, planId],
    ).catch(err => console.warn(`[plan-fill] Batch progress persist failed for ${planId}:`, (err as Error).message));
  }

  await finalizePlanFill(planId, jobId, createItems, items, plan);
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
