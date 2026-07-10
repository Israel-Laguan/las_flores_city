import express from 'express';
import { ContentPlanSchema } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { executePlan } from '../services/StoryBuilderOrchestrator.js';
import { PLAN_TEMPLATES, getTemplateById } from '../services/PlanTemplates.js';

export const adminStoryBuilderMetaRouter = express.Router();

// POST /admin/story-builder/execute — Execute a plan directly
adminStoryBuilderMetaRouter.post('/execute', async (req, res) => {
  try {
    const { plan: rawPlan } = req.body;

    if (!rawPlan) {
      res.status(400).json({
        success: false,
        error: 'plan is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let plan;
    try {
      plan = ContentPlanSchema.parse(rawPlan);
    } catch {
      res.status(400).json({
        success: false,
        error: 'Invalid plan: schema validation failed',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await executePlan(plan);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /execute error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute plan',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /admin/story-builder/plans/:id/versions — Get version history tree
adminStoryBuilderMetaRouter.get('/plans/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the full plan lineage (ancestors + descendants) via recursive CTE
    const rootResult = await queryOLTP<{ id: string; description: string; status: string; created_at: string; parent_plan_id: string | null }>(
      `WITH RECURSIVE plan_tree AS (
         SELECT id, description, status, created_at, parent_plan_id
         FROM content_plans
         WHERE id = $1
         UNION
         SELECT p.id, p.description, p.status, p.created_at, p.parent_plan_id
         FROM content_plans p
         INNER JOIN plan_tree t ON p.id = t.parent_plan_id
         UNION
         SELECT p.id, p.description, p.status, p.created_at, p.parent_plan_id
         FROM content_plans p
         INNER JOIN plan_tree t ON p.parent_plan_id = t.id
       )
       SELECT DISTINCT id, description, status, created_at, parent_plan_id
       FROM plan_tree
       ORDER BY created_at ASC`,
      [id]
    );

    if (rootResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
      return;
    }

    // Build tree: find the root (parent_plan_id is null)
    const plansMap = new Map<string, any>();
    rootResult.rows.forEach(plan => {
      plansMap.set(plan.id, { ...plan, children: [] });
    });

    let root: any = null;
    plansMap.forEach((plan, _planId) => {
      if (plan.parent_plan_id && plansMap.has(plan.parent_plan_id)) {
        plansMap.get(plan.parent_plan_id).children.push(plan);
      } else if (!plan.parent_plan_id || !plansMap.has(plan.parent_plan_id)) {
        root = plan;
      }
    });

    // Sort children by created_at
    const sortChildren = (node: any) => {
      node.children.sort((a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      node.children.forEach(sortChildren);
    };
    if (root) sortChildren(root);

    res.json({
      success: true,
      data: root || rootResult.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] GET /plans/:id/versions error:', error);
    res.status(500).json({ success: false, error: 'Failed to get version history', timestamp: new Date().toISOString() });
  }
});

// GET /admin/story-builder/templates — List available plan templates
adminStoryBuilderMetaRouter.get('/templates', async (_req, res) => {
  try {
    const templates = PLAN_TEMPLATES.map(t => ({
      id: t.id,
      label: t.label,
      description: t.description,
      icon: t.icon,
    }));

    res.json({
      success: true,
      data: { templates },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] GET /templates error:', error);
    res.status(500).json({ success: false, error: 'Failed to list templates', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/templates/:id — Build a plan from a template
adminStoryBuilderMetaRouter.post('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { description } = req.body;

    if (!description || typeof description !== 'string') {
      res.status(400).json({ success: false, error: 'description is required', timestamp: new Date().toISOString() });
      return;
    }

    const template = getTemplateById(id);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found', timestamp: new Date().toISOString() });
      return;
    }

    const plan = template.buildPlan(description);

    res.json({
      success: true,
      data: { plan },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /templates/:id error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to build template', timestamp: new Date().toISOString() });
  }
});
