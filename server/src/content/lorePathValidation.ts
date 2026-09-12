import fs from 'fs/promises';
import path from 'path';

/**
 * Resolve a lore_path relative to the YAML's directory.
 * Falls back to the old docs/lore/... path for backward compatibility.
 */
async function resolveLorePath(yamlDir: string, lorePath: string): Promise<string | null> {
  // New per-folder layout: lore_path is just the filename (e.g. "slug.md")
  const newPath = path.join(yamlDir, lorePath);
  try {
    await fs.access(newPath);
    return newPath;
  } catch {
    // Not found in new location, try old path
  }

  // Old layout fallback: docs/lore/figures/<slug>/<slug>.md
  const projectRoot = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');
  const oldPath = path.resolve(projectRoot, lorePath);
  try {
    await fs.access(oldPath);
    return oldPath;
  } catch {
    // Not found anywhere
  }

  return null;
}

export async function validateLorePaths(filePath: string, data: any, warnings: string[]) {
  const yamlDir = path.dirname(filePath);

  if (data?.lore_path) {
    const resolved = await resolveLorePath(yamlDir, data.lore_path);
    if (!resolved) {
      warnings.push(`Lore file not found: ${data.lore_path}`);
    }
  }

  if (data?.narrative_path) {
    const resolved = await resolveLorePath(yamlDir, data.narrative_path);
    if (!resolved) {
      warnings.push(`Narrative file not found: ${data.narrative_path}`);
    }
  }

  // Asset file existence is intentionally NOT checked here.
  // - content/**/assets/*.png are .gitignored (staging drafts only)
  // - Canonical assets live in MinIO; YAMLs record them via portrait_urls / background_urls
  // - asset_paths.* is a local "which draft did I select" pointer and may reference
  //   files that are not present on disk in CI or on other machines.
  // Missing local assets must not produce warnings or fail migrations.
}
