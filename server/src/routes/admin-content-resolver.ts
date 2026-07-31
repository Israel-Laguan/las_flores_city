import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as jsYaml from 'js-yaml';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { resolveContentDir, validateContentPath } from './admin-content.helpers.js';
import { getCache, setCache, invalidatePattern } from '../database/redis.js';

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
// Content resolver cache via shared Redis layer (per AGENTS.md hard constraints).
// 30-second TTL. Invalidated on any content write via invalidateContentResolverCache().
// ---------------------------------------------------------------------------

/** Exported so the write routes (PUT /file, POST /link) can invalidate stale entries. */
export async function invalidateContentResolverCache(): Promise<void> {
  await invalidatePattern('content-resolver:*');
}

// ---------------------------------------------------------------------------
// Type → content search roots
// ---------------------------------------------------------------------------
interface TypeConfig {
  roots: string[];
  pathTest?: (relPath: string) => boolean;
  /** Array of keys at the document root whose values are arrays of objects with `id` fields.
   *  If set, the resolver also searches these nested arrays for matching IDs,
   *  in addition to the root-level `id` check. */
  idArrays?: string[];
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  // content/characters/<slug>/char_<slug>.yaml
  character: { roots: ['characters'] },
  // content/scenes/<slug>/scene_<slug>.yaml
  scene: { roots: ['scenes'] },
  // content/stories/<slug>/<slug>.yaml — beats-based story arc files with root id
  story: { roots: ['stories'] },
  // content/missions/<slug>/mission_<slug>.yaml — IDs nested under missions[]
  mission: { roots: ['missions'], idArrays: ['missions'] },
  // content/overlays/<slug>/overlay_<slug>.yaml (or flat overlay_<slug>.yaml)
  overlay: { roots: ['overlays'] },
  // content/dialogues/<slug>.yaml (flat files)
  dialogue: { roots: ['dialogues'] },
  // content/vault/<slug>.yaml (flat files) — IDs nested under vault_items[]
  vault: { roots: ['vault'], idArrays: ['vault_items'] },
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

  const candidates: string[] = [];
  for (const root of config.roots) {
    const rootDir = path.join(contentDir, root);
    try {
      await fs.promises.access(rootDir);
    } catch {
      // Skip roots that don't exist rather than failing the whole request.
      continue;
    }
    const dirents = await fs.promises.readdir(rootDir, {
      withFileTypes: true,
      recursive: true,
    });
    for (const dirent of dirents) {
      if (!dirent.isFile()) continue;
      if (!dirent.name.endsWith('.yaml')) continue;
      const absolutePath = path.join(dirent.parentPath, dirent.name);
      const relWithinRoot = path.relative(rootDir, absolutePath).split(path.sep).join('/');
      const fullRelPath = `${root}/${relWithinRoot}`;
      if (config.pathTest && !config.pathTest(fullRelPath)) continue;
      candidates.push(fullRelPath);
    }
  }

  for (const relPath of candidates) {
    const absolutePath = path.resolve(contentDir, relPath);
    try {
      const raw = await fs.promises.readFile(absolutePath, 'utf-8');
      const parsed = jsYaml.load(raw);
      if (parsed && typeof parsed === 'object') {
        // Check root-level id first (e.g. character, scene, overlay, dialogue, beats-based story, location)
        if ((parsed as { id?: unknown }).id === id) {
          return { path: relPath, yaml: parsed };
        }
        // Check nested arrays (e.g. missions[], vault_items[], stories[])
        if (config.idArrays) {
          for (const key of config.idArrays) {
            const arr = (parsed as Record<string, unknown>)[key];
            if (Array.isArray(arr)) {
              for (const item of arr) {
                if (item && typeof item === 'object' && (item as { id?: unknown }).id === id) {
                  return { path: relPath, yaml: item };
                }
              }
            }
          }
        }
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

  if (typeof type !== 'string' || !type || !Object.prototype.hasOwnProperty.call(TYPE_CONFIG, type)) {
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

  const key = `content-resolver:${type}:${id}`;
  const cached = await getCache<{ path: string; yaml: unknown }>(key);
  if (cached) {
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

    await setCache(key, { path: found.path, yaml: found.yaml }, 30);

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
