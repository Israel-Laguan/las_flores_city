import fs from 'fs/promises';
import path from 'path';

export async function validateLorePaths(filePath: string, data: any, warnings: string[]) {
  const projectRoot = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');
  const contentDir = path.dirname(filePath);

  if (data?.lore_path) {
    const fullPath = path.resolve(projectRoot, data.lore_path);
    try {
      await fs.access(fullPath);
    } catch {
      warnings.push(`Lore file not found: ${data.lore_path}`);
    }
  }

  if (data?.narrative_path) {
    const fullPath = path.join(contentDir, data.narrative_path);
    try {
      await fs.access(fullPath);
    } catch {
      warnings.push(`Narrative file not found: ${data.narrative_path}`);
    }
  }
}
