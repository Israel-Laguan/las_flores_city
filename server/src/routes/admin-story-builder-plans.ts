import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { contentPlanService } from '../services/ContentPlanService.js';

export const adminStoryBuilderPlansRouter = express.Router();

// POST /admin/story-builder/plans — Create a new plan
adminStoryBuilderPlansRouter.post('/plans', async (req: AuthRequest, res) => {
  try {
    const { description, plan } = req.body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      res.status(400).json({ success: false, error: 'description is required and must be a non-empty string', timestamp: new Date().toISOString() });
      return;
    }

    let validatedPlan: ContentPlan;
    if (plan) {
      try {
        validatedPlan = ContentPlanSchema.parse(plan);
      } catch {
        res.status(400).json({ success: false, error: 'Invalid plan: schema validation failed', timestamp: new Date().toISOString() });
        return;
      }
    } else {
      validatedPlan = await contentPlanService.parseDescription(description.trim());
    }
    validatedPlan.status = 'proposed';

    const result = await queryOLTP(
      `INSERT INTO content_plans (description, plan_json, status, created_by)
       VALUES ($1, $2, 'proposed', $3)
       RETURNING id`,
      [validatedPlan.description, validatedPlan, req.userId || null]
    );

    const planId = result.rows[0].id;
    res.json({
      success: true,
      data: { planId, plan: validatedPlan },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create plan', timestamp: new Date().toISOString() });
  }
});

// GET /admin/story-builder/plans — List all plans
adminStoryBuilderPlansRouter.get('/plans', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const result = await queryOLTP(
      `SELECT id, description, status, created_at, updated_at,
              jsonb_array_length(plan_json->'items') as item_count
       FROM content_plans
       ORDER BY updated_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await queryOLTP('SELECT COUNT(*)::int as total FROM content_plans');

    res.json({
      success: true,
      data: {
        plans: result.rows,
        total: countResult.rows[0].total,
        limit,
        offset,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] GET /plans error:', error);
    res.status(500).json({ success: false, error: 'Failed to list plans', timestamp: new Date().toISOString() });
  }
});

// GET /admin/story-builder/plans/:id — Get a single plan
adminStoryBuilderPlansRouter.get('/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await queryOLTP(
      'SELECT id, description, plan_json, status, feedback_log, created_at, updated_at FROM content_plans WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
      return;
    }

    res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] GET /plans/:id error:', error);
    res.status(500).json({ success: false, error: 'Failed to get plan', timestamp: new Date().toISOString() });
  }
});

// PUT /admin/story-builder/plans/:id — Update plan
adminStoryBuilderPlansRouter.put('/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { plan: rawPlan, status } = req.body;

    if (!rawPlan) {
      res.status(400).json({ success: false, error: 'plan is required', timestamp: new Date().toISOString() });
      return;
    }

    let validatedPlan: ContentPlan;
    try {
      validatedPlan = ContentPlanSchema.parse(rawPlan);
    } catch {
      res.status(400).json({ success: false, error: 'Invalid plan: schema validation failed', timestamp: new Date().toISOString() });
      return;
    }

    const validStatuses = ['draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed'];
    const finalStatus = validStatuses.includes(status) ? status : 'draft';
    validatedPlan.status = finalStatus;

    const result = await queryOLTP(
      `UPDATE content_plans
       SET plan_json = $1, description = $2, status = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id`,
      [validatedPlan, validatedPlan.description, finalStatus, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
      return;
    }

    res.json({
      success: true,
      data: { planId: id, plan: validatedPlan, status: finalStatus },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] PUT /plans/:id error:', error);
    res.status(500).json({ success: false, error: 'Failed to update plan', timestamp: new Date().toISOString() });
  }
});

// DELETE /admin/story-builder/plans/:id — Delete a plan
adminStoryBuilderPlansRouter.delete('/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await queryOLTP('DELETE FROM content_plans WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
      return;
    }

    res.json({ success: true, data: { deleted: true }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] DELETE /plans/:id error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete plan', timestamp: new Date().toISOString() });
  }
});
