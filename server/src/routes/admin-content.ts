import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import jsYaml from 'js-yaml';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { validateContent } from '../content/validate.js';
import { migrateContent } from '../content/migrate.js';
import { queryOLTP } from '../database/connection.js';
import { computeContentDiff } from './utils/contentDiff.js';
import { assignAsset } from '../services/ContentAssetService.js';

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

export function resolveContentDir(): string {
  const isSubdir = process.cwd().endsWith('server');
  return isSubdir
    ? path.resolve(process.cwd(), '..', 'content')
    : path.resolve(process.cwd(), 'content');
}

/**
 * Validates a relative content path before any filesystem operations.
 *
 * Returns `{ valid: true }` only when ALL of the following hold:
 *   1. `relPath` is a non-empty string (falsy inputs are rejected)
 *   2. `relPath` does not contain ".." (traversal guard)
 *   3. `relPath` ends with ".yaml" (content files must be YAML)
 *   4. The resolved absolute path starts with `resolveContentDir()`
 *      (second traversal guard for encoded or edge-case sequences)
 *
 * Satisfies: Requirements 6.2, 6.3, 6.4, 7.3, 7.4, 7.5
 */
export function validateContentPath(
  relPath: unknown,
): { valid: true } | { valid: false; reason: string } {
  // Rule 1: reject falsy / non-string inputs
  if (!relPath || typeof relPath !== 'string' || relPath.trim() === '') {
    return { valid: false, reason: 'Path must be a non-empty string' };
  }

  // Rule 2: reject traversal sequences
  if (relPath.includes('..')) {
    return { valid: false, reason: 'Path traversal sequences (..) are not allowed' };
  }

  // Rule 3: must end with .yaml
  if (!relPath.endsWith('.yaml')) {
    return { valid: false, reason: 'Path must end with .yaml' };
  }

  // Rule 4: resolved absolute path must stay inside ContentDir
  const contentDir = resolveContentDir();
  const absolutePath = path.resolve(contentDir, relPath);
  if (!absolutePath.startsWith(contentDir + path.sep) && absolutePath !== contentDir) {
    return { valid: false, reason: 'Resolved path falls outside the content directory' };
  }

  return { valid: true };
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

// ---------------------------------------------------------------------------
// ContentTreeEntry type
// ---------------------------------------------------------------------------

export interface ContentTreeEntry {
  path: string;       // Relative to content/, e.g. "characters/char_ana_kim.yaml"
  name: string;       // Stem (filename without .yaml), e.g. "char_ana_kim"
  type: string;       // Singular inferred type, e.g. "character"
  size: number;       // Bytes
  modifiedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// GET /admin/content/file?path=<rel>
//
// Returns the raw YAML content of a single content file.
// Validates the path via validateContentPath; rejects traversal and
// non-.yaml files.
// ---------------------------------------------------------------------------

adminContentRouter.get('/file', async (req, res) => {
  const relPath = req.query.path;

  const pathCheck = validateContentPath(relPath);
  if (!pathCheck.valid) {
    res.status(400).json({
      success: false,
      error: pathCheck.reason,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const safeRelPath = relPath as string;
  const contentDir = resolveContentDir();
  const absolutePath = path.resolve(contentDir, safeRelPath);

  try {
    const stat = await fs.promises.stat(absolutePath);
    const content = await fs.promises.readFile(absolutePath, 'utf-8');

    res.json({
      success: true,
      data: {
        path: safeRelPath,
        content,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.status(404).json({
        success: false,
        error: `File not found: ${safeRelPath}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    console.error('[admin-content] GET /file error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to read file',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/content/tree
//
// Returns a flat array of ContentTreeEntry for every .yaml file under
// the content directory. Infers `type` from the first directory segment
// (e.g. "characters/" → "character").
// ---------------------------------------------------------------------------

adminContentRouter.get('/tree', async (_req, res) => {
  try {
    const contentDir = resolveContentDir();

    // Verify the directory exists before walking it
    try {
      await fs.promises.access(contentDir);
    } catch {
      res.json({
        success: true,
        data: { tree: [] },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const dirents = await fs.promises.readdir(contentDir, {
      withFileTypes: true,
      recursive: true,
    });

    // Collect files to stat, then stat them in parallel
    const filesToStat = dirents
      .filter(dirent => {
        if (!dirent.isFile()) return false;
        return dirent.name.endsWith('.yaml');
      })
      .map(dirent => {
        const absolutePath = path.join(dirent.parentPath, dirent.name);
        const relativePath = path
          .relative(contentDir, absolutePath)
          .split(path.sep)
          .join('/');
        return { absolutePath, relativePath, filename: dirent.name };
      });

    const tree = await Promise.all(
      filesToStat.map(async ({ absolutePath, relativePath, filename }) => {
        const stat = await fs.promises.stat(absolutePath);
        const firstSegment = relativePath.split('/')[0] ?? 'unknown';
        const type = firstSegment.endsWith('ies')
          ? `${firstSegment.slice(0, -3)}y`
          : firstSegment.endsWith('s')
            ? firstSegment.slice(0, -1)
            : firstSegment;

        return {
          path: relativePath,
          name: filename.slice(0, -'.yaml'.length),
          type,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      })
    );

    res.json({
      success: true,
      data: { tree },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-content] GET /tree error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list content tree',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/content/assign-asset
//
// Assigns an asset URL to a field in a content YAML file.
// ---------------------------------------------------------------------------

adminContentRouter.post('/assign-asset', async (req, res) => {
  try {
    const { contentPath, fieldPath, assetUrl } = req.body;

    // Validate required fields
    if (!contentPath || typeof contentPath !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required field: contentPath',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!contentPath.endsWith('.yaml')) {
      res.status(400).json({
        success: false,
        error: 'contentPath must end with .yaml',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!fieldPath || typeof fieldPath !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required field: fieldPath',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!assetUrl || typeof assetUrl !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required field: assetUrl',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate content path (no traversal)
    const pathCheck = validateContentPath(contentPath);
    if (!pathCheck.valid) {
      res.status(400).json({
        success: false,
        error: pathCheck.reason,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await assignAsset(contentPath, fieldPath, assetUrl);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('File not found')) {
      res.status(404).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const isValidation = message.includes('Path traversal') || message.includes('Invalid field path') || message.includes('Invalid YAML');
    console.error('[admin-content] POST /assign-asset error:', error);
    res.status(isValidation ? 400 : 500).json({
      success: false,
      error: isValidation ? message : 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});