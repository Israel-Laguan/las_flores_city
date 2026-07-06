import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { queryOLTP } from '../database/connection.js';

/**
 * Admin Stats Router
 *
 * Provides dashboard statistics and analytics summary endpoints.
 * All routes require admin/developer role (authAndAdminMiddleware).
 */
export const adminStatsRouter = express.Router();

adminStatsRouter.use(authAndAdminMiddleware);

/**
 * GET /admin/stats
 *
 * Returns real counts from the main content tables plus recent migration activity.
 */
adminStatsRouter.get('/', async (_req, res) => {
  try {
    const [characters, dialogues, scenes, overlays, mysteries, recentActivity] = await Promise.all([
      queryOLTP(`SELECT count(*)::int AS count FROM characters`),
      queryOLTP(`SELECT count(*)::int AS count FROM dialogue_trees`),
      queryOLTP(`SELECT count(*)::int AS count FROM scenes`),
      queryOLTP(`SELECT count(*)::int AS count FROM dialogue_overlays`),
      queryOLTP(`SELECT count(*)::int AS count FROM mysteries`),
      queryOLTP(
        `SELECT
          ml.content_type AS "contentType",
          ml.file_path AS "filePath",
          ml.applied_at AS "appliedAt",
          u.username AS "appliedBy"
        FROM migration_log ml
        LEFT JOIN users u ON ml.applied_by = u.id
        ORDER BY ml.applied_at DESC
        LIMIT 5`
      ),
    ]);

    res.json({
      success: true,
      data: {
        counts: {
          characters: characters.rows[0].count,
          dialogues: dialogues.rows[0].count,
          scenes: scenes.rows[0].count,
          overlays: overlays.rows[0].count,
          mysteries: mysteries.rows[0].count,
        },
        recentActivity: recentActivity.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-stats] GET /stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch stats',
      timestamp: new Date().toISOString(),
    });
  }
});
