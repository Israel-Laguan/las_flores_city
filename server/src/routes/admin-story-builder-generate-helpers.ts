import { type ContentPlan, type ContentPlanItem, type HarnessFinding } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { contentPlanService } from '../services/ContentPlanService.js';
import { resolveFilePath, generateYaml } from '../services/ContentSkeletonGenerator.js';
import { runValidationHarness } from '../services/ValidationHarnessService.js';
import { runPlanFill, cancelPlanFillStatus } from '../services/PlanGenerationJob.js';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';

export async function scaffoldPlanItems(
  items: ContentPlanItem[],
  contentDir: string,
): Promise<string[]> {
  const createdFiles: string[] = [];
  for (const item of items) {
    const filePath = resolveFilePath(item);
    const fullPath = path.join(contentDir, filePath);
    const yamlContent = generateYaml(item);
    // Publish each scaffold file atomically without ever exposing the destination
    // path (`fullPath`) while it is being written. We write to a unique temporary
    // file in the target directory, flush it to disk, then publish with a
    // no-clobber hard link — `fs.link` throws EEXIST if the target appeared since
    // the conflict scan, so it cannot overwrite a concurrently-created file (plain
    // `rename` could silently replace it). A mid-write failure (e.g. ENOSPC) can
    // therefore never leave a partial file visible under the published name.
    //
    // The temporary file is removed in ALL paths (success and failure); only a
    // successfully published `fullPath` is recorded in `createdFiles`, so the
    // caller's rollback (removeScaffoldedFiles) removes exactly what this request
    // created and never an orphaned temp file.
    const tempPath = `${fullPath}.scaffold-tmp-${crypto.randomUUID()}`;
    try {
      // Directory creation is inside the rollback scope: a failure on a 2nd or
      // later item would otherwise leave earlier scaffold files committed while
      // the function rethrows before returning. The catch below removes all
      // prior files so a retry cannot hit EEXIST conflicts.
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      const fileHandle = await fs.open(tempPath, 'wx');
      try {
        await fileHandle.writeFile(yamlContent, { encoding: 'utf-8' });
        await fileHandle.sync();
      } finally {
        await fileHandle.close();
      }
      await fs.link(tempPath, fullPath);
      createdFiles.push(filePath);
    } catch (err) {
      // A failure on a 2nd or later item would otherwise leave the earlier
      // successfully published scaffold files behind while the function
      // rethrows (so its `return createdFiles` never runs). Clean them up here
      // so a retry cannot hit EEXIST file conflicts claiming nothing was
      // committed. The caller's removeScaffoldedFiles is then a redundant but
      // harmless no-op.
      await removeScaffoldedFiles(createdFiles, contentDir);
      throw err;
    } finally {
      await fs.rm(tempPath, { force: true });
    }
  }
  return createdFiles;
}

/** Best-effort removal of files created by THIS request (rollback on failure). */
export async function removeScaffoldedFiles(createdFiles: string[], contentDir: string): Promise<void> {
  for (const file of createdFiles) {
    try {
      await fs.rm(path.join(contentDir, file), { force: true });
    } catch (err) {
      console.warn(`[story-builder] Failed to clean up scaffolded file ${file}:`, (err as Error).message);
    }
  }
}

/**
 * Deterministic pre-approve harness gate (M20) run at the scaffold boundary —
 * BEFORE any file is written. Enforces the same hard gate the approve-and-solidify
 * worker runs, so a plan can never be scaffolded/staged with an error-severity
 * finding. Throws if the harness context cannot be gathered so the caller can
 * fail CLOSED (503) rather than silently scaffold a plan whose gate could not be
 * evaluated — a fail-open here would let high-severity plans (duplicate
 * slugs/names, broken FKs) reach disk, which is exactly what this gate prevents.
 */
export async function runScaffoldHarnessGate(
  plan: ContentPlan,
): Promise<HarnessFinding[]> {
  try {
    const context = await contentPlanService.gatherContext();
    const report = runValidationHarness(plan, context);
    return report.findings.filter((f) => f.severity === 'error');
  } catch (error) {
    // Wrap the underlying cause in a stable, generic error so a DB/context
    // failure surfaces only as a fail-closed 503 without leaking schema,
    // filesystem, or connection details to the scaffold client.
    throw new Error('Validation harness could not be evaluated', { cause: error });
  }
}

export function buildPlanEventData(
  trimmedDesc: string,
  plan: any,
  createdFileCount: number,
  usage?: any,
): Record<string, unknown> {
  const eventData: Record<string, unknown> = {
    descriptionLength: trimmedDesc.length,
    itemCount: plan.items.length,
    createdFiles: createdFileCount,
    scaffolded: true,
    outlineSource: plan._meta.outline_source,
    outlineRepaired: plan._meta.outline_repaired,
  };
  if (usage) {
    eventData.totalTokens = usage.totalTokens;
    eventData.promptTokens = usage.promptTokens;
    eventData.completionTokens = usage.completionTokens;
    eventData.model = usage.model;
    eventData.estimatedCostUsd = usage.estimatedCostUsd;
  }
  return eventData;
}

