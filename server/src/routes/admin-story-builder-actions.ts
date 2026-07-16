import path from 'node:path';
import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { contentPlanService } from '../services/ContentPlanService.js';
import { previewPlan, stagePlan, migrateStagedPlan } from '../services/StoryBuilderOrchestrator.js';
import { generateLocalDrafts, listLocalAssets, resolveEntityRootDir, writeAssetPathsToYaml, autoSelectDefaultDrafts } from '../services/LocalDraftService.js';
import { markDrafted, markChosen } from '../services/AssetNeedsService.js';

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

    // Auto-generate local drafts for pending asset needs (non-fatal on error)
    if (stagingResult.success) {
      const contentDir = path.resolve(process.cwd(), 'content');
      try {
        for (const item of plan.items) {
          const pendingNeeds = item.assetNeeds.filter(n => n.status === 'pending');
          if (pendingNeeds.length === 0) continue;

          const entityRoot = resolveEntityRootDir(item, contentDir);
          await generateLocalDrafts(item, entityRoot, 1);

          // Auto-choose the first available draft
          const assets = await listLocalAssets(entityRoot);
          if (assets.length > 0) {
            const firstDraft = assets[0].filename;
            for (const need of pendingNeeds) {
              markDrafted(need);
            }
            // Choose the first asset (default or generated) for all pending needs
            if (!(item.fields as any).asset_paths) (item.fields as any).asset_paths = {};
            for (const need of pendingNeeds) {
              const assetFieldName = need.targetField.split('.').pop()!;
              (item.fields as any).asset_paths[assetFieldName] = firstDraft;
              markChosen(need);
            }
            await writeAssetPathsToYaml(item, entityRoot, contentDir);
          }
        }
        // Auto-select __default.png for any items that have it as first asset
        await autoSelectDefaultDrafts(plan, contentDir);

        // Persist auto-draft selections back to the plan
        await queryOLTP(
          'UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2',
          [plan, id]
        );
      } catch (err: any) {
        console.warn(`[story-builder] Auto-draft generation failed (non-fatal): ${err.message}`);
      }
    }

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

// POST /admin/story-builder/plans/:id/verify — Verify a migrated plan (stub — full impl in M05)
adminStoryBuilderActionsRouter.post('/plans/:id/verify', async (req, res) => {
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

    // Only allow verification of migrated plans
    if (result.rows[0].status !== 'migrated') {
      res.status(400).json({
        success: false,
        error: `Plan must be migrated before verification. Current status: ${result.rows[0].status}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Placeholder — full implementation in M05 PlanVerificationService
    res.json({
      success: true,
      data: {
        planId: id,
        status: 'verified',
        checks: [],
        message: 'Verification stub — full implementation coming in M05',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/verify error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to verify plan', timestamp: new Date().toISOString() });
  }
});
