import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';

/**
 * Admin Lore Router
 *
 * Provides HTTP endpoints for browsing, reading, and editing the in-universe
 * world lore markdown files under content/lore/ (the "story bible":
 * timeline, geography, communities, organizations, events, media,
 * governance, stories, and top-level overview documents). All routes
 * require an admin/developer role.
 *
 * Dev/authoring guides live under docs/lore/ and are intentionally NOT
 * surfaced here — they are documentation, not in-universe lore.
 */
export const adminLoreRouter = express.Router();

// All routes need admin auth
adminLoreRouter.use(authAndAdminMiddleware);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the in-universe world lore directory
 * (content/lore/). This is the "story bible" surfaced by the /lore admin
 * page: timeline, geography, communities, organizations, events, media,
 * governance, stories, and top-level overview documents.
 *
 * Resolves relative to process.cwd(), accounting for whether the cwd
 * is the server/ subdirectory or the project root.
 */
export function getWorldLoreDir(): string {
  const isSubdir = process.cwd().endsWith('server');
  return isSubdir
    ? path.resolve(process.cwd(), '..', 'content', 'lore')
    : path.resolve(process.cwd(), 'content', 'lore');
}

/**
 * Allowlist of known immediate subdirectories under the world lore
 * directory (content/lore/).
 * `validateLorePath` rejects any path whose first segment is not in this list.
 */
export const LORE_SUBDIRS = [
  'communities',
  'events',
  'governance',
  'media',
  'organizations',
  'stories',
] as const;
// Note: `shared/` is deliberately excluded — it hosts the prompt/template
// registry (phone, tiles, …), which is dev tooling, not in-universe lore.

export type LoreSubdir = typeof LORE_SUBDIRS[number];

/**
 * Returns true if a relative lore path is within an allowed location for
 * recursive discovery: either a top-level file (no subdirectory) or a file
 * inside one of the LORE_SUBDIRS allowlisted subdirectories.
 *
 * Mirrors the subdirectory check in validateLorePath so that /tree and /search
 * stay consistent with /file (which rejects paths outside the allowlist, e.g.
 * the deliberately-excluded `shared/` dev-tooling directory).
 */
export function isLorePathInAllowlist(relativePath: string): boolean {
  const segments = relativePath.split('/');
  if (segments.length <= 1) return true; // top-level file
  const firstSegment = segments[0] ?? '';
  return (LORE_SUBDIRS as readonly string[]).includes(firstSegment);
}

/**
 * Derives the singular content type from the first path segment of a
 * relative lore path. Strips a trailing 's' to produce the singular form.
 *
 * Examples:
 *   "communities/ana_kim.md"        → "community"
 *   "events/revolution.md"          → "event"
 *   "organizations/van_der_meer.md" → "organization"
 *   "media/README.md"               → "media" (no trailing 's')
 *   "stories/the_fall.md"           → "story"
 *   "timeline.md"                   → "timeline.md" (top-level file: stem returned as-is)
 */
export function inferLoreType(relativePath: string): string {
  const firstSegment = relativePath.split('/')[0] ?? '';
  // Handle common plural forms: -ies → -y, -s → strip trailing s
  // e.g. "mysteries" → "mystery", "companies" → "company", "figures" → "figure"
  // "humanity_first" has no trailing 's', so it stays unchanged.
  return firstSegment.endsWith('ies')
    ? `${firstSegment.slice(0, -3)}y`
    : firstSegment.endsWith('s')
      ? firstSegment.slice(0, -1)
      : firstSegment;
}

/**
 * Validates a relative lore path before any filesystem operations.
 *
 * Rejects:
 * - Paths containing ".." (traversal guard)
 * - Paths whose first segment is not in LORE_SUBDIRS
 * - Paths not ending with ".md"
 * - Paths ending with ".prompt.md" (prompt files are not lore files)
 */
export function validateLorePath(
  relPath: string,
): { valid: true } | { valid: false; reason: string } {
  if (relPath.includes('..')) {
    return { valid: false, reason: 'Path traversal sequences (..) are not allowed' };
  }

  const segments = relPath.split('/');
  const firstSegment = segments[0] ?? '';
  // Allow bare filenames (top-level lore files) or files inside a known subdirectory
  if (segments.length > 1 && !(LORE_SUBDIRS as readonly string[]).includes(firstSegment)) {
    return {
      valid: false,
      reason: `Path must start with a known lore subdirectory; got "${firstSegment}"`,
    };
  }

  if (!relPath.endsWith('.md')) {
    return { valid: false, reason: 'Path must end with .md' };
  }

  if (relPath.endsWith('.prompt.md')) {
    return { valid: false, reason: 'Prompt files (.prompt.md) are not accessible via this endpoint' };
  }

  return { valid: true };
}

