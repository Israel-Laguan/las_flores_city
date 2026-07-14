import path from 'node:path';
import fs from 'node:fs/promises';
import type { ContentPlan } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext } from './LLMService.js';

export interface LoreGenerationResult {
  createdFiles: string[];
  errors: string[];
}

/**
 * Generates lore markdown files for plan items that have lore_path or narrative_path.
 * Only creates files that don't already exist (preserves user edits).
 */
export async function generateForPlan(
  plan: ContentPlan,
  provider: LLMProvider,
  context: ExistingContentContext,
): Promise<LoreGenerationResult> {
  const createdFiles: string[] = [];
  const errors: string[] = [];
  const loreRoot = path.resolve(process.cwd(), 'docs', 'lore');

  for (const item of plan.items) {
    const pathsToCreate: Array<{ field: string; label: string }> = [
      { field: 'lore_path', label: 'Lore' },
      { field: 'narrative_path', label: 'Narrative' },
    ];

    for (const { field, label } of pathsToCreate) {
      const relPath = item.fields[field];
      if (!relPath || typeof relPath !== 'string') continue;

      const fullPath = path.resolve(loreRoot, relPath);

      // Path safety check - must be within loreRoot
      if (!fullPath.startsWith(loreRoot + path.sep) && fullPath !== loreRoot) {
        console.warn(`[lore-generator] Skipping unsafe path: ${relPath}`);
        continue;
      }

      // Skip if file already exists (preserve user edits)
      try {
        await fs.access(fullPath);
        continue; // File exists, don't overwrite
      } catch {
        // File doesn't exist, create it
      }

      try {
        const loreContent = await provider.generateLore(item, context);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, loreContent, 'utf-8');
        createdFiles.push(relPath);
      } catch (err: any) {
        errors.push(`${label} for ${item.name}: ${err.message}`);
      }
    }
  }

  return { createdFiles, errors };
}
