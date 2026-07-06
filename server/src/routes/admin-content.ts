import express from 'express';
import path from 'node:path';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { validateContent } from '../content/validate.js';
import { migrateContent } from '../content/migrate.js';
import { queryOLTP } from '../database/connection.js';
import { computeContentDiff } from './utils/contentDiff.js';

/**
 * Admin Content Pipeline Router
 *
 * Provides HTTP wrappers around the existing CLI content pipeline
 * (validate + migrate) so that authors can trigger and inspect
 * content operations from the admin UI instead of the terminal.
 *
 * All routes require admin/developer role (authAndAdminMiddleware).
 */
export const adminContentRouter = express.Router();

// All routes need admin auth
adminContentRouter.use(authAndAdminMiddleware);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function resolveContentDir(): string {
  const isSubdir = process.cwd().endsWith('server');
  return isSubdir
    ? path.resolve(process.cwd(), '..', 'content')
    : path.resolve(process.cwd(), 'content');
}

/**
 * POST /admin/content/validate
 *
 * Runs validateContent(contentDir) and returns the full ValidationResult.
 * The content directory is resolved relative to the project root
 * (parent of server/).
 */
adminContentRouter.post('/validate', async (_req, res) => {
  try {
    const contentDir = resolveContentDir();
    console.log(`[admin-content] Validating content in: ${contentDir}`);

    const result = await validateContent(contentDir);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-content] Validate error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Validation failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /admin/content/migrate
 *
 * Runs migrateContent(contentDir) and returns the full MigrationResult.
 * The content directory is resolved relative to the project root
 * (parent of server/).
 */
adminContentRouter.post('/migrate', async (_req, res) => {
  try {
    const contentDir = resolveContentDir();
    console.log(`[admin-content] Migrating content in: ${contentDir}`);

    const result = await migrateContent(contentDir);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-content] Migrate error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Migration failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /admin/content/status
 *
 * Reads the migration_log table and returns the last migration
 * status for each file, grouped by content type.
 */
adminContentRouter.get('/status', async (_req, res) => {
  try {
    const result = await queryOLTP(
      `SELECT
        ml.file_path,
        ml.file_checksum,
        ml.content_type,
        ml.content_id,
        ml.applied_at,
        u.username AS applied_by_username
      FROM migration_log ml
      LEFT JOIN users u ON ml.applied_by = u.id
      ORDER BY ml.content_type, ml.file_path`
    );

    // Normalize rows once, then group by content type
    const normalized = result.rows.map(row => ({
      filePath: row.file_path,
      checksum: row.file_checksum,
      contentType: row.content_type,
      contentId: row.content_id,
      appliedAt: row.applied_at,
      appliedBy: row.applied_by_username || null,
    }));
    const grouped: Record<string, any[]> = {};
    for (const file of normalized) {
      const type = file.contentType || 'unknown';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(file);
    }

    res.json({
      success: true,
      data: {
        totalFiles: normalized.length,
        byType: grouped,
        files: normalized,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-content] Status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch migration status',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /admin/content/diff
 *
 * Reads each YAML file in the content directory, computes a SHA-256
 * checksum, and compares it against migration_log.file_checksum to
 * return per-file status: unchanged, new, or modified.
 */
adminContentRouter.post('/diff', async (_req, res) => {
  try {
    const contentDir = resolveContentDir();
    const data = await computeContentDiff(contentDir);

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-content] Diff error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to compute diff',
      timestamp: new Date().toISOString(),
    });
  }
});