import path from 'node:path';
import { queryOLTP } from '@las-flores/infra';
import type { AssetNeed, ContentPlanItem, JobRun } from '@las-flores/shared';
import { markGenerating, markDrafted, transitionAssetNeed } from '../services/AssetNeedsService.js';
import { generateLocalDrafts, listLocalAssets, resolveEntityRootDir, autoSelectDefaultDrafts, getAssetFieldName } from '../services/LocalDraftService.js';
import { ContentPlanService } from '../services/ContentPlanService.js';
import {
  startJobRun,
  updateJobRun,
  getJobRun,
  nextAttempt,
} from '../services/JobRunService.js';
import { sleep } from '../utils/retryBackoff.js';

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

  private static async resolveAssetJobRun(
    row: PlanRow,
  ): Promise<{ jobId: string | undefined; existingRun: JobRun | null; exhausted: boolean; skip?: boolean }> {
    // M22: a succeeded run does not close the plan permanently, because new
    // asset needs can be appended later. Skip only when there is no work.
    // A job_runs lookup error must not abort the whole plan — leave
    // `existingRun` null so we fall through to the failure-tolerant
    // create/resume path below (and the asset-processing fallback can still run).
    let existingRun: JobRun | null = null;
    try {
      existingRun = await getJobRun(row.id, 'asset_generation');
    } catch (err) {
      console.warn(`[ContentAssetWorker] getJobRun failed for plan=${row.id}, proceeding without a prior run:`, (err as Error).message);
    }

    // Create or resume a job run for this plan.
    let jobId: string | undefined;
    try {
      if (!existingRun) {
        const run = await startJobRun(row.id, 'asset_generation');
        jobId = run.id;
      } else if (existingRun.status === 'failed' || existingRun.status === 'resumable') {
        const adv = await nextAttempt(row.id, 'asset_generation', { existingRun });
        if (adv.exhausted) {
          console.log(`[ContentAssetWorker] Attempt budget exhausted for plan=${row.id}`);
          return { jobId: undefined, existingRun, exhausted: true };
        }
        // Honor the shared retry backoff persisted as `next_retry_at` so a
        // fresh cron tick cannot start the next attempt early (burning the
        // attempt budget faster than the retry policy).
        if (adv.delayMs && adv.delayMs > 0) await sleep(adv.delayMs);
        jobId = existingRun.id;
      } else if (existingRun.status === 'running') {
        // A `running` run is normally still owned by the worker that started it —
        // skip unless it has gone stale (plan untouched past the grace period),
        // in which case let it re-enter processPlan so the stalled-need reclaim
        // below can reset `generating` needs and progress the run.
        if (!(await this.checkStall(row.updated_at))) {
          // Still owned by the worker that started it — do not process.
          return { jobId: undefined, existingRun, exhausted: false, skip: true };
        }
        jobId = existingRun.id;
      } else {
        jobId = existingRun.id;
      }
    } catch (err) {
      console.warn(`[ContentAssetWorker] Could not create/resume job run for ${row.id}:`, (err as Error).message);
    }

    return { jobId, existingRun, exhausted: false };
  }

  private static async processAssetNeed(
    row: PlanRow,
    plan: any,
    item: ContentPlanItem,
    need: AssetNeed,
    contentDir: string,
  ): Promise<{ processed: number; failed: number }> {
    // Check if draft already exists (idempotent). Derive the default-exists
    // check from the listing we just fetched to avoid a second directory scan.
    const entityRoot = resolveEntityRootDir(item, contentDir);
    const existingAssets = await listLocalAssets(entityRoot);
    const hasExisting =
      existingAssets.length > 0 ||
      existingAssets.some((a: { filename: string }) => a.filename === `${item.slug}__default.png`);
    if (hasExisting) {
      await autoSelectDefaultDrafts(plan, contentDir);
      // autoSelectDefaultDrafts() resolves still-`pending` needs ONLY when a
      // `<slug>__default.png` exists — and when it fires it resolves EVERY
      // pending need of the item at once (writing asset_paths.<field> and
      // marking each one `chosen`). Preserve `chosen` — downgrading it to
      // `drafted` would make publishChosenDrafts() skip the auto-selected asset
      // and it would never reach MinIO.
      //
      // Each need is then resolved against its OWN recorded target field, not a
      // single per-item flag. autoSelectDefaultDrafts writes asset_paths.<field>
      // for every selected need, so even though the helper only returns one
      // boolean, a LATER same-item need must still be skipped because ITS field
      // was recorded. Gating on the recorded field also covers a non-default,
      // hand-placed asset whose asset_paths.<field> is already present; a need
      // with no recorded field falls through to real generation below.
      const fieldName = getAssetFieldName(need);
      // Only treat a need as already-resolved when the *specific* filename
      // recorded in asset_paths[fieldName] actually exists on disk. A recorded
      // path pointing at a missing/renamed file is not proof of a completed
      // draft — allowing it to persist would skip real generation and leave a
      // dangling asset path in the plan.
      const recordedFilename = (item.fields as any)?.asset_paths?.[fieldName];
      const recordedAssetExists =
        typeof recordedFilename === 'string' &&
        existingAssets.some((a: { filename: string }) => a.filename === recordedFilename);
      if (recordedAssetExists && (need.status === 'pending' || need.status === 'chosen')) {
        if (need.status === 'pending') markDrafted(need);
        await ContentPlanService.updatePlanJson(row.id, plan);
        return { processed: 1, failed: 0 };
      }
    }

    // Claim this need
    markGenerating(need);
    await ContentPlanService.updatePlanJson(row.id, plan);

    try {
      const generated = await generateLocalDrafts(item, entityRoot, 1);
      if (!generated || generated.length === 0) {
        // Headless generation produced no file — the need is still
        // `generating` with nothing on disk. Treat it as a failure so it is
        // not hidden behind a `succeeded` run (the next scan would otherwise
        // wait for stale reclamation before retrying).
        throw new Error('No local draft was generated');
      }
      const draftedFilename = generated[0];
      const fieldName = getAssetFieldName(need) || 'asset';
      if (!(item.fields as any).asset_paths) {
        (item.fields as any).asset_paths = {};
      }
      (item.fields as any).asset_paths[fieldName] = draftedFilename;
      markDrafted(need);
      await ContentPlanService.updatePlanJson(row.id, plan);
      return { processed: 1, failed: 0 };
    } catch (err) {
      console.error(`[ContentAssetWorker] draft gen failed for plan=${row.id}, item=${item.id}:`, err);
      transitionAssetNeed(need, 'failed');
      await ContentPlanService.updatePlanJson(row.id, plan);
      return { processed: 0, failed: 1 };
    }
  }

  private static async processPlan(row: PlanRow): Promise<void> {
    const plan = row.plan_json as any;
    if (!plan.items || !Array.isArray(plan.items)) return;

    const { jobId, existingRun, exhausted, skip } = await this.resolveAssetJobRun(row);
    if (exhausted || skip) return;

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

    // Then: generate for remaining `pending` and `failed` needs
    const needsToGenerate = this.extractPendingNeeds(plan.items);
    const hasGenerating = plan.items.some((item: any) =>
      item.assetNeeds?.some((need: any) => need.status === 'generating')
    );
    if (needsToGenerate.length === 0 && !hasGenerating) {
      // Finalize the *active* run into `succeeded`. This covers both a
      // previously-created run and a run this pass just created (when
      // `existingRun` was null) — otherwise a fresh run with no remaining work
      // would be left `running` forever.
      if (jobId && (!existingRun || existingRun.status !== 'succeeded')) {
        await updateJobRun(jobId, { status: 'succeeded', stage: 'done' }).catch(() => {});
      }
      return;
    }

    // There is work. If we're reusing a previously-`succeeded` run (new asset
    // needs were appended), mark it `running` so a crash mid-processing is
    // recognized by durable orphan recovery and the run is finalized only
    // after the new work commits below.
    if (jobId && existingRun && existingRun.status === 'succeeded') {
      await updateJobRun(jobId, { status: 'running', stage: 'generating' }).catch(() => {});
    }

    let processed = 0;
    let failed = 0;
    for (const { item, need } of needsToGenerate) {
      const delta = await this.processAssetNeed(row, plan, item, need, contentDir);
      processed += delta.processed;
      failed += delta.failed;
      // Persist partial result after each need (best-effort).
      if (jobId) {
        await updateJobRun(jobId, {
          stage: 'generating',
          partialResult: { processed, failed, total: needsToGenerate.length },
        }).catch(() => {});
      }
    }

    if (jobId) {
      // A residual `generating` need here means a worker crashed mid-generation
      // and the need is simply awaiting reclamation (its grace period hasn't
      // elapsed). Do NOT mark the run terminal `failed` in that case — on the next
      // tick a failed run advances through `nextAttempt`, consuming the attempt
      // budget without ever processing that need, so the run can exhaust and never
      // resume. Keep the run `running` so the next scan (once the plan passes its
      // grace period) reclaims the need back to `pending` and actually processes
      // it. Only genuine persisted failures (failed > 0 with no residual
      // generation) are terminal.
      const stillGenerating = plan.items.some((item: any) =>
        item.assetNeeds?.some((need: any) => need.status === 'generating')
      );
      const finalStatus = stillGenerating ? 'running' : failed > 0 ? 'failed' : 'succeeded';
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

  private static extractPendingNeeds(items: any[]): Array<{ item: ContentPlanItem; need: AssetNeed }> {
    const result: Array<{ item: ContentPlanItem; need: AssetNeed }> = [];
    for (const item of items) {
      if (!item.assetNeeds) continue;
      for (const need of item.assetNeeds) {
        const normalized = need as AssetNeed;
        if (normalized.status === 'failed') {
          // Retrying a failed need must re-enter through `pending` before it can
          // be generating or drafted (VALID_TRANSITIONS allows only failed →
          // pending). This mutation is persisted via updatePlanJson whenever the
          // need is resolved below. Without it, the downstream state machine
          // would abort the plan instead of retrying the need.
          transitionAssetNeed(normalized, 'pending');
        }
        if (normalized.status === 'pending') {
          result.push({ item: item as ContentPlanItem, need: normalized });
        }
      }
    }
    return result;
  }
}