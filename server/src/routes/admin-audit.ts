// ============================================================
// admin-audit.ts - M24 Patch/Claim audit API
//
// Exposes patch/revision history and the claims/evidence store to the
// admin panel under /admin/audit. All routes require admin/developer.
// ============================================================

import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import {
  PatchCreateSchema,
  ClaimTransitionRequestSchema,
  EvidenceCreateSchema,
} from '@las-flores/shared';
import {
  createPatch,
  getPatch,
  listPatchesForPlan,
  listRevisions,
  rejectPatch,
  rollbackPatch,
} from '../services/RevisionService.js';
import {
  listClaims,
  getClaimDetail,
  recordEvidence,
  transitionClaim,
} from '../services/ClaimsService.js';
import { PatchNotFoundError, PatchStatusError, ClaimNotFoundError, ClaimTransitionError } from '../services/errors.js';
import { ClaimStatusSchema, type ClaimStatus, isUuid } from '@las-flores/shared';

export const adminAuditRouter = express.Router();

function badRequest(res: any, message: string): void {
  res.status(400).json({ success: false, error: message, timestamp: new Date().toISOString() });
}

adminAuditRouter.use(authAndAdminMiddleware);

// Reject malformed `:id` path values at the route boundary so they never reach
// the database (where they would otherwise surface as 500s from a uuid cast).
adminAuditRouter.use('/patches/:id', (req: any, res, next) => {
  if (!isUuid(req.params.id)) return badRequest(res, `Invalid UUID: ${req.params.id}`);
  next();
});
adminAuditRouter.use('/claims/:id', (req: any, res, next) => {
  if (!isUuid(req.params.id)) return badRequest(res, `Invalid UUID: ${req.params.id}`);
  next();
});

// -------------------------------------------------------------------
// Patches
// -------------------------------------------------------------------

// POST /admin/audit/patches — create a proposed patch
adminAuditRouter.post('/patches', async (req: any, res) => {
  try {
    const parsed = PatchCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, timestamp: new Date().toISOString() });
      return;
    }
    const patchId = await createPatch(parsed.data, req.userId);
    res.json({ success: true, data: { patchId }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[admin-audit] POST /patches error:', error);
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

// GET /admin/audit/patches?plan_id=
adminAuditRouter.get('/patches', async (req: any, res) => {
  try {
    const planId = req.query.plan_id as string | undefined;
    if (!planId) {
      badRequest(res, 'plan_id query param is required');
      return;
    }
    if (!isUuid(planId)) {
      badRequest(res, `Invalid plan_id UUID: ${planId}`);
      return;
    }
    const patches = await listPatchesForPlan(planId);
    res.json({ success: true, data: patches, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[admin-audit] GET /patches error:', error);
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

// GET /admin/audit/patches/:id
adminAuditRouter.get('/patches/:id', async (req: any, res) => {
  try {
    const patch = await getPatch(req.params.id);
    res.json({ success: true, data: patch, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error instanceof PatchNotFoundError) {
      res.status(404).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[admin-audit] GET /patches/:id error:', error);
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

// GET /admin/audit/patches/:id/revisions
adminAuditRouter.get('/patches/:id/revisions', async (req: any, res) => {
  try {
    const patch = await getPatch(req.params.id);
    const ops = patch.patchJson?.ops ?? [];
    const revisions = [];
    for (const op of ops) {
      const revs = await listRevisions(op.entityType, op.entityId);
      revisions.push({ entityType: op.entityType, entityId: op.entityId, revisions: revs });
    }
    res.json({ success: true, data: revisions, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error instanceof PatchNotFoundError) {
      res.status(404).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[admin-audit] GET /patches/:id/revisions error:', error);
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

// POST /admin/audit/patches/:id/reject
adminAuditRouter.post('/patches/:id/reject', async (req: any, res) => {
  try {
    const conflictReason = typeof req.body?.conflictReason === 'string' ? req.body.conflictReason : '';
    await rejectPatch(req.params.id, conflictReason, req.userId);
    res.json({ success: true, data: { patchId: req.params.id, status: 'rejected' }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error instanceof PatchNotFoundError) {
      res.status(404).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    if (error instanceof PatchStatusError) {
      res.status(400).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[admin-audit] POST /patches/:id/reject error:', error);
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

// POST /admin/audit/patches/:id/rollback
adminAuditRouter.post('/patches/:id/rollback', async (req: any, res) => {
  try {
    const result = await rollbackPatch(req.params.id, req.userId);
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error instanceof PatchNotFoundError) {
      res.status(404).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    if (error instanceof PatchStatusError) {
      res.status(400).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[admin-audit] POST /patches/:id/rollback error:', error);
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});
// -------------------------------------------------------------------
// Claims
// -------------------------------------------------------------------

// GET /admin/audit/claims?plan_id=&status=&patch_id=
adminAuditRouter.get('/claims', async (req: any, res) => {
  try {
    const opts: { planId?: string; status?: ClaimStatus; patchId?: string } = {};
    if (req.query.plan_id) {
      if (!isUuid(req.query.plan_id)) return badRequest(res, `Invalid plan_id UUID: ${req.query.plan_id}`);
      opts.planId = req.query.plan_id as string;
    }
    if (req.query.patch_id) {
      if (!isUuid(req.query.patch_id)) return badRequest(res, `Invalid patch_id UUID: ${req.query.patch_id}`);
      opts.patchId = req.query.patch_id as string;
    }
    if (req.query.status) {
      const parsedStatus = ClaimStatusSchema.safeParse(req.query.status);
      if (!parsedStatus.success) {
        return badRequest(res, `Invalid status: ${req.query.status}`);
      }
      opts.status = parsedStatus.data;
    }
    const claims = await listClaims(opts);
    res.json({ success: true, data: claims, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[admin-audit] GET /claims error:', error);
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

// GET /admin/audit/claims/:id
adminAuditRouter.get('/claims/:id', async (req: any, res) => {
  try {
    const detail = await getClaimDetail(req.params.id);
    res.json({ success: true, data: detail, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error instanceof ClaimNotFoundError) {
      res.status(404).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[admin-audit] GET /claims/:id error:', error);
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});
// POST /admin/audit/claims/:id/transition
adminAuditRouter.post('/claims/:id/transition', async (req: any, res) => {
  try {
    const parsed = ClaimTransitionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, timestamp: new Date().toISOString() });
      return;
    }
    const { to, conflictReason } = parsed.data;
    const updated = await transitionClaim(req.params.id, to, conflictReason, req.userId);
    res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error instanceof ClaimNotFoundError) {
      res.status(404).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    if (error instanceof ClaimTransitionError) {
      res.status(400).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[admin-audit] POST /claims/:id/transition error:', error);
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

// POST /admin/audit/claims/:id/evidence
adminAuditRouter.post('/claims/:id/evidence', async (req: any, res) => {
  try {
    const parsed = EvidenceCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message, timestamp: new Date().toISOString() });
      return;
    }
    const evidence = await recordEvidence(req.params.id, parsed.data, req.userId);
    res.json({ success: true, data: evidence, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error instanceof ClaimNotFoundError) {
      res.status(404).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[admin-audit] POST /claims/:id/evidence error:', error);
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});