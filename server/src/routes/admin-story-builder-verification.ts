import type { AuthRequest } from '../middleware/auth.js';
import { queryOLTP } from '@las-flores/infra';
import { aiCritiqueService } from '../services/AICritiqueService.js';

// GET /admin/story-builder/plans/:id/verification — Fetch saved verification report
// and the latest bounded conflict report (M25: recorded checked-scope + findings),
// plus stored AI critique annotations (M26: :Conflict / :Suggestion overlays).
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

    // M25 — latest bounded conflict report (checked-scope + findings) for the plan.
    let conflict_report: any = null;
    try {
      const cr = await queryOLTP<{ checked_scope: any; findings: any; passed: boolean; created_at: any }>(
        `SELECT checked_scope, findings, passed, created_at
           FROM conflict_reports
          WHERE plan_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [id],
      );
      if (cr.rows.length > 0) {
        conflict_report = {
          checkedScope: cr.rows[0].checked_scope,
          findings: cr.rows[0].findings,
          passed: cr.rows[0].passed,
          createdAt: new Date(cr.rows[0].created_at).toISOString(),
        };
      }
    } catch {
      // Best-effort: absence of a conflict report must not fail the request.
    }

    // M26 — stored AI critique annotations (:Conflict / :Suggestion). Best-effort
    // so an unavailable annotations table (migration not yet applied) never fails
    // the request.
    let critique_annotations: any[] | null = null;
    try {
      critique_annotations = await aiCritiqueService.getAnnotations(id as string);
    } catch (error) {
      // Best-effort: absence of an annotations table must not fail the request,
      // but a persistent failure should be observable (not silently "no annotations").
      console.warn('[story-builder] Failed to load critique annotations; treating as none:', error);
      critique_annotations = null;
    }

    res.json({
      success: true,
      data: {
        verification_report: result.rows[0].verification_report,
        conflict_report,
        critique_annotations,
      },
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
