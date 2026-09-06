/* eslint-disable max-lines-per-function */
import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { isNeo4jEnabled } from '../services/Neo4jClient.js';
import { getDeltasForPlan } from '../services/GraphDeltaService.js';
import { GraphIntakeService, GraphIntakeValidationError } from '../services/GraphIntakeService.js';

export const adminStoryBuilderPlansUpdatesRouter = express.Router();

// PUT /admin/story-builder/plans/:id — Update plan
adminStoryBuilderPlansUpdatesRouter.put('/plans/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { plan: rawPlan, status } = req.body;

    if (!rawPlan) {
      res.status(400).json({ success: false, error: 'plan is required', timestamp: new Date().toISOString() });
      return;
    }

    // Fetch the current plan status + revision early — needed for both rejection
    // handling and for optimistic concurrency on the plan snapshot. A missing
    // plan returns 404. The `updated_at` value is used as an optimistic
    // revision token so two concurrent saves that observed the same status
    // cannot silently clobber each other's `plan_json`.
    const currentPlanRow = await queryOLTP<{ status: string; updated_at: string }>(
      'SELECT status, updated_at FROM content_plans WHERE id = $1',
      [id],
    );

    if (currentPlanRow.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
      return;
    }

    const currentStatus = currentPlanRow.rows[0].status;
    const observedUpdatedAt = currentPlanRow.rows[0].updated_at;

    // Rejection must go through the lifecycle action so graph deltas and intake
    // annotations are cleaned up and a rejection audit event is emitted. This
    // is handled BEFORE the graph-authoring edit guard so that graph-authored
    // plans can also be rejected through this route — otherwise they would
    // receive a 400 from the guard below before rejection is processed.
    if (status === 'rejected' && currentStatus !== 'rejected') {
      const graphIntakeService = new GraphIntakeService();
      try {
        await graphIntakeService.rejectPlan(id);
      } catch (err: any) {
        if (err instanceof GraphIntakeValidationError) {
          // Lifecycle validation errors are expected client errors, not server faults.
          // A missing plan is a 404; conflicts (already rejected, non-rejectable
          // status) are 409 so the admin UI can show a meaningful message.
          if (/Plan not found/i.test(err.message)) {
            res.status(404).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
            return;
          }
          res.status(409).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
          return;
        }
        throw err;
      }
      return res.json({
        success: true,
        data: { planId: id, status: 'rejected' },
        timestamp: new Date().toISOString(),
      });
    }

    // Graph-authored plans must be edited through the canvas. Legacy plans may
    // still be edited directly when graph authoring is disabled.
    if (isNeo4jEnabled()) {
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
    }

    let validatedPlan: ContentPlan;
    try {
      validatedPlan = ContentPlanSchema.parse(rawPlan);
    } catch {
      res.status(400).json({ success: false, error: 'Invalid plan: schema validation failed', timestamp: new Date().toISOString() });
      return;
    }

    // Transient pipeline statuses are server-owned — only stable user-editable
    // statuses are accepted here. `rejected` is preserved for ordinary saves.
    // If the plan is already in a transient pipeline status (pending/staging/
    // migrating/verifying), preserve it rather than clobbering to draft — the
    // pipeline owns these statuses and a plain save must not regress them.
    const validStatuses = ['draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed', 'rejected'];
    const transientStatuses = ['pending', 'staging', 'migrating', 'verifying'];
    const finalStatus = transientStatuses.includes(currentStatus)
      ? currentStatus
      : validStatuses.includes(status) ? status : (currentStatus === 'rejected' ? 'rejected' : 'draft');
    validatedPlan.status = finalStatus;

    // Conditional UPDATE: the `status <> 'rejected'` guard ensures a concurrent
    // rejection cannot be overwritten by a stale proposed/draft status from this
    // request, the `status = $5` guard ensures the row still matches the
    // status observed at read time, and the `updated_at = $6` optimistic
    // revision guard ensures a concurrent save that already committed a newer
    // `plan_json` is not silently clobbered. If any guard fails, this UPDATE
    // is a no-op and returns 0 rows, surfacing a 409 so the caller can
    // re-fetch.
    const result = await queryOLTP(
      `UPDATE content_plans
       SET plan_json = $1, description = $2, status = $3, updated_at = NOW()
       WHERE id = $4
         AND status = $5
         AND status <> 'rejected'
         AND updated_at = $6::timestamptz
       RETURNING id`,
      [validatedPlan, validatedPlan.description, finalStatus, id, currentStatus, observedUpdatedAt]
    );

    if (result.rows.length === 0) {
      res.status(409).json({ success: false, error: 'Plan state changed concurrently — please re-fetch and retry', timestamp: new Date().toISOString() });
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

// DELETE /admin/story-builder/plans/:id — Delete a plan (lifecycle-validated)
adminStoryBuilderPlansUpdatesRouter.delete('/plans/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const svc = new GraphIntakeService();
    try {
      const result = await svc.deletePlan(id, (req as AuthRequest).userId || undefined);
      res.json({
        success: true,
        data: { deleted: true, graphDeltasCleaned: result.deltaPruned, status: result.status },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err instanceof GraphIntakeValidationError) {
        if (/Plan not found/i.test(err.message)) {
          res.status(404).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
          return;
        }
        res.status(409).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
        return;
      }
      throw err;
    }
  } catch (error: any) {
    console.error('[story-builder] DELETE /plans/:id error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete plan', timestamp: new Date().toISOString() });
  }
});