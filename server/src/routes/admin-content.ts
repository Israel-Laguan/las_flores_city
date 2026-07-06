import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { validateContent } from '../content/validate.js';
import { migrateContent } from '../content/migrate.js';
import { queryOLTP } from '../database/connection.js';

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

/**
 * POST /admin/content/validate
 *
 * Runs validateContent(contentDir) and returns the full ValidationResult.
 * The content directory is resolved relative to the project root
 * (parent of server/).
 */
adminContentRouter.post('/validate', async (_req, res) => {
  try {
    // Resolve content directory relative to project root
    const isSubdir = process.cwd().endsWith('server');
    const contentDir = isSubdir
      ? path.resolve(process.cwd(), '..', 'content')
      : path.resolve(process.cwd(), 'content');
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
    // Resolve content directory relative to project root
    const isSubdir = process.cwd().endsWith('server');
    const contentDir = isSubdir
      ? path.resolve(process.cwd(), '..', 'content')
      : path.resolve(process.cwd(), 'content');
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
    const isSubdir = process.cwd().endsWith('server');
    const contentDir = isSubdir
      ? path.resolve(process.cwd(), '..', 'content')
      : path.resolve(process.cwd(), 'content');

    // Collect all YAML files recursively
    const files: string[] = [];
    async function walkDir(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
          files.push(fullPath);
        }
      }
    }
    await walkDir(contentDir);

    // Load existing checksums from migration_log
    const checksumResult = await queryOLTP(
      `SELECT file_path, file_checksum FROM migration_log`
    );
    const knownChecksums = new Map<string, string>();
    for (const row of checksumResult.rows) {
      knownChecksums.set(row.file_path, row.file_checksum);
    }

    // Compare each file
    const results = await Promise.all(
      files.map(async (filePath) => {
        const content = await fs.readFile(filePath, 'utf8');
        const checksum = crypto.createHash('sha256').update(content).digest('hex');
        const relativePath = path.relative(contentDir, filePath);
        const known = knownChecksums.get(relativePath);

        let status: 'unchanged' | 'new' | 'modified';
        if (!known) {
          status = 'new';
        } else if (known === checksum) {
          status = 'unchanged';
        } else {
          status = 'modified';
        }

        return {
          filePath: relativePath,
          checksum,
          status,
          knownChecksum: known || null,
        };
      })
    );

    res.json({
      success: true,
      data: {
        totalFiles: results.length,
        newFiles: results.filter(r => r.status === 'new').length,
        modifiedFiles: results.filter(r => r.status === 'modified').length,
        unchangedFiles: results.filter(r => r.status === 'unchanged').length,
        files: results,
      },
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