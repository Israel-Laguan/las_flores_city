import path from 'node:path';
import fs from 'node:fs/promises';
import type { LLMProvider, ExistingContentContext } from './types/LLMTypes.js';
import { generateForItem } from './LoreGenerator.js';
import { generatePromptForItem } from './PromptFileGenerator.js';
import { ContentPlanItemSchema } from '@las-flores/shared';
import yaml from 'js-yaml';

/**
 * Result of scanning for TODO placeholders
 */
export interface PlaceholderScanResult {
  totalFiles: number;
  filesWithTodo: number;
  items: Array<{
    yamlPath: string;
    item: any;
    mdPath?: string;
    promptPath?: string;
  }>;
}

/**
 * Result of filling placeholders
 */
export interface PlaceholderFillResult {
  filled: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
}

async function scanEntityDir(
  result: PlaceholderScanResult,
  type: string,
  slug: string,
  yamlPath: string,
  mdPath: string,
  promptPath: string,
  relativeFilePath?: string,
) {
  try {
    await fs.access(yamlPath);
  } catch {
    return;
  }

  let hasTodo = false;
  try {
    const mdContent = await fs.readFile(mdPath, 'utf-8');
    if (mdContent.includes('TODO')) hasTodo = true;
  } catch {
    // File doesn't exist, that's fine
  }

  if (!hasTodo) {
    try {
      const promptContent = await fs.readFile(promptPath, 'utf-8');
      if (promptContent.includes('TODO')) hasTodo = true;
    } catch {
      // File doesn't exist, that's fine
    }
  }

  if (hasTodo) {
    result.filesWithTodo++;

    try {
      const yamlContent = await fs.readFile(yamlPath, 'utf-8');
      const itemData = yaml.load(yamlContent) as any;

      const item: any = {
        id: itemData.id || `temp-${type}-${slug}`,
        type: type as any,
        name: itemData.name || slug,
        slug: slug,
        action: 'create' as const,
        fields: itemData,
        assetNeeds: [],
      };
      if (relativeFilePath) {
        item.filePath = relativeFilePath;
      }

      result.items.push({
        yamlPath,
        item,
        mdPath: hasTodo && mdPath ? mdPath : undefined,
        promptPath: hasTodo && promptPath ? promptPath : undefined,
      });
    } catch (err) {
      console.warn(`[fill-placeholders] Failed to read YAML ${yamlPath}:`, err);
    }
  }

  result.totalFiles++;
}

async function scanDistrictLocations(
  result: PlaceholderScanResult,
  contentDir: string,
  type: string,
  prefix: string,
) {
  const districtsDir = path.join(contentDir, 'districts');
  try {
    const districtEntries = await fs.readdir(districtsDir, { withFileTypes: true });
    for (const district of districtEntries) {
      if (!district.isDirectory()) continue;
      const locDir = path.join(districtsDir, district.name, 'locations');
      try {
        const locEntries = await fs.readdir(locDir, { withFileTypes: true });
        for (const locEntry of locEntries) {
          if (!locEntry.isDirectory()) continue;
          const slug = locEntry.name;
          const yamlFile = `${prefix}${slug}.yaml`;
          const yamlPath = path.join(locDir, slug, yamlFile);
          const mdPath = path.join(locDir, slug, `${slug}.md`);
          const promptPath = path.join(locDir, slug, `${slug}.prompt.md`);
          const relativeFilePath = `districts/${district.name}/locations/${slug}/${yamlFile}`;
          await scanEntityDir(result, type, slug, yamlPath, mdPath, promptPath, relativeFilePath);
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }
  } catch {
    // Districts directory doesn't exist, skip
  }
}

/**
 * Scans the content directory for files with TODO placeholders
 * Returns items that need their .md and .prompt.md files filled
 */
export async function scanForTodoPlaceholders(contentDir: string): Promise<PlaceholderScanResult> {
  const result: PlaceholderScanResult = {
    totalFiles: 0,
    filesWithTodo: 0,
    items: [],
  };

  const dirMap: Record<string, string> = {
    characters: 'character',
    scenes: 'scene',
    locations: 'location',
    overlays: 'overlay',
    missions: 'mission',
    dialogues: 'dialogue',
    stories: 'story',
    story_beats: 'story_beat',
    shop: 'shop_item',
    maps: 'map_tile',
    gigs: 'gig',
    vault: 'vault',
  };

  const prefixMap: Record<string, string> = {
    character: 'char_',
    scene: 'scene_',
    location: 'location_',
    overlay: 'overlay_',
    mission: 'mission_',
    dialogue: 'dialogue_',
    story: '',
    story_beat: '',
    shop_item: '',
    map_tile: '',
    gig: '',
    vault: '',
  };

  for (const [dir, type] of Object.entries(dirMap)) {
    const typeDir = path.join(contentDir, dir);

    if (dir === 'locations') {
      await scanDistrictLocations(result, contentDir, type, prefixMap[type] || '');
      continue;
    }

    try {
      const entries = await fs.readdir(typeDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const slug = entry.name;
        const prefix = prefixMap[type] || '';
        const yamlPath = path.join(typeDir, slug, `${prefix}${slug}.yaml`);
        const mdPath = path.join(typeDir, slug, `${slug}.md`);
        const promptPath = path.join(typeDir, slug, `${slug}.prompt.md`);

        await scanEntityDir(result, type, slug, yamlPath, mdPath, promptPath);
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return result;
}

/**
 * Fills TODO placeholders in existing .md and .prompt.md files
 * Scans content directory, finds files with TODO, and fills them with LLM content
 */
export async function fillAllTodoPlaceholders(
  provider: LLMProvider,
  context: ExistingContentContext,
  contentDir: string,
): Promise<PlaceholderFillResult> {
  const result: PlaceholderFillResult = {
    filled: 0,
    skipped: 0,
    errors: [],
  };

  const scan = await scanForTodoPlaceholders(contentDir);
  console.log(`[fill-placeholders] Found ${scan.filesWithTodo} files with TODO placeholders out of ${scan.totalFiles} total`);

  const contentDirResolved = path.resolve(process.cwd(), contentDir);

  for (const { item, mdPath, promptPath } of scan.items) {
    const validItem = ContentPlanItemSchema.safeParse(item);
    if (!validItem.success) {
      console.warn(`[fill-placeholders] Invalid item structure for ${item.slug}:`, validItem.error);
      result.skipped++;
      continue;
    }

    try {
      if (mdPath) {
        const mdResult = await generateForItem(validItem.data, provider, context, true);
        if (mdResult.createdFile) {
          result.filled++;
        } else if (mdResult.error) {
          result.errors.push({ path: mdPath, error: mdResult.error });
        } else {
          result.skipped++;
        }
      }

      if (promptPath) {
        const promptResult = await generatePromptForItem(validItem.data, contentDirResolved, true);
        if (promptResult.createdFile) {
          result.filled++;
        } else if (promptResult.error) {
          result.errors.push({ path: promptPath, error: promptResult.error });
        } else {
          result.skipped++;
        }
      }
    } catch (err: any) {
      result.errors.push({
        path: mdPath || promptPath || item.slug,
        error: err.message
      });
    }
  }

  return result;
}
