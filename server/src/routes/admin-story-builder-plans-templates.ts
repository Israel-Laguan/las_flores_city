/* eslint-disable max-lines-per-function */
import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { queryOLTP } from '@las-flores/infra';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';
import { buildPlanFromTemplate, UnknownTemplateError } from '../services/PlanTemplateBuilders.js';

export const adminStoryBuilderPlansTemplatesRouter = express.Router();

// POST /plans/from-template — Create a plan from a registered scoped template
// (M43). The plan is created in 'proposed' status for review; execution still
// flows through the standard stage → migrate → verify pipeline.
adminStoryBuilderPlansTemplatesRouter.post('/plans/from-template', async (req: AuthRequest, res) => {
  try {
    const { templateId, name, slug, description, ...extra } = req.body ?? {};

    if (!templateId || typeof templateId !== 'string') {
      res.status(400).json({ success: false, error: 'templateId is required', timestamp: new Date().toISOString() });
      return;
    }
    if (!name || !slug) {
      res.status(400).json({ success: false, error: 'name and slug are required', timestamp: new Date().toISOString() });
      return;
    }
    if (templateId === 'location') {
      const district = (extra as Record<string, unknown>).district;
      if (!district || typeof district !== 'string' || (district as string).trim().length === 0) {
        res.status(400).json({ success: false, error: 'district is required for location template', timestamp: new Date().toISOString() });
        return;
      }
    }

    let plan;
    try {
      plan = buildPlanFromTemplate(templateId, { name, slug, description, ...extra });
    } catch (err: any) {
      if (err instanceof UnknownTemplateError) {
        res.status(400).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
        return;
      }
      res.status(400).json({ success: false, error: `Invalid template params: ${err.message}`, timestamp: new Date().toISOString() });
      return;
    }
    plan.status = 'proposed';

    const result = await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status, created_by)
       VALUES ($1, $2, $3, 'proposed', $4)
       RETURNING id`,
      [plan.id, plan.description, plan, req.userId || null]
    );

    const planId = result.rows[0].id;
    emitAdminEvent('plan_created', { templateId, itemCount: plan.items.length }, planId, req.userId);

    res.json({
      success: true,
      data: { planId, plan },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/from-template error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create plan from template', timestamp: new Date().toISOString() });
  }
});