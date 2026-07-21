import { ContentPlanSchema, type ContentPlanItem } from '@las-flores/shared';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { setCache, getCache, deleteCache } from '../database/redis.js';
import { createLLMProvider } from './LLMService.js';
import { contentPlanService } from './ContentPlanService.js';
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

export async function setPlanFillJobStatus(planId: string, status: Partial<PlanFillJobStatus>): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getCache<PlanFillJobStatus>(`${GEN_CACHE_PREFIX}${planId}`);
  const merged: PlanFillJobStatus = {
    planId,
    status: status.status ?? existing?.status ?? 'pending',
    progress: status.progress ?? existing?.progress ?? { total: 0, completed: 0, failed: 0 },
    items: status.items ?? existing?.items ?? [],
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    error: status.error ?? existing?.error,
  };
  await setCache(`${GEN_CACHE_PREFIX}${planId}`, merged, 1800);
}

export async function getPlanFillJobStatus(planId: string): Promise<PlanFillJobStatus | null> {
  return getCache<PlanFillJobStatus>(`${GEN_CACHE_PREFIX}${planId}`);
}

export async function runPlanFill(planId: string, _userId?: string): Promise<void> {
  try {
    await setPlanFillJobStatus(planId, { status: 'filling' });

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
      return;
    }

    const items: PlanFillJobStatus['items'] = createItems.map(item => ({
      itemId: item.id,
      status: 'pending',
    }));
    await setPlanFillJobStatus(planId, {
      status: 'filling',
      progress: { total: createItems.length, completed: 0, failed: 0 },
      items,
    });

    const provider = createLLMProvider();
    const context = await contentPlanService.gatherContext();
    const contentDir = resolveContentDir();

    const concurrency = parseInt(process.env.PLAN_FILL_CONCURRENCY || '3', 10);
    const timeoutMs = parseInt(process.env.PLAN_FILL_TIMEOUT_MS || '120000', 10);

    for (let i = 0; i < createItems.length; i += concurrency) {
      const batch = createItems.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (item, batchIdx) => {
          const itemStatusIdx = i + batchIdx;
          try {
            items[itemStatusIdx].status = 'filling';
            await setPlanFillJobStatus(planId, { items: [...items] });

            await fillAndWriteItem(item, provider, context, contentDir, timeoutMs);

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
  } catch (error: any) {
    console.error(`[plan-fill] Job failed for ${planId}:`, error);
    await setPlanFillJobStatus(planId, {
      status: 'failed',
      error: error.message,
    });
    await queryOLTP(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      ['failed', planId],
    );
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

export async function resetOrphanedFillJobs(): Promise<number> {
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
  return reset;
}