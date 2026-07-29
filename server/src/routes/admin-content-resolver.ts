import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as jsYaml from 'js-yaml';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { resolveContentDir, validateContentPath } from './admin-content.helpers.js';

/**
 * Admin Content Resolver Router
 *
 * Read-only endpoint that resolves a DB entity `id` → its canonical YAML file
 * path + parsed object. This bridges id-based detail/list pages
 * (`GET /admin/<type>/:id`) with the path-based YAML write surface
 * (`PUT /admin/content/file`).
 *
 * Canonical source of truth is the YAML under `content/`; the server migrates
 * YAML → DB. This resolver never edits the DB (see AGENTS.md content-layering
 * contract).
 *
 * All routes require admin/developer role (authAndAdminMiddleware).
 */
export const adminContentResolverRouter = express.Router();

adminContentResolverRouter.use(authAndAdminMiddleware);

// ---------------------------------------------------------------------------
// In-process cache (dev tool only — NOT a new cache layer per AGENTS.md).
// Plain module-level Map with TTL. Invalidated on any content write via
// invalidateContentResolverCache() (called from PUT /file and POST /link).
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  path: string;
  yaml: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Exported so the write routes (PUT /file, POST /link) can invalidate stale entries. */
export function invalidateContentResolverCache(): void {
  cache.clear();
}

function cacheKey(type: string, id: string): string {
  return `${type}:${id}`;
}

// ---------------------------------------------------------------------------
// Type → content search roots
// ---------------------------------------------------------------------------
interface TypeConfig {
  roots: string[];
  pathTest?: (relPath: string) => boolean;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  // content/characters/<slug>/char_<slug>.yaml
  character: { roots: ['characters'] },
  // content/districts/<district>/locations/<slug>/location_<slug>.yaml (nested)
  location: { roots: ['districts'], pathTest: (rel) => rel.includes('/locations/') },
};

// ---------------------------------------------------------------------------
// Filesystem scan
// ---------------------------------------------------------------------------
async function findContentFile(
  type: string,
  id: string,
): Promise<{ path: string; yaml: unknown } | null> {
  const config = TYPE_CONFIG[type];
  const contentDir = resolveContentDir();

  try {
    await fs.promises.access(contentDir);
  } catch {
    return null;
  }

  const dirents = await fs.promises.readdir(contentDir, {
    withFileTypes: true,
    recursive: true,
  });

  const candidates: string[] = [];
  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    if (!dirent.name.endsWith('.yaml')) continue;
    const absolutePath = path.join(dirent.parentPath, dirent.name);
    const relPath = path.relative(contentDir, absolutePath).split(path.sep).join('/');
    if (!config.roots.some((root) => relPath.startsWith(`${root}/`))) continue;
    if (config.pathTest && !config.pathTest(relPath)) continue;
    candidates.push(relPath);
  }

  for (const relPath of candidates) {
    const absolutePath = path.resolve(contentDir, relPath);
    try {
      const raw = await fs.promises.readFile(absolutePath, 'utf-8');
      const parsed = jsYaml.load(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as { id?: unknown }).id === id
      ) {
        return { path: relPath, yaml: parsed };
      }
    } catch {
      // Skip unparseable files rather than failing the whole request.
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// GET /admin/content/by-id?type=<type>&id=<uuid>
// ---------------------------------------------------------------------------
adminContentResolverRouter.get('/by-id', async (req, res) => {
  const type = req.query.type;
  const id = req.query.id;

  if (typeof type !== 'string' || !type || !(type in TYPE_CONFIG)) {
    res.status(400).json({
      success: false,
      error: `type must be one of: ${Object.keys(TYPE_CONFIG).join(', ')}`,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (typeof id !== 'string' || id.trim() === '') {
    res.status(400).json({
      success: false,
      error: 'id must be a non-empty string',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const key = cacheKey(type, id);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.json({
      success: true,
      data: { path: cached.path, yaml: cached.yaml },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const found = await findContentFile(type, id);
    if (!found) {
      res.status(404).json({
        success: false,
        error: `No content file found for type '${type}' with id '${id}'`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const pathCheck = validateContentPath(found.path);
    if (!pathCheck.valid) {
      res.status(500).json({
        success: false,
        error: `Resolved path failed validation: ${pathCheck.reason}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    cache.set(key, {
      path: found.path,
      yaml: found.yaml,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    res.json({
      success: true,
      data: { path: found.path, yaml: found.yaml },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-content-resolver] by-id error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to resolve content file',
      timestamp: new Date().toISOString(),
    });
  }
});
