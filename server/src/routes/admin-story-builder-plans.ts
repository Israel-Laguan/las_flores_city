import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';
import { isNeo4jEnabled } from '../services/Neo4jClient.js';
import { getDeltasForPlan, clearDeltasForPlan } from '../services/GraphDeltaService.js';

export const adminStoryBuilderPlansRouter = express.Router();

// POST /admin/story-builder/plans — Create a new plan
// Use POST /plans/graph-intake for description-based plan creation (M32)
adminStoryBuilderPlansRouter.post('/plans', async (req: AuthRequest, res) => {
  try {
    const { plan } = req.body;

    if (!plan) {
      res.status(400).json({ success: false, error: 'plan is required', timestamp: new Date().toISOString() });
      return;
    }

    const validatedPlan = ContentPlanSchema.parse(plan);
    validatedPlan.status = 'proposed';

    const result = await queryOLTP(
      `INSERT INTO content_plans (description, plan_json, status, created_by)
       VALUES ($1, $2, 'proposed', $3)
       RETURNING id`,
      [validatedPlan.description, validatedPlan, req.userId || null]
    );

    const planId = result.rows[0].id;

    const eventData: Record<string, unknown> = {
      descriptionLength: validatedPlan.description.trim().length,
      itemCount: validatedPlan.items.length,
    };
    emitAdminEvent('plan_created', eventData, planId, req.userId);

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

    // M32 — the graph is the sole authoring entry point. Direct plan_json edits
    // are only allowed for legacy plans that carry no graph deltas, and only
    // when the graph service is actually available.
    if (!isNeo4jEnabled()) {
      res.status(503).json({
        success: false,
        error: 'graph authoring service unavailable (NEO4J_ENABLED !== "true")',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Fail closed when the graph service is enabled but unreachable: never fall
    // back to treating an unavailable graph as an empty delta set (which would
    // let a plan_json edit clobber graph-authored deltas).
    let deltas;
    try {
      deltas = await getDeltasForPlan(id);
    } catch (err) {
      console.warn('[story-builder] delta lookup failed for plan', id, (err as Error).message);
      res.status(503).json({ success: false, error: 'graph authoring service unavailable', timestamp: new Date().toISOString() });
      return;
    }
    if (deltas.length > 0) {
      res.status(400).json({ success: false, error: 'plan authored via graph deltas; edit through the graph canvas, not plan_json', timestamp: new Date().toISOString() });
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

    // M28 — best-effort clean up the plan's graph deltas so orphan
    // :ContentDelta nodes don't linger after the plan row is gone. The plan row
    // is already deleted above (SQL is authoritative); if the graph cleanup
    // fails we must not silently claim a clean delete — surface it so the admin
    // can reconcile (a later graph resync / retry of the delete prunes the
    // orphaned :ContentDelta nodes).
    let graphDeltasCleaned = true;
    if (isNeo4jEnabled()) {
      try {
        await clearDeltasForPlan(id);
      } catch (err) {
        graphDeltasCleaned = false;
        console.warn('[story-builder] delta cleanup failed for deleted plan', id, (err as Error).message);
      }
    }

    res.json({ success: true, data: { deleted: true, graphDeltasCleaned }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] DELETE /plans/:id error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete plan', timestamp: new Date().toISOString() });
  }
});
