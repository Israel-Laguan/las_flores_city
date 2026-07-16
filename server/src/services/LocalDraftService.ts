import path from 'node:path';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import type { ContentPlanItem, AssetNeed } from '@las-flores/shared';
import { generateImageBuffer } from './AssetGenerationService.js';
import { resolveFilePath } from './ContentSkeletonGenerator.js';
import { atomicWriteYaml } from './StoryBuilderFileWriter.js';
import { markChosen } from './AssetNeedsService.js';

/**
 * Valid asset extensions. The admin selector shows every file in `assets/`
 * that has one of these extensions, regardless of name. Files with any
 * other extension (e.g. `.txt`, `.json`, `.DS_Store`) are ignored.
 */
export const VALID_ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

export function isValidAssetFilename(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return VALID_ASSET_EXTENSIONS.includes(ext);
}

/**
 * Build a filename for a newly generated draft.
 * Convention: <slug>__<ISO-timestamp>.<ext>
 * The timestamp is in the format YYYY-MM-DDTHH-MM-SS (colons replaced with
 * dashes for filesystem safety, milliseconds stripped). This makes generated
 * files sortable by time, gives every output a unique name without a counter,
 * and is easy to filter (`ls assets/ | grep 2026-07`).
 *
 * NOTE: this convention is only used by the in-app generator. Files
 * placed in `assets/` by hand (via the OS file manager) can have any
 * name. The selector does not care.
 */
export function buildGeneratedAssetFilename(slug: string, ext: string = '.png'): string {
  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const rand = Math.random().toString(36).substring(2, 6);
  return `${slug}__${ts}_${rand}${ext}`;
}

/**
 * Resolve the entity root directory for a plan item.
 * e.g. a character with slug 'aisha_al_sayed' → 'content/characters/aisha_al_sayed'
 */
export function resolveEntityRootDir(item: ContentPlanItem, contentDir: string): string {
  const filePath = resolveFilePath(item);
  const yamlDir = path.dirname(filePath);
  return path.join(contentDir, yamlDir);
}

interface ParsedPrompt {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  assetType: string;
}

/**
 * Parse a .prompt.md file for generation parameters.
 * Self-contained (does not import StorageService or queryOLTP) so it is
 * unit-testable without DB/MinIO mocks.
 *
 * Extracts: **Type:**, **Dimensions:** WxH, first ## Prompt — variant,
 * and ## Negative Prompt section.
 */
export async function parsePromptFile(promptFilePath: string): Promise<ParsedPrompt> {
  const content = await fs.readFile(promptFilePath, 'utf-8');

  const typeMatch = content.match(/\*\*Type:\*\*\s*(\S+)/);
  const assetType = typeMatch ? typeMatch[1].trim() : 'portrait';

  const DEFAULT_DIMS: Record<string, { width: number; height: number }> = {
    portrait: { width: 832, height: 1248 },
    biometric: { width: 832, height: 1248 },
    background: { width: 1392, height: 752 },
    image: { width: 1392, height: 752 },
    tile: { width: 1024, height: 1024 },
    overlay: { width: 1024, height: 1024 },
  };
  let width = 1024;
  let height = 1024;
  const dimMatch = content.match(/\*\*Dimensions:\*\*\s*(\d+)\s*[x×]\s*(\d+)/i);
  if (dimMatch) {
    width = parseInt(dimMatch[1], 10);
    height = parseInt(dimMatch[2], 10);
  } else {
    const def = DEFAULT_DIMS[assetType];
    if (def) {
      width = def.width;
      height = def.height;
    }
  }

  const promptRegex = /## Prompt — [^\n]+\n([\s\S]*?)(?=## Prompt — |## Negative Prompt\n|$)/;
  const promptMatch = content.match(promptRegex);
  const prompt = promptMatch ? promptMatch[1].trim() : '';

  const negRegex = /## Negative Prompt\n([\s\S]*?)(?=## Prompt — |$)/;
  const negMatch = content.match(negRegex);
  const negativePrompt = negMatch ? negMatch[1].trim() : '';

  return { prompt, negativePrompt, width, height, assetType };
}

/**
 * Generate local draft images for a plan item.
 * Writes `count` PNGs FLAT into `<entityRootDir>/assets/` using the
 * `<slug>__<ISO-timestamp>.png` convention. No MinIO upload, no DB row.
 *
 * @returns array of written filenames (basenames only)
 */
export async function generateLocalDrafts(
  item: ContentPlanItem,
  entityRootDir: string,
  count: number = 3,
): Promise<string[]> {
  const assetsDir = path.join(entityRootDir, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });

  const promptFile = path.join(entityRootDir, `${item.slug}.prompt.md`);
  const { prompt, negativePrompt, width, height, assetType } = await parsePromptFile(promptFile);

  const written: string[] = [];
  for (let i = 0; i < count; i++) {
    const buf = await generateImageBuffer({
      prompt,
      negativePrompt,
      width,
      height,
      assetType,
      seed: Math.floor(Math.random() * 2147483647),
    });
    const filename = buildGeneratedAssetFilename(item.slug, '.png');
    const fullPath = path.join(assetsDir, filename);
    await fs.writeFile(fullPath, buf);
    written.push(filename);
  }
  return written;
}


