/* eslint-disable max-lines-per-function */
import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { queryOLTP } from '@las-flores/infra';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';

export const adminStoryBuilderPlansCrudRouter = express.Router();

// POST /admin/story-builder/plans — Create a new plan
// Use POST /plans/graph-intake for description-based plan creation (M32)
adminStoryBuilderPlansCrudRouter.post('/plans', async (req: AuthRequest, res) => {
  try {
    const { plan } = (req.body ?? {}) as { plan?: unknown };

    if (!plan) {
      res.status(400).json({ success: false, error: 'plan is required', timestamp: new Date().toISOString() });
      return;
    }

    let validatedPlan: ContentPlan;
    try {
      validatedPlan = ContentPlanSchema.parse(plan);
    } catch {
      res.status(400).json({ success: false, error: 'Invalid plan: schema validation failed', timestamp: new Date().toISOString() });
      return;
    }
    validatedPlan.status = 'proposed';

    const result = await queryOLTP(
      `INSERT INTO content_plans (id, description, plan_json, status, created_by)
       VALUES ($1, $2, $3, 'proposed', $4)
       RETURNING id`,
      [validatedPlan.id, validatedPlan.description, validatedPlan, req.userId || null]
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

// GET /admin/story-builder/plans — List all plans (with filters + search)
// Query params:
//   status      — exact match; whitelisted against content_plans_status_check (12 values)
//   createdBy | created_by — filter by author UUID
//   since       — ISO 8601 timestamptz; inclusive lower bound on created_at
//   q | query | search — case-insensitive substring search on description (ILIKE)
//   limit, offset — pagination (1..100, default 50; offset >=0)
//   sortBy      — created_at | updated_at (default updated_at)
//   order       — asc | desc (default desc)
const ALLOWED_PLAN_STATUSES = new Set([
  'draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed',
  'pending', 'staging', 'migrating', 'verifying', 'rejected',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function isValidCalendarDate(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return false;
  // Also validate HH:MM:SS ranges to avoid overflow normalization
  const t = iso.match(/T(\d{2}):(\d{2}):(\d{2})/);
  if (!t) return false;
  const hh = Number(t[1]); const mm = Number(t[2]); const ss = Number(t[3]);
  if (hh > 23 || mm > 59 || ss > 59) return false;
  return true;
}

adminStoryBuilderPlansCrudRouter.get('/plans', async (req, res) => {
  try {
    const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const rawOffset = req.query.offset !== undefined ? Number(req.query.offset) : undefined;
    if (
      (rawLimit !== undefined && (!Number.isFinite(rawLimit) || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100)) ||
      (rawOffset !== undefined && (!Number.isFinite(rawOffset) || !Number.isInteger(rawOffset) || rawOffset < 0))
    ) {
      res.status(400).json({ success: false, error: 'Invalid pagination: limit must be an integer 1..100 and offset must be a non-negative integer', timestamp: new Date().toISOString() });
      return;
    }
    const limit = rawLimit ?? 50;
    const offset = rawOffset ?? 0;

    // --- status filter ---
    const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    if (rawStatus !== undefined && rawStatus.length > 0 && !ALLOWED_PLAN_STATUSES.has(rawStatus)) {
      res.status(400).json({
        success: false,
        error: `Invalid status: '${rawStatus}'. Allowed: ${[...ALLOWED_PLAN_STATUSES].join(', ')}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const status = rawStatus && rawStatus.length > 0 ? rawStatus : undefined;

    // --- createdBy filter (accept both camelCase and snake_case) ---
    const rawCreatedBy = typeof req.query.createdBy === 'string'
      ? req.query.createdBy.trim()
      : typeof req.query.created_by === 'string' ? (req.query.created_by as string).trim() : undefined;
    if (rawCreatedBy !== undefined && rawCreatedBy.length > 0 && !UUID_RE.test(rawCreatedBy)) {
      res.status(400).json({ success: false, error: 'Invalid createdBy: must be a UUID', timestamp: new Date().toISOString() });
      return;
    }
    const createdBy = rawCreatedBy && rawCreatedBy.length > 0 ? rawCreatedBy : undefined;

    // --- since filter ---
    const rawSince = typeof req.query.since === 'string' ? req.query.since.trim() : undefined;
    let since: string | undefined;
    if (rawSince !== undefined && rawSince.length > 0) {
      const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
      if (!isoRe.test(rawSince) || !isValidCalendarDate(rawSince)) {
        res.status(400).json({ success: false, error: 'Invalid since: must be an ISO 8601 timestamp', timestamp: new Date().toISOString() });
        return;
      }
      const d = new Date(rawSince);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ success: false, error: 'Invalid since: must be an ISO 8601 timestamp', timestamp: new Date().toISOString() });
        return;
      }
      since = d.toISOString();
    }

    // --- search (q / query / search) ---
    const rawQ = typeof req.query.q === 'string' ? req.query.q
      : typeof req.query.query === 'string' ? req.query.query as string
      : typeof req.query.search === 'string' ? req.query.search as string : undefined;
    let q: string | undefined;
    if (rawQ !== undefined) {
      const trimmed = rawQ.trim();
      if (trimmed.length > 0) {
        if (trimmed.length > 200) {
          res.status(400).json({ success: false, error: 'Invalid q: must be 1..200 characters', timestamp: new Date().toISOString() });
          return;
        }
        q = trimmed;
      }
    }

    // --- sort ---
    const rawSortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : typeof req.query.sort === 'string' ? (req.query.sort as string).trim() : undefined;
    const sortBy = rawSortBy === 'created_at' ? 'created_at' : 'updated_at';
    if (rawSortBy !== undefined && rawSortBy.length > 0 && rawSortBy !== 'created_at' && rawSortBy !== 'updated_at') {
      res.status(400).json({ success: false, error: "Invalid sortBy: must be 'created_at' or 'updated_at'", timestamp: new Date().toISOString() });
      return;
    }
    const rawOrder = typeof req.query.order === 'string' ? req.query.order.trim().toLowerCase() : undefined;
    if (rawOrder !== undefined && rawOrder !== 'asc' && rawOrder !== 'desc') {
      res.status(400).json({ success: false, error: "Invalid order: must be 'asc' or 'desc'", timestamp: new Date().toISOString() });
      return;
    }
    const order = rawOrder === 'asc' ? 'ASC' : 'DESC';

    // Build dynamic WHERE clauses with parameterized indices
    const where: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (status) { where.push(`status = $${idx}`); params.push(status); idx += 1; }
    if (createdBy) { where.push(`created_by = $${idx}`); params.push(createdBy); idx += 1; }
    if (since) { where.push(`created_at >= $${idx}::timestamptz`); params.push(since); idx += 1; }
    if (q) { where.push(`description ILIKE $${idx} ESCAPE '\\'`); params.push(`%${escapeLikePattern(q)}%`); idx += 1; }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await queryOLTP(
      `SELECT id, description, status, created_by, created_at, updated_at,
              jsonb_array_length(plan_json->'items') as item_count
       FROM content_plans
        ${whereSql}
        ORDER BY ${sortBy} ${order}, id ${order}
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const countResult = await queryOLTP(
      `SELECT COUNT(*)::int as total FROM content_plans ${whereSql}`,
      params
    );

    res.json({
      success: true,
      data: {
        plans: result.rows,
        total: countResult.rows[0].total,
        limit,
        offset,
        filters: {
          ...(status ? { status } : {}),
          ...(createdBy ? { createdBy } : {}),
          ...(since ? { since } : {}),
          ...(q ? { q } : {}),
          sortBy,
          order: order.toLowerCase(),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] GET /plans error:', error);
    res.status(500).json({ success: false, error: 'Failed to list plans', timestamp: new Date().toISOString() });
  }
});

// GET /admin/story-builder/plans/:id — Get a single plan
adminStoryBuilderPlansCrudRouter.get('/plans/:id', async (req, res) => {
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