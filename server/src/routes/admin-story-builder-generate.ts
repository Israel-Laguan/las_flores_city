import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema, type ContentPlan, type ContentPlanItem, type IntakeConflictPreview } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { contentPlanService } from '../services/ContentPlanService.js';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';
import { checkCreateConflicts } from '../services/StoryBuilderPlanOps.js';
import { resolveContentDir } from '../services/StoryBuilderLore.js';
import { generateYaml, resolveFilePath } from '../services/ContentSkeletonGenerator.js';
import { runPlanFill, getPlanFillJobStatus } from '../services/PlanGenerationJob.js';
import { fillAllTodoPlaceholders, scanForTodoPlaceholders } from '../services/FillPlaceholders.js';
import { createLLMProvider } from '../services/LLMService.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const adminStoryBuilderGenerateRouter = express.Router();

async function scaffoldPlanItems(
  items: ContentPlanItem[],
  contentDir: string,
): Promise<string[]> {
  const createdFiles: string[] = [];
  for (const item of items) {
    const filePath = resolveFilePath(item);
    const fullPath = path.join(contentDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const yamlContent = generateYaml(item);
    // Exclusive create ('wx') — never overwrite a target that appeared since the
    // conflict scan. Any failure throws and aborts the whole scaffold, letting
    // the caller roll back this request's already-created files.
    await fs.writeFile(fullPath, yamlContent, { encoding: 'utf-8', flag: 'wx' });
    createdFiles.push(filePath);
  }
  return createdFiles;
}

/** Best-effort removal of files created by THIS request (rollback on failure). */
async function removeScaffoldedFiles(createdFiles: string[], contentDir: string): Promise<void> {
  for (const file of createdFiles) {
    try {
      await fs.rm(path.join(contentDir, file), { force: true });
    } catch (err) {
      console.warn(`[story-builder] Failed to clean up scaffolded file ${file}:`, (err as Error).message);
    }
  }
}

function buildPlanEventData(
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

function buildPlanErrorResponse(error: any, description?: string): { status: number; body: Record<string, any> } {
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

// POST /admin/story-builder/plan — PHASE 1 (preview only): generate outline + conflict scan.
// Does NOT scaffold files, does NOT insert into content_plans, and returns NO planId.
// The author explicitly commits via POST /plan/scaffold ("Generate Full Plan").
adminStoryBuilderGenerateRouter.post('/plan', async (req: AuthRequest, res) => {
  try {
    const { description } = req.body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'description is required and must be a non-empty string',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const trimmedDesc = description.trim();

    const { plan: outlinePlan } = await contentPlanService.generateOutline(trimmedDesc);
    const repairedPlan = outlinePlan;

    // Advisory filesystem collision check — surface as a warning, never a hard block at intake.
    const contentDir = resolveContentDir();
    let fileConflicts: string[] = [];
    try {
      fileConflicts = await checkCreateConflicts(repairedPlan, contentDir);
    } catch (conflictErr) {
      console.warn('[story-builder] Advisory file-conflict scan failed; continuing with empty fileConflicts:', (conflictErr as Error).message);
      fileConflicts = [];
    }

    // LLM conflict preview (Moment 1) — advisory only.
    let conflicts: IntakeConflictPreview[] = [];
    try {
      const scan = await contentPlanService.analyzeIntakeConflicts(repairedPlan);
      conflicts = scan.conflicts;
    } catch (conflictErr) {
      console.warn('[story-builder] Intake conflict scan failed; continuing with empty conflicts:', (conflictErr as Error).message);
    }

    res.json({
      success: true,
      data: { plan: repairedPlan, conflicts, fileConflicts, status: 'preview' },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const { status, body } = buildPlanErrorResponse(error, req.body.description);
    res.status(status).json(body);
  }
});
// POST /admin/story-builder/plan/scaffold — PHASE 2 (commit): scaffold files + insert content_plans + kick off async fill.
// Takes the outline produced by POST /plan. This is the explicit "Generate Full Plan" action.
adminStoryBuilderGenerateRouter.post('/plan/scaffold', async (req: AuthRequest, res) => {
  try {
    const { plan: rawPlan } = req.body;

    if (!rawPlan || typeof rawPlan !== 'object') {
      res.status(400).json({
        success: false,
        error: 'plan is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let repairedPlan: ContentPlan;
    try {
      repairedPlan = ContentPlanSchema.parse(rawPlan);
    } catch (parseErr: any) {
      res.status(400).json({
        success: false,
        error: `Invalid plan: ${parseErr.message}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const trimmedDesc = (repairedPlan.description || '').trim();

    const contentDir = resolveContentDir();
    const conflicts = await checkCreateConflicts(repairedPlan, contentDir);
    if (conflicts.length > 0) {
      console.warn(`[story-builder] Conflict detection blocked scaffold for plan: "${trimmedDesc.substring(0, 80)}"...`, {
        conflicts,
        itemCount: repairedPlan.items.length,
        contentDir,
      });
      res.status(400).json({
        success: false,
        error: `Create conflicts detected: ${conflicts.join('; ')}`,
        conflicts: conflicts,
        suggestion: 'Use different item names/slugs or remove existing files from content/',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    repairedPlan._meta = {
      ...repairedPlan._meta,
      scaffolded_at: new Date().toISOString(),
      jobPrefix: 'story-builder:gen:',
    };

    const createItems = repairedPlan.items.filter(i => i.action === 'create');
    let createdFiles: string[] = [];
    try {
      createdFiles = await scaffoldPlanItems(createItems, contentDir);
    } catch (scaffoldErr: any) {
      console.error(`[story-builder] Scaffold aborted for plan "${trimmedDesc.substring(0, 80)}":`, {
        error: (scaffoldErr as Error).message,
        createdFiles,
      });
      // Roll back only this request's successfully created files, then stop
      // BEFORE inserting content_plans or queuing the fill job.
      await removeScaffoldedFiles(createdFiles, contentDir);
      res.status(500).json({
        success: false,
        error: `Failed to scaffold plan files: ${(scaffoldErr as Error).message}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const planId = crypto.randomUUID();
    repairedPlan.id = planId;

    const insertResult = await queryOLTP<{ id: string }>(
      `INSERT INTO content_plans (id, description, plan_json, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'draft', NOW(), NOW())
       RETURNING id`,
      [planId, trimmedDesc, repairedPlan],
    );
    const insertedId = insertResult.rows[0].id;

    runPlanFill(insertedId, req.userId).catch((err) => {
      console.error(`[story-builder] Background fill job failed for ${insertedId}:`, err);
    });

    emitAdminEvent('plan_created', buildPlanEventData(trimmedDesc, repairedPlan, createdFiles.length), planId, req.userId);

    res.json({
      success: true,
      data: { planId, plan: repairedPlan, status: 'generating' },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const { status, body } = buildPlanErrorResponse(error, req.body.plan?.description);
    res.status(status).json(body);
  }
});

// POST /admin/story-builder/plan/refine-preview — in-memory refine of a phase-1 outline ("Refine Instead").
// Returns the refined plan + re-scanned conflicts. No persistence.
adminStoryBuilderGenerateRouter.post('/plan/refine-preview', async (req: AuthRequest, res) => {
  try {
    const { plan: rawPlan, feedback } = req.body;

    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'feedback is required and must be a non-empty string',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (!rawPlan || typeof rawPlan !== 'object') {
      res.status(400).json({
        success: false,
        error: 'plan is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let plan: ContentPlan;
    try {
      plan = ContentPlanSchema.parse(rawPlan);
    } catch (parseErr: any) {
      res.status(400).json({
        success: false,
        error: `Invalid plan: ${parseErr.message}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await contentPlanService.refinePlanPreview(plan, feedback.trim());

    // Refresh filesystem conflicts against the refined plan so a rename/new item
    // shows an up-to-date collision (or clears an obsolete one) immediately.
    let fileConflicts: string[] = [];
    try {
      fileConflicts = await checkCreateConflicts(result.plan, resolveContentDir());
    } catch (conflictErr: any) {
      console.warn('[story-builder] Refine-preview file-conflict scan failed; continuing with empty fileConflicts:', (conflictErr as Error).message);
    }

    res.json({
      success: true,
      data: { plan: result.plan, conflicts: result.conflicts, fileConflicts },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const { status, body } = buildPlanErrorResponse(error, req.body.plan?.description);
    res.status(status).json(body);
  }
});

// GET /admin/story-builder/plans/:id/generation-status — Poll async fill job status
adminStoryBuilderGenerateRouter.get('/plans/:id/generation-status', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;

    const jobStatus = await getPlanFillJobStatus(id);

    if (!jobStatus) {
      const result = await queryOLTP<{ status: string; plan_json: any }>(
        'SELECT status, plan_json FROM content_plans WHERE id = $1',
        [id],
      );
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
        return;
      }
      if (result.rows[0].status === 'draft' && result.rows[0].plan_json?._meta?.scaffolded_at) {
        res.json({
          success: true,
          data: { planId: id, status: 'filling', progress: { total: 0, completed: 0, failed: 0 }, items: [] },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      res.json({
        success: true,
        data: { planId: id, status: result.rows[0].status },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      success: true,
      data: jobStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] GET /plans/:id/generation-status error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch generation status', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/fill-placeholders — Scan content dir and fill existing TODO placeholders
// This is a resume functionality for content that was scaffolded but not filled
adminStoryBuilderGenerateRouter.post('/fill-placeholders', async (req: AuthRequest, res) => {
  try {
    const contentDir = resolveContentDir();
    
    // First, scan to see what needs to be filled
    const scan = await scanForTodoPlaceholders(contentDir);
    
    if (scan.filesWithTodo === 0) {
      res.json({
        success: true,
        data: { filled: 0, skipped: 0, errors: [], message: 'No TODO placeholders found' },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Create provider and context
    const provider = createLLMProvider();
    const context = await contentPlanService.gatherContext();
    
    // Fill all placeholders
    const result = await fillAllTodoPlaceholders(provider, context, contentDir);
    
    emitAdminEvent('placeholders_filled', {
      totalFiles: scan.totalFiles,
      filesWithTodo: scan.filesWithTodo,
      filled: result.filled,
      skipped: result.skipped,
      errorCount: result.errors.length,
    }, undefined, req.userId);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /fill-placeholders error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fill placeholders',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /admin/story-builder/scan-placeholders — Scan for TODO placeholders without filling
adminStoryBuilderGenerateRouter.get('/scan-placeholders', async (req: AuthRequest, res) => {
  try {
    const contentDir = resolveContentDir();
    const scan = await scanForTodoPlaceholders(contentDir);
    
    res.json({
      success: true,
      data: scan,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] GET /scan-placeholders error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to scan for placeholders',
      timestamp: new Date().toISOString(),
    });
  }
});
