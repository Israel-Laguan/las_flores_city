import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { ContentPlanService } from '../services/ContentPlanService.js';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';
import { aiCritiqueService } from '../services/AICritiqueService.js';

export const adminStoryBuilderCritiqueRouter = express.Router();

// POST /admin/story-builder/plans/:id/analyze — Run AI semantic critique (M26)
// Body: { scope?: 'entity' | 'cross_entity'; force?: boolean; plan_json?: ContentPlan }
adminStoryBuilderCritiqueRouter.post('/plans/:id/analyze', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const scope = (req.body?.scope as string) || 'entity';
    if (scope !== 'entity' && scope !== 'cross_entity' && scope !== 'cross_mission') {
      res.status(400).json({ success: false, error: "scope must be 'entity', 'cross_entity', or 'cross_mission'", timestamp: new Date().toISOString() });
      return;
    }
    const force = req.body?.force === true || req.body?.force === 'true';

    // Persist the current plan_json before critiquing so an author's unsaved
    // edits are analyzed (not the last-persisted snapshot). The plan comes
    // directly from the request, so it must be schema-validated first — an
    // arbitrary JSON payload must never corrupt the persisted plan.
    let validatedPlan: ContentPlan | undefined;
    if (req.body?.plan_json) {
      const parsed = ContentPlanSchema.safeParse(req.body.plan_json);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid plan_json: schema validation failed',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      validatedPlan = parsed.data;
      // A persistence failure must propagate (not be swallowed) so the route
      // fails instead of analyzing the stale last-persisted snapshot.
      await ContentPlanService.updatePlanJson(id, validatedPlan);
    }

    const result = await aiCritiqueService.runCritique(id, scope, { forceReanalyze: force, planJson: validatedPlan });

    emitAdminEvent('plan_analyzed', { scope, cached: result.cached, annotationCount: result.annotations.length }, id, req.userId);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/analyze error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to run plan critique',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /admin/story-builder/plans/:id/annotations — Fetch stored critique annotations
adminStoryBuilderCritiqueRouter.get('/plans/:id/annotations', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const annotations = await aiCritiqueService.getAnnotations(id);
    res.json({ success: true, data: { annotations }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] GET /plans/:id/annotations error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch annotations', timestamp: new Date().toISOString() });
  }
});

// PATCH /admin/story-builder/plans/:id/annotations/:annotationId — Live override status
// Body: { status: 'open' | 'addressed' | 'dismissed' }  (M26 dismiss, M29 addressed)
adminStoryBuilderCritiqueRouter.patch('/plans/:id/annotations/:annotationId', async (req: AuthRequest, res) => {
  try {
    const { id, annotationId } = req.params as Record<string, string>;
    const { status } = req.body || {};
    if (status !== 'open' && status !== 'addressed' && status !== 'dismissed') {
      res.status(400).json({ success: false, error: "status must be 'open', 'addressed', or 'dismissed'", timestamp: new Date().toISOString() });
      return;
    }

    // Reject overrides for annotations that do not belong to this plan.
    const annotation = await aiCritiqueService.getAnnotation(annotationId);
    if (!annotation || annotation.planId !== id) {
      res.status(404).json({ success: false, error: `Annotation not found: ${annotationId}`, timestamp: new Date().toISOString() });
      return;
    }

    await aiCritiqueService.setAnnotationStatus(annotationId, status);
    emitAdminEvent('plan_annotation_status', { annotationId, status }, id, req.userId);

    res.json({ success: true, data: { annotationId, status }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] PATCH /plans/:id/annotations/:annotationId error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to update annotation', timestamp: new Date().toISOString() });
  }
});
