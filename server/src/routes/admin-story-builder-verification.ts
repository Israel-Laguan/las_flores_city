import type { AuthRequest } from '../middleware/auth.js';
import { queryOLTP } from '../database/connection.js';

// GET /admin/story-builder/plans/:id/verification — Fetch saved verification report
export async function handleGetVerificationReport(req: AuthRequest, res: any) {
  try {
    const { id } = req.params;

    const result = await queryOLTP<{ verification_report: any }>(
      'SELECT verification_report FROM content_plans WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Plan not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      success: true,
      data: { verification_report: result.rows[0].verification_report },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] GET /plans/:id/verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch verification report',
      timestamp: new Date().toISOString(),
    });
  }
}
