import path from 'node:path';
import fs from 'node:fs/promises';
import type { ContentPlanItem } from '@las-flores/shared';
import { atomicWriteYaml } from './StoryBuilderFileWriter.js';
import { resolveFilePath } from './ContentSkeletonGenerator.js';

const UNIVERSAL_NEGATIVES =
  '--no androids, no robots, no cybernetic humans, no extreme violence, no blood, no gore, no dismemberment, no guns, no modern day, no 2020s, no utopian, no pristine environments, no clean cityscapes, no oversaturated colors, no cartoonish, no anime, no comic book style, no fantasy elements, no magic, no supernatural';

const DIMENSIONS_BY_TYPE: Record<string, string> = {
  portrait: '832x1248',
  biometric: '832x1248',
  background: '1392x752',
  image: '1392x752',
  tile: '1024x1024',
  overlay: '1024x1024',
};

export interface PromptGenerationOptions {
  overwrite?: boolean;
}

/**
 * Generate .prompt.md files for items with asset needs.
 * These files are read by the asset generation pipeline.
 * Writes to per-entity folders: content/<type>s/<slug>/<slug>.prompt.md
 *
 * Format follows the convention parsed by assets.helpers.ts:
 * - **Type:** <value> for asset type extraction
 * - **Dimensions:** WxH for resolution
 * - ## Prompt — <VariantName> for variant extraction
 */
export async function generatePromptFiles(items: ContentPlanItem[], contentDir: string, fileSnapshots?: Map<string, string | null>, options: PromptGenerationOptions = {}): Promise<string[]> {
  const createdFiles: string[] = [];

  for (const item of items) {
    // Check if item has asset needs or asset_paths
    const hasAssets = item.assetNeeds.length > 0 || 
      (item.fields.asset_paths && typeof item.fields.asset_paths === 'object' && Object.keys(item.fields.asset_paths).length > 0);
    if (!hasAssets) continue;

    // Per-folder layout: prompt files are in the same directory as the YAML
    const yamlDir = path.dirname(resolveFilePath(item));
    const filePath = path.join(contentDir, yamlDir, `${item.slug}.prompt.md`);

    // Path safety check
    if (!filePath.startsWith(contentDir + path.sep)) {
      console.warn(`[prompt-generator] Skipping unsafe path: ${filePath}`);
      continue;
    }

    // Skip if file already exists and we're not overwriting
    if (!options.overwrite) {
      try {
        await fs.access(filePath);
        continue;
      } catch {
        // File doesn't exist, create it
      }
    } else {
      // When overwriting, check if file exists and contains only TODO placeholder
      try {
        const existingContent = await fs.readFile(filePath, 'utf-8');
        // Only overwrite if it's a TODO placeholder (preserves actual user edits)
        if (existingContent.trim() && !existingContent.includes('TODO')) {
          continue; // File has real content, don't overwrite user edits
        }
      } catch {
        // File doesn't exist, we'll create it
      }
    }

    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const content = buildPromptFile(item);
    await atomicWriteYaml(filePath, content);
    if (fileSnapshots) {
      fileSnapshots.set(filePath, null);
    }

    createdFiles.push(`${yamlDir}/${item.slug}.prompt.md`);
  }

  return createdFiles;
}

/**
 * Generate prompt file for a single item.
 * Used by PlanGenerationJob to generate prompts after filling fields.
 */
export async function generatePromptForItem(
  item: ContentPlanItem,
  contentDir: string,
  overwrite?: boolean,
): Promise<{ createdFile: string | null; error: string | null }> {
  // Check if item has asset needs or asset_paths
  const hasAssets = item.assetNeeds.length > 0 || 
    (item.fields.asset_paths && typeof item.fields.asset_paths === 'object' && Object.keys(item.fields.asset_paths).length > 0);
  if (!hasAssets) {
    return { createdFile: null, error: null };
  }

  // Per-folder layout: prompt files are in the same directory as the YAML
  const yamlDir = path.dirname(resolveFilePath(item));
  const filePath = path.join(contentDir, yamlDir, `${item.slug}.prompt.md`);

  // Path safety check
  if (!filePath.startsWith(contentDir + path.sep)) {
    console.warn(`[prompt-generator] Skipping unsafe path: ${filePath}`);
    return { createdFile: null, error: null };
  }

  // Skip if file already exists and we're not overwriting
  if (!overwrite) {
    try {
      await fs.access(filePath);
      return { createdFile: null, error: null };
    } catch {
      // File doesn't exist, create it
    }
  } else {
    // When overwriting, check if file exists and contains only TODO placeholder
    try {
      const existingContent = await fs.readFile(filePath, 'utf-8');
      // Only overwrite if it's a TODO placeholder (preserves actual user edits)
      if (existingContent.trim() && !existingContent.includes('TODO')) {
        return { createdFile: null, error: null }; // File has real content, don't overwrite user edits
      }
    } catch {
      // File doesn't exist, we'll create it
    }
  }

  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const content = buildPromptFile(item);
    await atomicWriteYaml(filePath, content);
    return { createdFile: `${yamlDir}/${item.slug}.prompt.md`, error: null };
  } catch (err: any) {
    return { createdFile: null, error: `Prompt for ${item.name}: ${err.message}` };
  }
}

function buildPromptFile(item: ContentPlanItem): string {
  const name = item.name || 'Untitled';
  const description = item.fields.description || '';
  const personality = item.fields.metadata?.personality || '';
  const faction = item.fields.metadata?.faction || '';
  const district = item.fields.district || '';

  // Infer primary type from assetNeeds or asset_paths
  let primaryType = 'background';

  if (item.assetNeeds.length > 0) {
    primaryType = item.assetNeeds[0]?.promptType || 'background';
  } else if (item.fields.asset_paths && typeof item.fields.asset_paths === 'object') {
    const paths = Object.keys(item.fields.asset_paths);
    if (paths.length > 0) {
      // Infer type from the first asset path key
      primaryType = paths[0].replace(/__.*$/, ''); // Remove suffixes like __default
    }
  }

  const dimensions = DIMENSIONS_BY_TYPE[primaryType] || '1024x1024';

  const contextParts = [description, personality, faction, district].filter(Boolean).join('. ');
  const defaultDescription = contextParts || `${name} in Las Flores 2077, cyberpunk aesthetic, neon-lit urban environment`;

  return `# Prompt: ${name}

[CONSUMER: ${primaryType}]
**Type:** ${primaryType}
**Dimensions:** ${dimensions}

## Prompt — Base
${defaultDescription}

${name} in Las Flores 2077. Cyberpunk aesthetic, neon-lit urban environment.

## Negative Prompt
${UNIVERSAL_NEGATIVES}
`;
}
