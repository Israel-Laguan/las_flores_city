import path from 'node:path';
import fs from 'node:fs/promises';
import type { ContentPlanItem } from '@las-flores/shared';

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

/**
 * Generate .prompt.md files for items with asset needs.
 * These files are read by the asset generation pipeline.
 *
 * Format follows the convention parsed by assets.helpers.ts:
 * - **Type:** <value> for asset type extraction
 * - **Dimensions:** WxH for resolution
 * - ## Prompt — <VariantName> for variant extraction
 */
export async function generatePromptFiles(items: ContentPlanItem[], contentDir: string): Promise<string[]> {
  const createdFiles: string[] = [];
  const promptsRoot = path.resolve(contentDir, '..', 'docs', 'lore', 'assets', 'prompts');

  for (const item of items) {
    if (item.assetNeeds.length === 0) continue;

    const typeDir = path.join(promptsRoot, item.type);
    const filePath = path.join(typeDir, `${item.slug}.prompt.md`);

    try {
      await fs.access(filePath);
      continue;
    } catch {
      // File doesn't exist, create it
    }

    await fs.mkdir(typeDir, { recursive: true });

    const content = buildPromptFile(item);
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    try {
      await fs.writeFile(tmpPath, content, 'utf-8');
      await fs.rename(tmpPath, filePath);
    } catch (error) {
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
      throw error;
    }

    createdFiles.push(path.relative(promptsRoot, filePath));
  }

  return createdFiles;
}

function buildPromptFile(item: ContentPlanItem): string {
  const name = item.name || 'Untitled';
  const description = item.fields.description || '';
  const personality = item.fields.metadata?.personality || '';
  const faction = item.fields.metadata?.faction || '';
  const district = item.fields.district || '';

  const primaryType = item.assetNeeds[0]?.promptType || 'background';
  const dimensions = DIMENSIONS_BY_TYPE[primaryType] || '1024x1024';
  const assetTypes = item.assetNeeds.map(n => n.promptType).join(', ');

  const contextParts = [description, personality, faction, district].filter(Boolean).join('. ');

  return `# Prompt: ${name}

[CONSUMER: ${primaryType}]
**Type:** ${primaryType}
**Dimensions:** ${dimensions}

## Prompt — Base
${contextParts || `TODO: Describe ${name} for ${assetTypes} generation.`}

${name} in Las Flores 2077. Cyberpunk aesthetic, neon-lit urban environment.

## Negative Prompt
${UNIVERSAL_NEGATIVES}
`;
}
