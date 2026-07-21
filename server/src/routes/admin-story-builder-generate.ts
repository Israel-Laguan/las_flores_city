import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { queryOLTP } from '../database/connection.js';
import { contentPlanService } from '../services/ContentPlanService.js';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';
import { checkCreateConflicts } from '../services/StoryBuilderPlanOps.js';
import { resolveContentDir } from '../services/StoryBuilderLore.js';
import { generateYaml, resolveFilePath } from '../services/ContentSkeletonGenerator.js';
import { runPlanFill, getPlanFillJobStatus } from '../services/PlanGenerationJob.js';
import fs from 'node:fs/promises';
import path from 'node:path';

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
    const repairedPlan = contentPlanService.validateAndRepairOutline(outlinePlan, trimmedDesc);

    const contentDir = resolveContentDir();
    const conflicts = await checkCreateConflicts(repairedPlan, contentDir);
    if (conflicts.length > 0) {
      res.status(400).json({
        success: false,
        error: `Create conflicts detected: ${conflicts.join('; ')}`,
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
        console.warn(`[story-builder] Failed to write scaffold file for ${item.name}:`, writeErr);
      }
    }

    const insertResult = await queryOLTP<{ id: string }>(
      `INSERT INTO content_plans (id, description, plan_json, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'draft', NOW(), NOW())
       RETURNING id`,
      [repairedPlan.id, trimmedDesc, repairedPlan],
    );
    const planId = insertResult.rows[0].id;

    runPlanFill(planId, req.userId).catch((err) => {
      console.error(`[story-builder] Background fill job failed for ${planId}:`, err);
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
    console.error('[story-builder] POST /plan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate plan',
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
