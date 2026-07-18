import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { queryOLTP } from '../database/connection.js';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';

/**
 * Admin Settings Router
 *
 * System preference management endpoints.
 * All routes require admin/developer role.
 */
export const adminSettingsRouter = express.Router();

adminSettingsRouter.use(authAndAdminMiddleware);

/**
 * GET /admin/settings
 *
 * Return all system settings.
 */
adminSettingsRouter.get('/', async (_req, res) => {
  try {
    const result = await queryOLTP<{
      key: string; value: any; description: string | null; updated_at: string;
    }>(
      'SELECT key, value, description, updated_at FROM system_settings ORDER BY key',
    );

    res.json({
      success: true,
      data: { settings: result.rows },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-settings] GET / error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch settings',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * PATCH /admin/settings
 *
 * Update a system setting by key.
 * Body: { key: string, value: any, description?: string }
 * Emits settings_updated audit event.
 */
adminSettingsRouter.patch('/', async (req: AuthRequest, res) => {
  try {
    const { key: rawKey, value, description } = req.body;
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';

    if (!key || key.length > 100) {
      res.status(400).json({
        success: false,
        error: 'key must be a non-empty string of at most 100 characters',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (description !== undefined && description !== null && typeof description !== 'string') {
      res.status(400).json({
        success: false,
        error: 'description must be a string',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (value === undefined) {
      res.status(400).json({
        success: false,
        error: 'value is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const hasDescription = 'description' in req.body;

    // Upsert the setting
    await queryOLTP(
      `INSERT INTO system_settings (key, value, description, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = $2::jsonb,
           description = CASE WHEN $5 THEN $3 ELSE system_settings.description END,
           updated_by = $4,
           updated_at = NOW()`,
      [key, JSON.stringify(value), description || null, req.userId!, hasDescription],
    );

    emitAdminEvent('settings_updated', { key, value, description }, undefined, req.userId);

    res.json({
      success: true,
      data: { key, value },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-settings] PATCH / error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update setting',
      timestamp: new Date().toISOString(),
    });
  }
});
