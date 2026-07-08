import fs from 'node:fs/promises';
import path from 'node:path';
import { signMinioUrl, uploadToMinio } from '../services/StorageService.js';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { PromptCatalogResponseSchema } from '@las-flores/shared';
import { z } from 'zod';

export function getPromptRoot(): string {
  return process.env.PROMPT_ROOT
    ? path.resolve(process.env.PROMPT_ROOT)
    : path.resolve(process.cwd(), 'docs/lore/assets/ui-concepts');
}

/** @deprecated Use getPromptRoot() — this value is frozen at module load time */
export const PROMPT_ROOT = getPromptRoot();

export function resolvePromptFile(prompt_rel: string): string {
  return path.join(getPromptRoot(), `${prompt_rel}.prompt.md`);
}

/**
 * Returns all three prompt root directories:
 * 1. The existing ui-concepts root (respecting PROMPT_ROOT env var)
 * 2. docs/lore/figures — character portrait prompts
 * 3. docs/lore/districts/*\/landmarks — location background prompts
 */
export function getPromptRoots(): string[] {
  const cwd = process.cwd();
  const districtsDir = path.resolve(cwd, 'docs/lore/districts');
  const landmarkDirs: string[] = [];
  try {
    const districtNames = require('node:fs').readdirSync(districtsDir);
    for (const d of districtNames) {
      const landmarksPath = path.join(districtsDir, d, 'landmarks');
      try {
        if (require('node:fs').statSync(landmarksPath).isDirectory()) {
          landmarkDirs.push(landmarksPath);
        }
      } catch { /* skip non-dir entries */ }
    }
  } catch { /* districts dir may not exist */ }
  return [
    getPromptRoot(),
    path.resolve(cwd, 'docs/lore/figures'),
    ...landmarkDirs,
    path.resolve(cwd, 'docs/lore/shared/assets'),
  ];
}

export const DEFAULT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  tile: { width: 1024, height: 1024 },
  overlay: { width: 1024, height: 1024 },
  background: { width: 1392, height: 752 },
  'html-background': { width: 1248, height: 832 },
  portrait: { width: 832, height: 1248 },
  'phone-wallpaper': { width: 752, height: 1392 },
  'app-icon': { width: 1024, height: 1024 },
  thematic: { width: 1280, height: 720 },
};

export const SUPPORTED_RESOLUTIONS = [
  { width: 672, height: 1568 }, { width: 688, height: 1504 },
  { width: 720, height: 1456 }, { width: 752, height: 1392 },
  { width: 800, height: 1328 }, { width: 832, height: 1248 },
  { width: 880, height: 1184 }, { width: 944, height: 1104 },
  { width: 1024, height: 1024 }, { width: 1104, height: 944 },
  { width: 1184, height: 880 }, { width: 1248, height: 832 },
  { width: 1328, height: 800 }, { width: 1392, height: 752 },
  { width: 1456, height: 720 }, { width: 1504, height: 688 }, { width: 1568, height: 672 },
];