export function buildPlanErrorResponse(error: any, description?: string): { status: number; body: Record<string, any> } {
  const errorDetails: Record<string, any> = {
    message: error.message,
    name: error.name,
    stack: error.stack?.substring(0, 500),
  };
  if (error.baseUrl) errorDetails.litellmUrl = error.baseUrl;
  if (error.model) errorDetails.model = error.model;
  if (error.timeoutMs) errorDetails.timeoutMs = error.timeoutMs;
  if (error.cause) errorDetails.cause = String(error.cause);

  console.error('[story-builder] POST /plan error:', {
    error: errorDetails,
    description: description?.substring(0, 100) || 'N/A',
  });

  let clientError = 'Failed to generate plan';
  if (error.message?.includes('LiteLLM') || error.baseUrl) {
    clientError = `LLM service error: ${error.message?.split('\n')[0] || clientError}`;
  } else if (error.message?.includes('timeout') || error.name === 'TimeoutError') {
    clientError = 'LLM request timed out. Check LiteLLM connectivity.';
  } else if (error.message?.includes('conflict')) {
    clientError = error.message;
  }

  return {
    status: 500,
    body: {
      success: false,
      error: clientError,
      details: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
      timestamp: new Date().toISOString(),
    },
  };
}

type ScaffoldFilesResult =
  | { createdFiles: string[] }
  | { error: (res: express.Response) => void };

/**
 * Scaffold the `create` items of a repaired plan to disk. On failure this rolls
 * back every file this request created (and only those) BEFORE any
 * content_plans insert or fill job is queued, then returns an `error` thunk the
 * caller invokes to write the 500 response. Returns `{ createdFiles }` on success.
 */
export async function scaffoldPlanFiles(
  repairedPlan: ContentPlan,
  trimmedDesc: string,
  contentDir: string,
): Promise<ScaffoldFilesResult> {
  const createItems = repairedPlan.items.filter((i) => i.action === 'create');
  try {
    const createdFiles = await scaffoldPlanItems(createItems, contentDir);
    return { createdFiles };
  } catch (scaffoldErr: any) {
    console.error(`[story-builder] Scaffold aborted for plan "${trimmedDesc.substring(0, 80)}":`, {
      error: (scaffoldErr as Error).message,
      createItems: createItems.map((i) => i.id),
    });
    // Roll back only this request's successfully created files, then stop
    // BEFORE inserting content_plans or queuing the fill job.
    await removeScaffoldedFiles(createItems.map((i) => i.id), contentDir).catch(() => undefined);
    return {
      error: (res) => {
        res.status(500).json({
          success: false,
          error: 'Failed to scaffold plan files. No files were committed and the plan was not persisted. Please retry.',
          timestamp: new Date().toISOString(),
        });
      },
    };
  }
}

type PersistResult =
  | { ok: true }
  | { error: (res: express.Response) => void };

/**
 * Insert the scaffolded plan row, kick off the async fill job, and emit the
 * admin event. On a persistence/event failure this compensates by deleting the
 * row (and its cached fill-job status) and rolling back the scaffolded files,
 * then returns an `error` thunk the caller invokes to write the 500 response.
 */
export async function persistScaffoldPlan(
  planId: string,
  repairedPlan: ContentPlan,
  trimmedDesc: string,
  createdFiles: string[],
  userId: string | undefined,
  contentDir: string,
): Promise<PersistResult> {
  try {
    const insertResult = await queryOLTP<{ id: string }>(
      `INSERT INTO content_plans (id, description, plan_json, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'draft', NOW(), NOW())
       RETURNING id`,
      [planId, trimmedDesc, repairedPlan],
    );
    const insertedId = insertResult.rows[0].id;

    runPlanFill(insertedId, userId).catch((err) => {
      console.error(`[story-builder] Background fill job failed for ${insertedId}:`, err);
    });

    emitAdminEvent('plan_created', buildPlanEventData(trimmedDesc, repairedPlan, createdFiles.length), planId, userId);
    return { ok: true };
  } catch (postScaffoldErr: any) {
    console.error(`[story-builder] Post-scaffold failure for plan "${trimmedDesc.substring(0, 80)}" — rolling back scaffolded files:`, {
      error: (postScaffoldErr as Error).message,
      createdFiles,
    });
    // Compensate for the row already inserted: delete it (and its cached
    // fill-job status) so generation-status polling does not keep reporting a
    // 'draft' plan as 'filling' after its files were rolled back. Best-effort —
    // the filesystem rollback below is the primary guarantee; a failed delete
    // leaves a row that resetOrphanedFillJobs can later reclaim.
    try {
      await queryOLTP('DELETE FROM content_plans WHERE id = $1', [planId]);
    } catch (cleanupErr: any) {
      console.warn(`[story-builder] Failed to delete content_plans row ${planId} during rollback:`, (cleanupErr as Error).message);
    }
    const cacheDeleted = await cancelPlanFillStatus(planId);
    if (!cacheDeleted) {
      console.warn(`[story-builder] Failed to delete fill-job cache for ${planId} during rollback`);
    }
    await removeScaffoldedFiles(createdFiles, contentDir);
    return {
      error: (res) => {
        res.status(500).json({
          success: false,
          error: 'A persistence error occurred after scaffolding. The plan was not committed and scaffold cleanup was attempted; please retry.',
          timestamp: new Date().toISOString(),
        });
      },
    };
  }
}
