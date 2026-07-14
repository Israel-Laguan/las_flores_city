import path from 'node:path';

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

export interface ContentTreeEntry {
  path: string;       // Relative to content/, e.g. "characters/char_ana_kim.yaml"
  name: string;       // Stem (filename without .yaml), e.g. "char_ana_kim"
  type: string;       // Singular inferred type, e.g. "character"
  size: number;       // Bytes
  modifiedAt: string; // ISO 8601
}