/**
 * Resolves a relative lore path to an absolute path after validation.
 * Combines string-level validation (validateLorePath) with a resolved-path
 * prefix guard to catch encoded traversal sequences.
 *
 * Returns the validated absolute path or a failure reason.
 */
export function resolveLoreAbsolutePath(
  relPath: string,
): { ok: true; absolutePath: string } | { ok: false; reason: string } {
  const validation = validateLorePath(relPath);
  if (!validation.valid) {
    return { ok: false, reason: validation.reason };
  }

  const loreDir = getWorldLoreDir();
  const absolutePath = path.join(loreDir, relPath);

  if (!absolutePath.startsWith(loreDir + path.sep) && absolutePath !== loreDir) {
    return { ok: false, reason: 'Path traversal sequences (..) are not allowed' };
  }

  return { ok: true, absolutePath };
}

// ---------------------------------------------------------------------------
// LoreFileEntry type
// ---------------------------------------------------------------------------

export interface LoreFileEntry {
  path: string;       // Relative to content/lore/, e.g. "communities/ana_kim.md"
  name: string;       // Stem (filename without .md), e.g. "ana_kim"
  type: string;       // Singular inferred type, e.g. "figure"
  size: number;       // Bytes
  modifiedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// walkLoreMdFiles — shared helper for recursive lore directory traversal
//
// Returns all lore markdown files (excluding .prompt.md) under the given
// directory as { relativePath, absolutePath } pairs. Used by both /tree
// and /search to avoid duplicating the directory walk logic.
// ---------------------------------------------------------------------------

async function walkLoreMdFiles(
  loreDir: string,
): Promise<Array<{ relativePath: string; absolutePath: string }>> {
  const files: Array<{ relativePath: string; absolutePath: string }> = [];

  // Include top-level .md files
  const topEntries = await fs.promises.readdir(loreDir, { withFileTypes: true });
  for (const entry of topEntries) {
    if (!entry.isFile()) continue;
    const filename = entry.name;
    if (!filename.endsWith('.md') || filename.endsWith('.prompt.md')) continue;
    const absolutePath = path.join(loreDir, filename);
    files.push({ relativePath: filename, absolutePath });
  }

  // Recurse into subdirectories
  const dirents = await fs.promises.readdir(loreDir, {
    withFileTypes: true,
    recursive: true,
  });

  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;

    const filename = dirent.name;
    if (!filename.endsWith('.md') || filename.endsWith('.prompt.md')) continue;

    // In Node 20, recursive Dirent.parentPath is the parent directory path.
    const absolutePath = path.join(dirent.parentPath, filename);
    const relativePath = path
      .relative(loreDir, absolutePath)
      .split(path.sep)
      .join('/');

    // Skip if already added as a top-level file
    if (files.some(f => f.absolutePath === absolutePath)) continue;

    files.push({ relativePath, absolutePath });
  }

  // Filter to the LORE_SUBDIRS allowlist (plus top-level files) so /tree and
  // /search never surface excluded directories such as `shared/` (dev tooling).
  return files.filter(f => isLorePathInAllowlist(f.relativePath));
}

// ---------------------------------------------------------------------------
// GET /admin/lore/tree
//
// Recursively walks getWorldLoreDir() (content/lore/), filters to .md files
// (excluding .prompt.md), stats each file, and returns a flat array of
// LoreFileEntry.
//
// If the lore directory does not exist, returns an empty tree rather
// than a 500 error.
//
// Satisfies: Requirements 2.1, 2.2, 2.3, 2.4
// ---------------------------------------------------------------------------

