import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { resolveContentDir, validateContentPath } from './admin-content.helpers.js';

export const adminContentTreeRouter = express.Router();

adminContentTreeRouter.use(authAndAdminMiddleware);

// ---------------------------------------------------------------------------
// GET /admin/content/file?path=<rel>
//
// Returns the raw YAML content of a single content file.
// Validates the path via validateContentPath; rejects traversal and
// non-.yaml files.
// ---------------------------------------------------------------------------

adminContentTreeRouter.get('/file', async (req, res) => {
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

adminContentTreeRouter.get('/tree', async (_req, res) => {
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