export function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function pickSupportedResolution(width: number, height: number) {
  if (!width || !height) return { width: 1024, height: 1024 };
  const inputRatio = width / height;
  let best = SUPPORTED_RESOLUTIONS[0];
  let bestDiff = Math.abs(inputRatio - best.width / best.height);
  for (const r of SUPPORTED_RESOLUTIONS) {
    const diff = Math.abs(inputRatio - r.width / r.height);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

export interface PromptVariant {
  name: string;
  prompt: string;
  negativePrompt: string;
}

export interface ParsedPromptFile {
  prompt_rel: string;
  name: string;
  category: string;
  asset_type: string;
  width: number;
  height: number;
  prompt_file: string;
  variants: PromptVariant[];
}

/**
 * Pure helper: extracts the asset_type from prompt file markdown content.
 *
 * Looks for a line containing `**Type:** <value>` and returns the value.
 * Returns `'unknown'` if the field is absent.
 *
 * This function is intentionally root-agnostic — it reads only from the
 * content string, not from any filesystem path, so the result is the same
 * regardless of which root directory the file originated from.
 */
export function extractAssetType(content: string): string {
  const typeMatch = content.match(/\*\*Type:\*\* (\S+)/);
  return typeMatch ? typeMatch[1].trim() : 'unknown';
}

export async function parsePromptFile(filePath: string): Promise<ParsedPromptFile | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    // Determine which root this file belongs to by finding the first matching prefix
    const roots = getPromptRoots();
    const matchedRoot = roots.find(r => filePath.startsWith(r + path.sep) || filePath === r);
    const relFromRoot = path.relative(matchedRoot ?? getPromptRoot(), filePath);
    const prompt_rel = relFromRoot.replace(/\.prompt\.md$/, '');
    const baseName = path.basename(filePath, '.prompt.md');

    const asset_type = extractAssetType(content);

    const dimMatch = content.match(/\*\*Dimensions:\*\* (\d+)\s*[x×]\s*(\d+)/i);
    let width = 1024;
    let height = 1024;
    if (dimMatch) {
      width = parseInt(dimMatch[1], 10);
      height = parseInt(dimMatch[2], 10);
    } else {
      const def = DEFAULT_DIMENSIONS[asset_type];
      if (def) {
        width = def.width;
        height = def.height;
      }
    }
    const resolved = pickSupportedResolution(width, height);
    width = resolved.width;
    height = resolved.height;

    const category = (() => {
      const dir = path.dirname(relFromRoot);
      if (dir === '.' && matchedRoot) {
        // File is at the root of the prompt directory — use the root basename
        return path.basename(matchedRoot);
      }
      return dir.split(path.sep)[0] || 'uncategorized';
    })();

    const promptRegex = /## Prompt — ([^\n]+)\n([\s\S]*?)(?=## Prompt — |## Negative Prompt\n|$)/g;
    const variants: PromptVariant[] = [];
    let match;

    while ((match = promptRegex.exec(content)) !== null) {
      const variantName = match[1].trim();
      const promptText = match[2].trim();
      const negMatch = content.slice(match.index + match[0].length).match(/## Negative Prompt\n([\s\S]*?)(?=## Prompt — |$)/);
      const negativeText = negMatch ? negMatch[1].trim() : '';

      if (promptText) {
        variants.push({ name: variantName, prompt: promptText, negativePrompt: negativeText });
      }
    }

    return {
      prompt_rel,
      name: baseName,
      category,
      asset_type,
      width,
      height,
      prompt_file: filePath,
      variants,
    };
  } catch (err) {
    console.error(`Failed to parse prompt file ${filePath}:`, err);
    return null;
  }
}

export async function getPromptCatalog(): Promise<z.infer<typeof PromptCatalogResponseSchema>> {
  return buildPromptCatalogFromRoots(getPromptRoots());
}

/**
 * Testable catalog builder — accepts an explicit list of roots instead of
 * reading from `getPromptRoots()`. Each root that does not exist on the
 * filesystem is silently skipped. Results from all roots are merged into
 * a single catalog.
 *
 * This function is the core implementation; `getPromptCatalog()` delegates
 * to it with the standard roots from `getPromptRoots()`.
 */
export async function buildPromptCatalogFromRoots(
  roots: string[],
): Promise<z.infer<typeof PromptCatalogResponseSchema>> {
  const entries = new Map<string, ParsedPromptFile[]>();

  async function walk(dir: string) {
    const entries_fs = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries_fs) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.prompt.md')) {
        const parsed = await parsePromptFile(full);
        if (parsed) {
          const cat = parsed.category;
          if (!entries.has(cat)) entries.set(cat, []);
          entries.get(cat)!.push(parsed);
        }
      }
    }
  }

  for (const root of roots) {
    try {
      await fs.access(root);
    } catch {
      // Root does not exist — skip without error
      continue;
    }
    await walk(root);
  }

  const categoryLabels: Record<string, string> = {
    'isometric-map': '🗺️ Isometric Map',
    'vn-interface': '🎭 VN Interface',
    'phone-terminal': '📱 Phone & Terminal',
    figures: '🎭 Character Portraits',
    landmarks: '🏙️ Location Backgrounds',
  };

  const categoryIcons: Record<string, string> = {
    'isometric-map': '🗺️',
    'vn-interface': '🎭',
    'phone-terminal': '📱',
    figures: '🎭',
    landmarks: '🏙️',
  };

  const categories = Array.from(entries.entries()).map(([id, catEntries]) => ({
    id,
    label: categoryLabels[id] || id,
    icon: categoryIcons[id],
    entries: catEntries.map((e) => ({
      prompt_rel: e.prompt_rel,
      name: e.name,
      category: e.category,
      asset_type: e.asset_type,
      dimensions: { width: e.width, height: e.height },
      prompt_file: e.prompt_file,
      variants: e.variants.map((v) => ({
        name: v.name,
        prompt: v.prompt,
        negative_prompt: v.negativePrompt || undefined,
      })),
    })),
  }));

  return PromptCatalogResponseSchema.parse({ categories });
}


