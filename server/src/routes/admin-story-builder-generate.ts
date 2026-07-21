import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { queryOLTP } from '../database/connection.js';
import { contentPlanService } from '../services/ContentPlanService.js';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';
import { checkCreateConflicts } from '../services/StoryBuilderPlanOps.js';
import { resolveContentDir } from '../services/StoryBuilderLore.ts';
import { generateYaml, resolveFilePath } from '../services/ContentSkeletonGenerator.js';
import { runPlanFill, getPlanFillJobStatus } from '../services/PlanGenerationJob.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const adminStoryBuilderGenerateRouter = express.Router();

// POST /admin/story-builder/plan — Generate a plan from description (outline → scaffold → async fill)
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

    const { plan: outlinePlan, usage } = await contentPlanService.generateOutline(trimmedDesc);
    const repairedPlan = outlinePlan;

    const contentDir = resolveContentDir();
    const conflicts = await checkCreateConflicts(repairedPlan, contentDir);
    if (conflicts.length > 0) {
      console.warn(`[story-builder] Conflict detection blocked plan creation for description: "${description.substring(0, 80)}"...`, {
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
    const createdFiles: string[] = [];
    for (const item of createItems) {
      try {
        const filePath = resolveFilePath(item);
        const fullPath = path.join(contentDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        const yamlContent = generateYaml(item);
        await fs.writeFile(fullPath, yamlContent, 'utf-8');
        createdFiles.push(filePath);

        const lorePath = path.join(contentDir, filePath.replace(/[^/]+$/, ''), `${item.slug}.md`);
        await fs.writeFile(lorePath, `# ${item.name}\n\nTODO: Add lore content.\n`, 'utf-8');

        const promptPath = path.join(contentDir, filePath.replace(/[^/]+$/, ''), `${item.slug}.prompt.md`);
        await fs.writeFile(promptPath, `# Prompt for ${item.name}\n\nTODO: Add image generation prompt.\n`, 'utf-8');
      } catch (writeErr) {
        console.error(`[story-builder] CRITICAL: Failed to write scaffold file for ${item.name} (type=${item.type}, slug=${item.slug}):`, {
          error: writeErr.message,
          path: filePath,
          fullPath,
          stack: writeErr.stack?.substring(0, 300),
        });
        // Track failure but don't block the entire plan
      }
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

    const eventData: Record<string, unknown> = {
      descriptionLength: trimmedDesc.length,
      itemCount: repairedPlan.items.length,
      createdFiles: createdFiles.length,
      scaffolded: true,
      outlineSource: repairedPlan._meta.outline_source,
      outlineRepaired: repairedPlan._meta.outline_repaired,
    };
    if (usage) {
      eventData.totalTokens = usage.totalTokens;
      eventData.promptTokens = usage.promptTokens;
      eventData.completionTokens = usage.completionTokens;
      eventData.model = usage.model;
      eventData.estimatedCostUsd = usage.estimatedCostUsd;
    }

    emitAdminEvent('plan_created', eventData, planId, req.userId);

    res.json({
      success: true,
      data: { planId, plan: repairedPlan, status: 'generating' },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    // Extract actionable error details for logging and response
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
      description: req.body.description?.substring(0, 100) || 'N/A',
    });

    // Provide actionable error message to client
    let clientError = 'Failed to generate plan';
    if (error.message?.includes('LiteLLM') || error.baseUrl) {
      clientError = `LLM service error: ${error.message?.split('\n')[0] || clientError}`;
    } else if (error.message?.includes('timeout') || error.name === 'TimeoutError') {
      clientError = 'LLM request timed out. Check LiteLLM connectivity.';
    } else if (error.message?.includes('conflict')) {
      clientError = error.message; // Conflict errors are already descriptive
    }

    res.status(500).json({
      success: false,
      error: clientError,
      details: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
      timestamp: new Date().toISOString(),
    });
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