export interface LocalAssetEntry {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  mtime: Date;
}

/**
 * List every valid asset file in the per-entity assets/ folder.
 * Used by the admin selector and by the validator.
 *
 * Sort order: pre-existing `<slug>__default.png` first, then by mtime
 * (newest first). This ensures the default is pre-selected on intake.
 * Returns [] if the assets/ folder does not exist (ENOENT).
 */
export async function listLocalAssets(entityRootDir: string): Promise<LocalAssetEntry[]> {
  const assetsDir = path.join(entityRootDir, 'assets');
  try {
    const entries = await fs.readdir(assetsDir, { withFileTypes: true });
    const out: LocalAssetEntry[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!isValidAssetFilename(entry.name)) continue;
      const fullPath = path.join(assetsDir, entry.name);
      const stat = await fs.stat(fullPath);
      out.push({ filename: entry.name, fullPath, sizeBytes: stat.size, mtime: stat.mtime });
    }
    out.sort((a, b) => {
      const aDefault = a.filename.endsWith('__default.png');
      const bDefault = b.filename.endsWith('__default.png');
      if (aDefault && bDefault) return 0;
      if (aDefault) return -1;
      if (bDefault) return 1;
      return b.mtime.getTime() - a.mtime.getTime();
    });
    return out;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Choose a draft as the canonical selection for an asset need.
 * Validates that the file exists, then writes the selection into the
 * entity YAML's asset_paths.<field>. No file is copied or renamed.
 *
 * @throws if the draft file does not exist
 */
export async function chooseDraft(
  item: ContentPlanItem,
  entityRootDir: string,
  draftFilename: string,
  contentDir: string,
): Promise<void> {
  const assetsDir = path.join(entityRootDir, 'assets');
  const source = path.join(assetsDir, draftFilename);
  await fs.access(source);
  await writeAssetPathsToYaml(item, entityRootDir, contentDir);
}

/**
 * Write the current item.fields.asset_paths values into the entity YAML.
 * Preserves all existing YAML fields; only updates the asset_paths sub-object.
 */
export async function writeAssetPathsToYaml(
  item: ContentPlanItem,
  _entityRootDir: string,
  contentDir: string,
): Promise<void> {
  const filePath = resolveFilePath(item);
  const fullPath = path.join(contentDir, filePath);

  let existing: Record<string, any> = {};
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const parsed = yaml.load(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existing = parsed as Record<string, any>;
    }
  } catch {
    // File may not exist yet (proposed state); start empty
  }

  const assetPathsFromFields = (item.fields as any)?.asset_paths;
  if (assetPathsFromFields && typeof assetPathsFromFields === 'object') {
    existing.asset_paths = { ...(existing.asset_paths || {}), ...assetPathsFromFields };
  }

  const updatedYaml = yaml.dump(existing, { lineWidth: -1, noRefs: true });
  await atomicWriteYaml(fullPath, updatedYaml);
}

/**
 * Find the AssetNeed for a given promptType within an item's assetNeeds.
 */
export function findNeedByPromptType(
  item: ContentPlanItem,
  promptType: string,
): AssetNeed | undefined {
  return item.assetNeeds.find(n => n.promptType === promptType);
}

/**
 * Resolve the target field name (e.g. 'portrait') from an AssetNeed's
 * targetField (e.g. 'asset_paths.portrait').
 */
export function getAssetFieldName(need: AssetNeed): string {
  const parts = need.targetField.split('.');
  return parts[parts.length - 1];
}

/**
 * Auto-select the __default.png draft for items that have it as the first asset.
 * Writes asset paths to both in-memory plan and on-disk YAML.
 */
export async function autoSelectDefaultDrafts(
  plan: { items: ContentPlanItem[] },
  contentDir: string,
): Promise<boolean> {
  let anyChanged = false;
  for (const item of plan.items) {
    const entityRoot = resolveEntityRootDir(item, contentDir);
    const assets = await listLocalAssets(entityRoot);
    const slugDefault = `${item.slug}__default.png`;
    if (assets.length === 0 || assets[0].filename !== slugDefault) continue;

    let itemChanged = false;
    for (const need of item.assetNeeds) {
      if (need.status !== 'pending') continue;
      const fieldName = getAssetFieldName(need);
      if (!(item.fields as any).asset_paths) (item.fields as any).asset_paths = {};
      (item.fields as any).asset_paths[fieldName] = slugDefault;
      markChosen(need);
      itemChanged = true;
    }
    if (itemChanged) {
      await writeAssetPathsToYaml(item, entityRoot, contentDir);
      anyChanged = true;
    }
  }
  return anyChanged;
}
