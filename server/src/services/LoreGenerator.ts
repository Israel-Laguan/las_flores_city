import path from 'node:path';
import fs from 'node:fs/promises';
import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext } from './types/LLMTypes.js';
import { resolveFilePath } from './ContentSkeletonGenerator.js';
import { resolveContentDir } from './StoryBuilderLore.js';

export interface LoreGenerationResult {
  createdFiles: string[];
  errors: string[];
}

export interface LoreGenerationOptions {
  overwrite?: boolean;
}

/**
 * Generates lore markdown files for plan items that have lore_path or narrative_path.
 * By default, only creates files that don't already exist (preserves user edits).
 * With overwrite: true, will overwrite existing TODO placeholder files but not user-edited content.
 * Writes to per-entity folders: content/<type>s/<slug>/<slug>.md
 */
export async function generateForPlan(
  plan: ContentPlan,
  provider: LLMProvider,
  context: ExistingContentContext,
  options: LoreGenerationOptions = {},
): Promise<LoreGenerationResult> {
  const createdFiles: string[] = [];
  const errors: string[] = [];
  const contentDir = resolveContentDir();

  for (const item of plan.items) {
    const pathsToCreate: Array<{ field: string; label: string }> = [
      { field: 'lore_path', label: 'Lore' },
      { field: 'narrative_path', label: 'Narrative' },
    ];

    for (const { field, label } of pathsToCreate) {
      const relPath = item.fields[field];
      if (!relPath || typeof relPath !== 'string') continue;

      // Per-folder layout: lore files are in the same directory as the YAML
      const yamlDir = path.dirname(resolveFilePath(item));
      const fullPath = path.join(contentDir, yamlDir, relPath);

      // Path safety check - must be within contentDir
      if (!fullPath.startsWith(contentDir + path.sep) && fullPath !== contentDir) {
        console.warn(`[lore-generator] Skipping unsafe path: ${relPath}`);
        continue;
      }

      // Skip if file already exists and we're not overwriting
      if (!options.overwrite) {
        try {
          await fs.access(fullPath);
          continue; // File exists, don't overwrite
        } catch {
          // File doesn't exist, create it
        }
      } else {
        // When overwriting, check if file exists and contains only TODO placeholder
        try {
          const existingContent = await fs.readFile(fullPath, 'utf-8');
          // Only overwrite if it's a TODO placeholder (preserves actual user edits)
          if (existingContent.trim() && !existingContent.includes('TODO')) {
            continue; // File has real content, don't overwrite user edits
          }
        } catch {
          // File doesn't exist, we'll create it
        }
      }

      try {
        const loreContent = await provider.generateLore(item, context);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, loreContent, 'utf-8');
        createdFiles.push(`${yamlDir}/${relPath}`);
      } catch (err: any) {
        errors.push(`${label} for ${item.name}: ${err.message}`);
      }
    }
  }

  return { createdFiles, errors };
}

/**
 * Generates lore markdown file for a single content item.
 * Used by PlanGenerationJob to generate lore after filling fields.
 */
export async function generateForItem(
  item: ContentPlanItem,
  provider: LLMProvider,
  context: ExistingContentContext,
  overwrite?: boolean,
): Promise<{ createdFile: string | null; error: string | null }> {
  const contentDir = resolveContentDir();
  
  const pathsToCreate: Array<{ field: string; label: string }> = [
    { field: 'lore_path', label: 'Lore' },
    { field: 'narrative_path', label: 'Narrative' },
  ];

  const createdFiles: string[] = [];
  const errors: string[] = [];

  for (const { field, label } of pathsToCreate) {
    const relPath = item.fields[field];
    if (!relPath || typeof relPath !== 'string') continue;

    // Per-folder layout: lore files are in the same directory as the YAML
    const yamlDir = path.dirname(resolveFilePath(item));
    const fullPath = path.join(contentDir, yamlDir, relPath);

    // Path safety check - must be within contentDir
    if (!fullPath.startsWith(contentDir + path.sep) && fullPath !== contentDir) {
      console.warn(`[lore-generator] Skipping unsafe path: ${relPath}`);
      continue;
    }

    // Skip if file already exists and we're not overwriting
    if (!overwrite) {
      try {
        await fs.access(fullPath);
        continue; // File exists, don't overwrite
      } catch {
        // File doesn't exist, create it
      }
    } else {
      // When overwriting, check if file exists and contains only TODO placeholder
      try {
        const existingContent = await fs.readFile(fullPath, 'utf-8');
        // Only overwrite if it's a TODO placeholder (preserves actual user edits)
        if (existingContent.trim() && !existingContent.includes('TODO')) {
          continue; // File has real content, don't overwrite user edits
        }
      } catch {
        // File doesn't exist, we'll create it
      }
    }

    try {
      const loreContent = await provider.generateLore(item, context);
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, loreContent, 'utf-8');
      createdFiles.push(`${yamlDir}/${relPath}`);
    } catch (err: any) {
      errors.push(`${label} for ${item.name}: ${err.message}`);
    }
  }

  return { createdFile: createdFiles[0] || null, error: errors[0] || null };
}
