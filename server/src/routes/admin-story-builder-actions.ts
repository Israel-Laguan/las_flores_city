import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { contentPlanService } from '../services/ContentPlanService.js';
import { previewPlan, stagePlan, migrateStagedPlan } from '../services/StoryBuilderOrchestrator.js';

export const adminStoryBuilderActionsRouter = express.Router();

// POST /admin/story-builder/plan — Generate a plan from description
adminStoryBuilderActionsRouter.post('/plan', async (req: AuthRequest, res) => {
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

    const plan = await contentPlanService.parseDescription(description.trim());

    res.json({
      success: true,
      data: { plan },
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

// POST /admin/story-builder/plans/:id/refine — Refine plan with AI feedback
adminStoryBuilderActionsRouter.post('/plans/:id/refine', async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      res.status(400).json({ success: false, error: 'feedback is required', timestamp: new Date().toISOString() });
      return;
    }

    const refinedPlan = await contentPlanService.refinePlan(id, feedback.trim());

    res.json({
      success: true,
      data: { plan: refinedPlan },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/refine error:', error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to refine plan', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/plans/:id/preview — Dry-run preview
adminStoryBuilderActionsRouter.post('/plans/:id/preview', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await queryOLTP<{ plan_json: any }>(
      'SELECT plan_json FROM content_plans WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
      return;
    }

    let plan;
    try {
      plan = ContentPlanSchema.parse(result.rows[0].plan_json);
    } catch {
      res.status(400).json({ success: false, error: 'Stored plan failed schema validation', timestamp: new Date().toISOString() });
      return;
    }

    const preview = await previewPlan(plan);

    res.json({
      success: true,
      data: preview,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/preview error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to preview plan', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/plans/:id/stage — Write YAML + validate (no DB migration)
adminStoryBuilderActionsRouter.post('/plans/:id/stage', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await queryOLTP<{ plan_json: any; status: string }>(
      'SELECT plan_json, status FROM content_plans WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
      return;
    }

    // Status guard: only allow staging if proposed or approved
    const currentStatus = result.rows[0].status;
    if (currentStatus !== 'proposed' && currentStatus !== 'approved') {
      res.status(400).json({
        success: false,
        error: `Plan must be proposed or approved before staging. Current status: ${currentStatus}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let plan;
    try {
      plan = ContentPlanSchema.parse(result.rows[0].plan_json);
    } catch {
      res.status(400).json({ success: false, error: 'Stored plan failed schema validation', timestamp: new Date().toISOString() });
      return;
    }

    const stagingResult = await stagePlan(plan);

    const newStatus = stagingResult.success ? 'staged' : 'failed';
    await queryOLTP(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, id]
    );

    res.json({
      success: stagingResult.success,
      data: stagingResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/stage error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to stage plan', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/plans/:id/migrate — Run DB migration for staged plan
adminStoryBuilderActionsRouter.post('/plans/:id/migrate', async (req, res) => {
  try {
    const { id } = req.params;

    const migrationResult = await migrateStagedPlan(id);

    res.json({
      success: migrationResult.success,
      data: migrationResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/migrate error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to migrate plan', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/plans/:id/retry — Retry staging for a failed plan
adminStoryBuilderActionsRouter.post('/plans/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;

    // Load plan from DB
    const result = await queryOLTP<{ plan_json: any; status: string }>(
      'SELECT plan_json, status FROM content_plans WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
      return;
    }

    if (result.rows[0].status !== 'failed') {
      res.status(400).json({
        success: false,
        error: `Can only retry failed plans. Current status: ${result.rows[0].status}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let plan;
    try {
      plan = ContentPlanSchema.parse(result.rows[0].plan_json);
    } catch {
      res.status(400).json({ success: false, error: 'Stored plan failed schema validation', timestamp: new Date().toISOString() });
      return;
    }

    // Re-run staging
    const stagingResult = await stagePlan(plan);

    // Update plan status based on staging result
    const newStatus = stagingResult.success ? 'staged' : 'failed';
    await queryOLTP(
      'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, id]
    );

    res.json({
      success: stagingResult.success,
      data: stagingResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/retry error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to retry plan', timestamp: new Date().toISOString() });
  }
});
