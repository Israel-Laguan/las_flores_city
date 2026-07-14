import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import jsYaml from 'js-yaml';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { validateContent, checkContentQuality } from '../content/validate.js';
import { migrateContent } from '../content/migrate.js';
import { queryOLTP } from '../database/connection.js';
import { computeContentDiff } from './utils/contentDiff.js';
import { resolveContentDir, validateContentPath } from './admin-content.helpers.js';
import { adminContentTreeRouter } from './admin-content.tree.js';

export { resolveContentDir, validateContentPath } from './admin-content.helpers.js';
export type { ContentTreeEntry } from './admin-content.helpers.js';

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

// Mount tree routes (GET /file and GET /tree)
adminContentRouter.use(adminContentTreeRouter);

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
 * POST /admin/content/quality
 *
 * Runs content quality checks (density, length, inconsistency, completeness)
 * and returns the full QualityReport. These are advisory — they never block
 * migration.
 */
adminContentRouter.post('/quality', async (_req, res) => {
  try {
    const contentDir = resolveContentDir();
    console.log(`[admin-content] Running quality checks in: ${contentDir}`);

    const result = await checkContentQuality(contentDir);

    const totalIssues =
      result.density.length +
      result.length.length +
      result.inconsistency.length +
      result.completeness.length;

    const allIssues = [
      ...result.density,
      ...result.length,
      ...result.inconsistency,
      ...result.completeness,
    ];

    res.json({
      success: true,
      data: {
        report: result,
        summary: {
          density: result.density.length,
          length: result.length.length,
          inconsistency: result.inconsistency.length,
          completeness: result.completeness.length,
          total: totalIssues,
          errors: allIssues.filter(i => i.severity === 'error').length,
          warnings: allIssues.filter(i => i.severity === 'warning').length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-content] Quality check error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Quality check failed',
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

/**
 * PUT /admin/content/file
 *
 * Atomically writes YAML content to a content file.
 *
 * Request body: `{ "path": "<rel>.yaml", "content": "<yaml string>" }`
 *
 * Steps:
 *   1. Validate `path` via `validateContentPath`; 400 on failure.
 *   2. Parse `content` with `js-yaml`; 400 + error message if invalid YAML — no file written.
 *   3. Ensure the parent directory exists (`mkdir` with `{ recursive: true }`).
 *   4. Atomic write: `writeFile(resolvedPath + '.tmp', content)` then `rename(tmp, resolvedPath)`.
 *   5. Stat the written file; return `{ success: true, data: { path, size, modifiedAt }, timestamp }`.
 *
 * Satisfies: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */
adminContentRouter.put('/file', async (req, res) => {
  const { path: relPath, content } = req.body as { path?: unknown; content?: unknown };

  // Step 1: validate path
  const pathCheck = validateContentPath(relPath);
  if (!pathCheck.valid) {
    res.status(400).json({
      success: false,
      error: pathCheck.reason,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // At this point relPath is a valid non-empty string (guaranteed by validateContentPath)
  const safeRelPath = relPath as string;

  // Validate content is a string
  if (typeof content !== 'string') {
    res.status(400).json({
      success: false,
      error: 'content must be a string',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Step 2: parse YAML — reject invalid YAML before touching the filesystem
  try {
    jsYaml.load(content);
  } catch (yamlError: any) {
    res.status(400).json({
      success: false,
      error: yamlError.message || 'Invalid YAML',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const contentDir = resolveContentDir();
  const resolvedPath = path.resolve(contentDir, safeRelPath);

  try {
    // Step 3: ensure parent directory exists
    const parentDir = path.dirname(resolvedPath);
    await fs.promises.mkdir(parentDir, { recursive: true });

    // Step 4: atomic write via unique .tmp then rename (unique per request to avoid races)
    const tmpPath = `${resolvedPath}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    await fs.promises.writeFile(tmpPath, content, 'utf-8');
    await fs.promises.rename(tmpPath, resolvedPath);

    // Step 5: stat the written file and return metadata
    const stat = await fs.promises.stat(resolvedPath);

    res.json({
      success: true,
      data: {
        path: safeRelPath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-content] File write error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to write file',
      timestamp: new Date().toISOString(),
    });
  }
});
