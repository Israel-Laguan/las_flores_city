import fs from 'fs/promises';
import path from 'path';

export async function validateLorePaths(filePath: string, data: any, warnings: string[]) {
  const projectRoot = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');

  if (data?.lore_path) {
    const fullPath = path.resolve(projectRoot, data.lore_path);
    try {
      await fs.access(fullPath);
    } catch {
      warnings.push(`Lore file not found: ${data.lore_path}`);
    }
  }

  if (data?.narrative_path) {
    const fullPath = path.resolve(projectRoot, data.narrative_path);
    try {
      await fs.access(fullPath);
    } catch {
      warnings.push(`Narrative file not found: ${data.narrative_path}`);
    }
  }

  const assetPaths = data?.asset_paths;
  if (assetPaths && typeof assetPaths === 'object') {
    const contentDir = process.env.CONTENT_DIR || path.resolve(process.cwd(), '../content');
    const assetRoot = path.join(contentDir, 'assets');

    for (const [assetType, assetPath] of Object.entries(assetPaths)) {
      if (typeof assetPath !== 'string') continue;
      const fullPath = path.join(assetRoot, assetPath);
      try {
        await fs.access(fullPath);
      } catch {
        warnings.push(`Asset file not found: ${assetPath} (${assetType})`);
      }
    }
  }
}
