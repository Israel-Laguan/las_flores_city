import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { fetchAnalyticsQueries, fetchAdminAnalytics } from './utils/analyticsQueries.js';

/**
 * Admin Analytics Router
 *
 * Provides content authoring analytics by querying the OLAP player_events table
 * and admin_events table. All routes require admin/developer role.
 */
export const adminAnalyticsRouter = express.Router();

adminAnalyticsRouter.use(authAndAdminMiddleware);

/**
 * GET /admin/analytics/summary
 *
 * Returns aggregated analytics for the admin dashboard:
 * - Dialogue completion rates
 * - Story beat reach percentages
 * - Mystery status distribution
 * - Time-block spend per content type
 */
adminAnalyticsRouter.get('/summary', async (_req, res) => {
  try {
    const data = await fetchAnalyticsQueries();

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-analytics] GET /analytics/summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch analytics summary',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /admin/analytics/story-builder
 *
 * Returns Story Builder analytics from the admin_events OLAP table:
 * - Plans created (24h / 7d)
 * - Event breakdown by type
 * - Average items per plan
 * - Success rate (verified vs failed)
 */
adminAnalyticsRouter.get('/story-builder', async (_req, res) => {
  try {
    const data = await fetchAdminAnalytics();

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-analytics] GET /analytics/story-builder error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch story builder analytics',
      timestamp: new Date().toISOString(),
    });
  }
});
