import path from 'node:path';
import { queryOLTP } from '@las-flores/infra';
import type { AssetNeed, ContentPlanItem } from '@las-flores/shared';
import { markGenerating, markDrafted, transitionAssetNeed } from '../services/AssetNeedsService.js';
import { generateLocalDrafts, listLocalAssets, resolveEntityRootDir, autoSelectDefaultDrafts } from '../services/LocalDraftService.js';
import { ContentPlanService } from '../services/ContentPlanService.js';
import {
  startJobRun,
  updateJobRun,
  getJobRun,
} from '../services/JobRunService.js';

const IMAGE_GEN_GRACE_PERIOD_MINUTES = 5;

interface PlanRow {
  id: string;
  plan_json: {
    items: ContentPlanItem[];
  };
  status: string;
  updated_at: string;
}

/**
 * ContentAssetWorker
 *
 * Generates image drafts for verified content plans whose asset needs
 * are still in `pending` status. Runs on a setInterval cron beside
 * LeaderboardWorker.
 *
 * Recovery model:
 * - `plan_json` in `content_plans` is the durable substrate; need status
 *   is stored inside it, so restarts can resume.
 * - Idempotent: existing drafts on disk are skipped (no double-gen).
 * - Staleness: needs stuck in `generating` for >5 min are reset to `pending`
 *   so the next tick retries them.
 */
export class ContentAssetWorker {
  /**
   * Reset any `generating` asset needs to `pending` so the worker can retry them.
   * Called at startup to handle plans left in-flight after a crash.
   */
  public static async reclaimStalledNeeds(): Promise<void> {
    // Fetch all plans with any `generating` needs
    const result = await queryOLTP<{ id: string; plan_json: any; updated_at: string }>(
      `SELECT id, plan_json, updated_at FROM content_plans WHERE plan_json @? '$.items[*].assetNeeds[*] ? (@.status == "generating")'`
    );

    for (const row of result.rows) {
      const updated = new Date(row.updated_at);
      const now = new Date();
      const diffMs = now.getTime() - updated.getTime();

      // Only reclaim if stalled (>5 min since last update)
      if (diffMs > IMAGE_GEN_GRACE_PERIOD_MINUTES * 60 * 1000) {
        const plan = row.plan_json as any;
        let changed = false;

        for (const item of plan.items || []) {
          for (const need of item.assetNeeds || []) {
            if (need.status === 'generating') {
              transitionAssetNeed(need, 'pending');
              changed = true;
            }
          }
        }

        if (changed) {
          await ContentPlanService.updatePlanJson(row.id, plan);
          console.log(`[ContentAssetWorker] Reclaimed stalled assets for plan=${row.id}`);
        }
      }
    }
  }

  public static async processPendingImageGeneration(): Promise<void> {
    const result = await queryOLTP<PlanRow>('SELECT id, plan_json, status, updated_at FROM content_plans WHERE status = $1', ['verified']);

    for (const row of result.rows) {
      try {
        await this.processPlan(row);
      } catch (err) {
        console.error(`[ContentAssetWorker] process failed for plan=${row.id}:`, err);
      }
    }
  }

