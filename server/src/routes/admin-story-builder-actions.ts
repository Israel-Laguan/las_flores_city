import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { contentPlanService } from '../services/ContentPlanService.js';
import {
  previewPlan,
  migrateStagedPlan,
  approveAndSolidifyPlan,
  verifyPlan,
  getSolidifyJobStatus,
} from '../services/StoryBuilderOrchestrator.js';
import { isPlanNotFoundError, isPlanStatusError } from '../services/errors.js';
import { handleGetVerificationReport } from './admin-story-builder-verification.js';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';
import { loadPlanForStaging, runStagingPipeline } from './admin-story-builder-staging.js';

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

    emitAdminEvent('plan_created', { descriptionLength: description.trim().length, itemCount: plan.items.length }, plan.id, req.userId);

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
adminStoryBuilderActionsRouter.post('/plans/:id/refine', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      res.status(400).json({ success: false, error: 'feedback is required', timestamp: new Date().toISOString() });
      return;
    }

    const refinedPlan = await contentPlanService.refinePlan(id, feedback.trim());

    emitAdminEvent('plan_refined', { feedbackLength: feedback.trim().length, itemCount: refinedPlan.items.length }, refinedPlan.id, req.userId);

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
adminStoryBuilderActionsRouter.post('/plans/:id/stage', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const loaded = await loadPlanForStaging(id, ['proposed', 'approved']);
    if (loaded.error) {
      res.status(loaded.error.status).json({ success: false, error: loaded.error.message, timestamp: new Date().toISOString() });
      return;
    }

    const outcome = await runStagingPipeline(loaded.plan, id);

    const newStatus = outcome.success ? 'staged' : 'failed';
    await queryOLTP('UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, id]);

    emitAdminEvent(
      outcome.success ? 'plan_staged' : 'plan_failed',
      { itemCount: loaded.plan.items.length, success: outcome.success },
      id,
      req.userId,
    );

    res.json({
      success: outcome.success,
      data: outcome,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/stage error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to stage plan', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/plans/:id/migrate — Run DB migration for staged plan
adminStoryBuilderActionsRouter.post('/plans/:id/migrate', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const migrationResult = await migrateStagedPlan(id);

    emitAdminEvent(
      migrationResult.success ? 'plan_migrated' : 'plan_failed',
      { success: migrationResult.success, error: migrationResult.error },
      id,
      req.userId,
    );

    const statusCode = migrationResult.success
      ? 200
      : migrationResult.error?.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: migrationResult.success,
      data: migrationResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/migrate error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to migrate plan', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/plans/:id/approve-and-solidify — Single-click "Approve & Ship"
// Fires async solidify and returns immediately with status=planId for polling.
adminStoryBuilderActionsRouter.post('/plans/:id/approve-and-solidify', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await approveAndSolidifyPlan(id, req.userId);

    res.status(200).json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/approve-and-solidify error:', error);
    const message = error.message || 'Failed to approve and solidify plan';
    const statusCode = isPlanNotFoundError(error) || message.includes('not found')
      ? 404
      : isPlanStatusError(error) || message.includes('must be') || message.includes("'proposed'")
        ? 400
        : 500;
    res.status(statusCode).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /admin/story-builder/plans/:id/status — Poll async solidify job status
adminStoryBuilderActionsRouter.get('/plans/:id/status', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const jobStatus = await getSolidifyJobStatus(id);

    if (!jobStatus) {
      // No job in progress — fall back to DB status
      const result = await queryOLTP<{ status: string }>(
        'SELECT status FROM content_plans WHERE id = $1',
        [id],
      );
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
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
    console.error('[story-builder] GET /plans/:id/status error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch status', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/plans/:id/retry — Retry staging for a failed plan
adminStoryBuilderActionsRouter.post('/plans/:id/retry', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const loaded = await loadPlanForStaging(id, ['failed']);
    if (loaded.error) {
      res.status(loaded.error.status).json({ success: false, error: loaded.error.message, timestamp: new Date().toISOString() });
      return;
    }

    const outcome = await runStagingPipeline(loaded.plan, id);

    const newStatus = outcome.success ? 'staged' : 'failed';
    if (outcome.success) {
      await queryOLTP(
        'UPDATE content_plans SET plan_json = $1, status = $2, updated_at = NOW() WHERE id = $3',
        [loaded.plan, newStatus, id],
      );
    } else {
      await queryOLTP(
        'UPDATE content_plans SET status = $1, updated_at = NOW() WHERE id = $2',
        [newStatus, id],
      );
    }

    emitAdminEvent(
      outcome.success ? 'plan_staged' : 'plan_failed',
      { retryOf: id, success: outcome.success },
      id,
      req.userId,
    );

    res.json({
      success: outcome.success,
      data: outcome,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/retry error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to retry plan', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/plans/:id/verify — Run verification on a migrated plan
adminStoryBuilderActionsRouter.post('/plans/:id/verify', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const report = await verifyPlan(id);

    // Persist the report to DB — verify the row was actually updated.
    const updateResult = await queryOLTP(
      'UPDATE content_plans SET verification_report = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(report), id],
    );

    if (updateResult.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Plan not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (report.passed) {
      emitAdminEvent('plan_verified', { passed: report.passed, errorCount: report.errors?.length ?? 0 }, id, req.userId);
    } else {
      emitAdminEvent('plan_failed', { passed: false, errorCount: report.errors?.length ?? 0 }, id, req.userId);
    }

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/verify error:', error);
    const status = isPlanNotFoundError(error) || error.message.includes('not found')
      ? 404
      : isPlanStatusError(error) || error.message.includes('must be')
        ? 400
        : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to verify plan',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /admin/story-builder/plans/:id/verification — Fetch saved verification report
adminStoryBuilderActionsRouter.get('/plans/:id/verification', handleGetVerificationReport);