adminLoreRouter.get('/tree', async (_req, res) => {
  try {
    const loreDir = getWorldLoreDir();

    // Verify the world lore directory exists before walking it.
    try {
      await fs.promises.access(loreDir);
    } catch {
      // Directory doesn't exist — return empty tree rather than 500.
      res.json({
        success: true,
        data: { tree: [] },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Walk the lore directory recursively and collect lore file paths.
    const loreFiles = await walkLoreMdFiles(loreDir);

    // Stat all files in parallel
    const tree = await Promise.all(
      loreFiles.map(async ({ relativePath, absolutePath }) => {
        const stat = await fs.promises.stat(absolutePath);
        const filename = relativePath.split('/').pop() ?? relativePath;
        return {
          path: relativePath,
          name: filename.slice(0, -'.md'.length),
          type: inferLoreType(relativePath),
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[admin-lore] GET /tree error:', error);
    res.status(500).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// SearchResult type
// ---------------------------------------------------------------------------

export interface SearchResult {
  path: string;   // Relative lore path, e.g. "figures/ana_kim.md"
  name: string;   // Stem (filename without .md)
  match: string;  // Up to 200 chars of context surrounding the match
}

// ---------------------------------------------------------------------------
// searchLoreFiles — pure helper (testable without hitting the filesystem)
//
// Given a query string and a list of { relativePath, content } records,
// returns a SearchResult for each file that contains the query
// (case-insensitive).  The `match` field is extracted as:
//   content.substring(Math.max(0, idx - 100), idx + 100)
// where `idx` is the first match position in the lowercased content.
//
// If `query` is empty, returns an empty array immediately.
//
// Exported so property tests can call it directly without filesystem I/O.
//
// Satisfies: Requirements 4.2, 4.3, 4.4
// ---------------------------------------------------------------------------

export interface LoreFileRecord {
  relativePath: string;
  content: string;
}

export function searchLoreFiles(query: string, files: LoreFileRecord[]): SearchResult[] {
  if (query === '') return [];

  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const file of files) {
    const lowerContent = file.content.toLowerCase();
    const idx = lowerContent.indexOf(lowerQuery);
    if (idx === -1) continue;

    const match = file.content.substring(Math.max(0, idx - 100), idx + 100);
    const filename = file.relativePath.split('/').pop() ?? file.relativePath;
    const name = filename.endsWith('.md')
      ? filename.slice(0, -'.md'.length)
      : filename;

    results.push({ path: file.relativePath, name, match });
  }

  return results;
}

// ---------------------------------------------------------------------------
// GET /admin/lore/file?path=<rel>
//
// Returns the raw markdown content of a single lore file.
// Applies two layers of traversal protection:
//   1. validateLorePath rejects any relPath containing ".."
//   2. After path.join, confirmed resolved path is still within getWorldLoreDir()
//
// Satisfies: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
// ---------------------------------------------------------------------------

adminLoreRouter.get('/file', async (req, res) => {
  try {
    const relPath = req.query.path;

    // Missing or empty path param
    if (typeof relPath !== 'string' || relPath.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Missing required query parameter: path',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate and resolve path
    const resolved = resolveLoreAbsolutePath(relPath);
    if (!resolved.ok) {
      res.status(400).json({
        success: false,
        error: resolved.reason,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const { absolutePath } = resolved;

    // Stat the file — return success with exists: false if ENOENT
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(absolutePath);
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        res.json({
          success: true,
          data: {
            path: relPath,
            content: '',
            exists: false,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      throw err;
    }

    // Read file content as UTF-8 string
    const content = await fs.promises.readFile(absolutePath, 'utf-8');

    res.json({
      success: true,
      data: {
        path: relPath,
        content,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[admin-lore] GET /file error:', error);
    res.status(500).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/lore/file
//
// Saves (creates or overwrites) a lore markdown file.
// Body: { path: string, content: string }
//
// Satisfies: lore file creation/editing from the admin UI
// ---------------------------------------------------------------------------

adminLoreRouter.post('/file', async (req, res) => {
  try {
    const { path: relPath, content } = req.body;

    if (typeof relPath !== 'string' || relPath.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Missing required field: path',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (typeof content !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required field: content',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate and resolve path
    const resolved = resolveLoreAbsolutePath(relPath);
    if (!resolved.ok) {
      res.status(400).json({
        success: false,
        error: resolved.reason,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const { absolutePath } = resolved;

    const dir = path.dirname(absolutePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(absolutePath, content, 'utf-8');

    res.json({
      success: true,
      data: { path: relPath, saved: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[admin-lore] POST /file error:', error);
    res.status(500).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/lore/search?q=<keyword>
//
// Searches all lore markdown files for a case-insensitive substring match.
// Returns an empty results array when q is empty (per requirement 4.4).
//
// The heavy lifting is delegated to the pure `searchLoreFiles` helper above
// so it can be property-tested independently.
//
// Satisfies: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
// ---------------------------------------------------------------------------

adminLoreRouter.get('/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';

    // Empty query → return empty results immediately
    if (q.trim() === '') {
      res.json({
        success: true,
        data: { results: [] },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const loreDir = getWorldLoreDir();

    // Verify the world lore directory exists before walking it.
    try {
      await fs.promises.access(loreDir);
    } catch {
      res.json({
        success: true,
        data: { results: [] },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Walk the lore directory recursively and collect lore file paths.
    const loreFiles = await walkLoreMdFiles(loreDir);

    // Read all files in parallel
    const fileRecords = await Promise.all(
      loreFiles.map(async ({ relativePath, absolutePath }) => {
        const content = await fs.promises.readFile(absolutePath, 'utf-8');
        return { relativePath, content };
      })
    );

    const results = searchLoreFiles(q, fileRecords);

    res.json({
      success: true,
      data: { results },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[admin-lore] GET /search error:', error);
    res.status(500).json({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
});