export async function executePublishAsset(params: {
  base_id?: string;
  variant_id?: string;
  final_path?: string;
}): Promise<{ computedFinalPath: string; publicUrl: string }> {
  const { base_id, variant_id, final_path } = params;
  let sourceImagePath = '';
  let computedFinalPath = '';

  if (base_id) {
    const baseRes = await queryOLTP(`SELECT image_path, prompt_rel, asset_type FROM asset_bases WHERE id = $1`, [base_id]);
    if (baseRes.rows.length === 0) {
      throw new Error('Base not found');
    }
    const base = baseRes.rows[0];
    sourceImagePath = base.image_path;

    if (!final_path) {
      const assetType = base.asset_type || 'unknown';
      const name = path.basename(base.prompt_rel);
      const ext = assetType === 'background' || assetType === 'html-background' || assetType === 'phone-wallpaper' ? '.jpg' : '.png';
      computedFinalPath = `las-flores/${assetType}/${name}${ext}`;
    } else {
      computedFinalPath = final_path;
    }

    console.log(`[executePublishAsset] base_id: ${base_id}, sourceImagePath: ${sourceImagePath}, computedFinalPath: ${computedFinalPath}`);
    const signedUrl = await signMinioUrl(sourceImagePath, 300);
    console.log(`[executePublishAsset] signedUrl: ${signedUrl}`);
    const imageBuffer = await fetch(signedUrl).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b));

    const contentType = computedFinalPath.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    await uploadToMinio(imageBuffer, computedFinalPath, contentType);

    await withOLTPTransaction(async (client) => {
      await client.query(`UPDATE asset_bases SET final_path = $1 WHERE id = $2`, [computedFinalPath, base_id]);
    });
  } else if (variant_id) {
    const variantRes = await queryOLTP(`SELECT image_path, base_id FROM asset_variants WHERE id = $1`, [variant_id]);
    if (variantRes.rows.length === 0) {
      throw new Error('Variant not found');
    }
    const variant = variantRes.rows[0];
    sourceImagePath = variant.image_path;

    if (!final_path) {
      const baseRes = await queryOLTP(`SELECT prompt_rel, asset_type FROM asset_bases WHERE id = $1`, [variant.base_id]);
      const base = baseRes.rows[0];
      const assetType = base.asset_type || 'unknown';
      const name = path.basename(base.prompt_rel);
      const ext = assetType === 'background' || assetType === 'html-background' || assetType === 'phone-wallpaper' ? '.jpg' : '.png';
      computedFinalPath = `las-flores/${assetType}/${name}__${slugify(path.basename(variant_id))}${ext}`;
    } else {
      computedFinalPath = final_path;
    }

    console.log(`[executePublishAsset] variant_id: ${variant_id}, sourceImagePath: ${sourceImagePath}, computedFinalPath: ${computedFinalPath}`);
    const signedUrl = await signMinioUrl(sourceImagePath, 300);
    console.log(`[executePublishAsset] signedUrl: ${signedUrl}`);
    const imageBuffer = await fetch(signedUrl).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b));

    const contentType = computedFinalPath.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    await uploadToMinio(imageBuffer, computedFinalPath, contentType);

    await withOLTPTransaction(async (client) => {
      await client.query(`UPDATE asset_variants SET final_path = $1 WHERE id = $2`, [computedFinalPath, variant_id]);
    });
  }

  const publicUrl = `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}/${process.env.MINIO_BUCKET || 'las-flores'}/${computedFinalPath}`;

  return { computedFinalPath, publicUrl };
}