  private static async processPlan(row: PlanRow): Promise<void> {
    const plan = row.plan_json as any;
    if (!plan.items || !Array.isArray(plan.items)) return;

    // M22: skip plans whose asset_generation job is already marked succeeded.
    const existingRun = await getJobRun(row.id, 'asset_generation');
    if (existingRun?.status === 'succeeded') return;

    // Create or resume a job run for this plan.
    let jobId: string | undefined;
    try {
      if (!existingRun || existingRun.status === 'failed') {
        const run = await startJobRun(row.id, 'asset_generation');
        jobId = run.id;
      } else {
        jobId = existingRun.id;
      }
    } catch (err) {
      console.warn(`[ContentAssetWorker] Could not create job run for plan=${row.id}:`, (err as Error).message);
    }

    // First: reclaim any stalled `generating` needs
    const contentDir = process.cwd().endsWith('server')
      ? path.resolve(process.cwd(), '..', 'content')
      : path.resolve(process.cwd(), 'content');

    let reclaimed = false;
    for (const item of plan.items) {
      for (const need of item.assetNeeds || []) {
        if (need.status === 'generating') {
          const isStalled = await this.checkStall(row.updated_at);
          if (isStalled) {
            transitionAssetNeed(need, 'pending');
            reclaimed = true;
          }
        }
      }
    }

    // Persist reclaimed statuses
    if (reclaimed) {
      await ContentPlanService.updatePlanJson(row.id, plan);
    }

    // Then: generate for remaining `pending` needs
    const needsToGenerate = this.extractPendingNeeds(plan.items);
    if (needsToGenerate.length === 0) {
      if (jobId) await updateJobRun(jobId, { status: 'succeeded', stage: 'done' }).catch(() => {});
      return;
    }

    let processed = 0;
    let failed = 0;
    for (const { item, need } of needsToGenerate) {
      // Check if draft already exists (idempotent)
      const entityRoot = resolveEntityRootDir(item, contentDir);
      const existingAssets = await listLocalAssets(entityRoot);
      const hasExisting = existingAssets.length > 0 ||
        (await this.defaultExists(item, entityRoot));
      if (hasExisting) {
        await autoSelectDefaultDrafts(plan, contentDir);
        if (need.status === 'pending') {
          markDrafted(need);
        }
        await ContentPlanService.updatePlanJson(row.id, plan);
        processed++;
        continue;
      }

      // Claim this need
      markGenerating(need);
      await ContentPlanService.updatePlanJson(row.id, plan);

      try {
        const generated = await generateLocalDrafts(item, entityRoot, 1);
        if (generated.length > 0) {
          const draftedFilename = generated[0];
          const fieldName = need.targetField.split('.').pop() || 'asset';
          if (!(item.fields as any).asset_paths) {
            (item.fields as any).asset_paths = {};
          }
          (item.fields as any).asset_paths[fieldName] = draftedFilename;
          markDrafted(need);
          await ContentPlanService.updatePlanJson(row.id, plan);
          processed++;
        }
      } catch (err) {
        console.error(`[ContentAssetWorker] draft gen failed for plan=${row.id}, item=${item.id}:`, err);
        transitionAssetNeed(need, 'failed');
        await ContentPlanService.updatePlanJson(row.id, plan);
        failed++;
      }
      // Persist partial result after each need (best-effort).
      if (jobId) {
        updateJobRun(jobId, {
          stage: 'generating',
          partialResult: { processed, failed, total: needsToGenerate.length },
        }).catch(() => {});
      }
    }

    if (jobId) {
      const finalStatus = failed > 0 && processed === 0 ? 'failed' : 'succeeded';
      await updateJobRun(jobId, {
        status: finalStatus,
        stage: finalStatus === 'succeeded' ? 'done' : 'generating',
        partialResult: { processed, failed, total: needsToGenerate.length },
      }).catch(() => {});
    }
  }

  private static async checkStall(updatedAt: string): Promise<boolean> {
    // A need is stalled if the plan hasn't been updated in > grace period
    const updated = new Date(updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - updated.getTime();
    return diffMs > IMAGE_GEN_GRACE_PERIOD_MINUTES * 60 * 1000;
  }

  private static async defaultExists(item: ContentPlanItem, entityRoot: string): Promise<boolean> {
    try {
      const assets = await listLocalAssets(entityRoot);
      return assets.some((a: { filename: string }) => a.filename === `${item.slug}__default.png`);
    } catch {
      return false;
    }
  }

  private static extractPendingNeeds(items: any[]): Array<{ item: ContentPlanItem; need: AssetNeed }> {
    const result: Array<{ item: ContentPlanItem; need: AssetNeed }> = [];
    for (const item of items) {
      if (!item.assetNeeds) continue;
      for (const need of item.assetNeeds) {
        const normalized = need as AssetNeed;
        if (normalized.status === 'pending') {
          result.push({ item: item as ContentPlanItem, need: normalized });
        }
      }
    }
    return result;
  }
}