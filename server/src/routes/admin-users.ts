import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { queryOLTP } from '../database/connection.js';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';

/**
 * Admin Users Router
 *
 * User management endpoints for listing, viewing, and updating users.
 * All routes require admin/developer role.
 */
export const adminUsersRouter = express.Router();

adminUsersRouter.use(authAndAdminMiddleware);

/**
 * GET /admin/users
 *
 * List users with pagination, search, and role filter.
 * Query params: page (default 1), pageSize (default 50), search, role
 */
adminUsersRouter.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role.trim() : '';
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(username ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR display_name ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (role && ['player', 'admin', 'developer'].includes(role)) {
      conditions.push(`role = $${paramIdx}`);
      params.push(role);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await queryOLTP<{ count: number }>(
      `SELECT count(*)::int AS count FROM users ${whereClause}`,
      params,
    );

    const listResult = await queryOLTP<{
      id: string; email: string; username: string; display_name: string;
      role: string; last_login: string | null; created_at: string;
    }>(
      `SELECT id, email, username, display_name, role, last_login, created_at
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, pageSize, offset],
    );

    res.json({
      success: true,
      data: {
        users: listResult.rows,
        total: countResult.rows[0]?.count ?? 0,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-users] GET / error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch users',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /admin/users/:id
 *
 * User detail with recent admin events.
 */
adminUsersRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const userResult = await queryOLTP<{
      id: string; email: string; username: string; display_name: string;
      role: string; credits: number; gold_credits: number; time_blocks: number;
      last_login: string | null; created_at: string; updated_at: string;
    }>(
      `SELECT id, email, username, display_name, role, credits, gold_credits,
              time_blocks, last_login, created_at, updated_at
       FROM users WHERE id = $1`,
      [id],
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const eventsResult = await queryOLTP<{
      id: string; event_type: string; event_data: any; created_at: string;
    }>(
      `SELECT id, event_type, event_data, created_at
       FROM admin_events WHERE created_by = $1
       ORDER BY created_at DESC LIMIT 20`,
      [id],
    );

    res.json({
      success: true,
      data: {
        user: userResult.rows[0],
        recentEvents: eventsResult.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-users] GET /:id error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch user',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * PATCH /admin/users/:id
 *
 * Update user role. Restrictions:
 * - Cannot demote yourself
 * - Cannot promote above your own role level
 * Emits user_role_changed audit event.
 */
adminUsersRouter.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['player', 'admin', 'developer'].includes(role)) {
      res.status(400).json({
        success: false,
        error: 'role must be one of: player, admin, developer',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Fetch the requesting user's role
    const selfResult = await queryOLTP<{ role: string }>(
      'SELECT role FROM users WHERE id = $1',
      [req.userId!],
    );
    const selfRole = selfResult.rows[0]?.role;

    // Fetch the target user's current role
    const targetResult = await queryOLTP<{ role: string; username: string }>(
      'SELECT role, username FROM users WHERE id = $1',
      [id],
    );

    if (targetResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const targetRole = targetResult.rows[0].role;

    // Cannot demote yourself
    if (id === req.userId) {
      res.status(400).json({
        success: false,
        error: 'Cannot change your own role',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Role hierarchy: developer > admin > player
    const roleHierarchy: Record<string, number> = { player: 0, admin: 1, developer: 2 };

    if (!selfRole || !(selfRole in roleHierarchy)) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized or invalid role',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Cannot modify a user with a higher-privileged role than your own.
    const targetLevel = roleHierarchy[targetRole];
    if (targetLevel === undefined || targetLevel > roleHierarchy[selfRole]) {
      res.status(403).json({
        success: false,
        error: 'Cannot modify a user above your own role',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Cannot promote above your own role
    if (roleHierarchy[role] > roleHierarchy[selfRole]) {
      res.status(403).json({
        success: false,
        error: `Cannot promote above your own role (${selfRole})`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    await queryOLTP(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2',
      [role, id],
    );

    emitAdminEvent('user_role_changed', {
      targetUserId: id,
      targetUsername: targetResult.rows[0].username,
      previousRole: targetRole,
      newRole: role,
    }, undefined, req.userId);

    res.json({
      success: true,
      data: { id, role },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-users] PATCH /:id error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update user',
      timestamp: new Date().toISOString(),
    });
  }
});
