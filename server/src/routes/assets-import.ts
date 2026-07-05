import express from 'express';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { uploadToMinio, deleteFromMinio } from '../services/StorageService.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getPromptRoot, parsePromptFile, resolvePromptFile } from './assets.helpers.js';
import { adminMiddleware } from '../middleware/adminAuth.js';
import { sanitizePromptRel, sanitizeFilePath } from '../utils/sanitize.js';

const DRAFTS_DIR = 'drafts';

export const assetsImportRouter = express.Router();

assetsImportRouter.use(adminMiddleware);

function getVariantNameFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  const parts = base.split('__');
  if (parts.length === 2) {
    return parts[1];
  }
  return base;
}

function isBaseVariant(filename: string): boolean {
  return getVariantNameFromFilename(filename) === 'base';
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveAllowedImportFile(promptRel: string, filePath: string): string | null {
  const promptFile = resolvePromptFile(promptRel);
  const promptDir = path.dirname(promptFile);
  const baseName = path.basename(promptFile, '.md');
  const allowedRoots = [
    path.join(promptDir, baseName, DRAFTS_DIR),
    path.join(promptDir, DRAFTS_DIR),
  ].map((dir) => path.resolve(dir));
  const resolvedFilePath = path.resolve(filePath);

  return allowedRoots.some((root) => isPathInside(resolvedFilePath, root)) ? resolvedFilePath : null;
}

interface DraftsFolderRef {
  draftsFolder: string;
  promptRel: string;
}

interface ImportResult {
  imported: { bases: number; variants: number };
  errors: Array<{ file: string; error: string }>;
  details: Array<{
    prompt_rel: string;
    action: 'base' | 'variant';
    filename: string;
    success: boolean;
    id?: string;
    error?: string;
  }>;
}

async function collectDraftsFolders(promptRel: string | null): Promise<DraftsFolderRef[]> {
  const draftsFolders: DraftsFolderRef[] = [];
  const searchDir = promptRel
    ? path.dirname(resolvePromptFile(promptRel))
    : getPromptRoot();

  let files: string[];
  try {
    files = await fs.promises.readdir(searchDir);
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }

  for (const file of files) {
    if (file.endsWith('.prompt.md')) {
      const promptPath = path.join(searchDir, file);
      const foundPromptRel = path
        .relative(getPromptRoot(), promptPath)
        .replace(/\.prompt\.md$/, '');
      if (!foundPromptRel) continue;
      const sanitizedPromptRel = sanitizePromptRel(foundPromptRel);
      if (!sanitizedPromptRel) {
        console.log(`[import-drafts] Skipping invalid prompt_rel: ${foundPromptRel}`);
        continue;
      }
      const draftsFolder = path.join(searchDir, DRAFTS_DIR);
      console.log(`[import-drafts] Looking for drafts: ${draftsFolder}`);
      try {
        await fs.promises.access(draftsFolder);
        console.log(`[import-drafts] Found drafts folder: ${draftsFolder}`);
        draftsFolders.push({ draftsFolder, promptRel: sanitizedPromptRel });
      } catch {
        const oldDraftsFolder = path.join(path.dirname(resolvePromptFile(sanitizedPromptRel)), DRAFTS_DIR);
        console.log(`[import-drafts] Trying fallback: ${oldDraftsFolder}`);
        try {
          await fs.promises.access(oldDraftsFolder);
          console.log(`[import-drafts] Found fallback drafts folder: ${oldDraftsFolder}`);
          draftsFolders.push({ draftsFolder: oldDraftsFolder, promptRel: sanitizedPromptRel });
        } catch {
          console.log(`[import-drafts] No drafts folders found for ${sanitizedPromptRel}`);
        }
      }
    }
  }

  return draftsFolders;
}

async function importDrafts(draftsFolders: DraftsFolderRef[]): Promise<ImportResult> {
  const results: ImportResult = {
    imported: { bases: 0, variants: 0 },
    errors: [],
    details: []
  };

  for (const { draftsFolder, promptRel: prompt_rel } of draftsFolders) {
    const sanitizedPromptRel = sanitizePromptRel(prompt_rel);
    if (!sanitizedPromptRel) {
      console.log(`[import-drafts] Skipping invalid prompt_rel: ${prompt_rel}`);
      continue;
    }

    const files = await fs.promises.readdir(draftsFolder);
    const imageFiles = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    if (imageFiles.length === 0) continue;

    const promptFilePath = resolvePromptFile(sanitizedPromptRel);
    const metadata = await parsePromptFile(promptFilePath);

    await processImageFiles(draftsFolder, sanitizedPromptRel, imageFiles, metadata, results);
  }

  return results;
}

async function processImageFiles(
  draftsFolder: string,
  sanitizedPromptRel: string,
  imageFiles: string[],
  metadata: Awaited<ReturnType<typeof parsePromptFile>>,
  results: ImportResult
): Promise<void> {
  for (const file of imageFiles) {
    try {
      const filePath = path.join(draftsFolder, file);
      const fileHash = crypto.createHash('md5').update(`${sanitizedPromptRel}_${file}`).digest('hex');
      const proposal_index = Math.abs(parseInt(fileHash.slice(0, 8), 16)) % 10000;

      const existing = await queryOLTP(
        `SELECT id FROM asset_bases WHERE prompt_rel = $1 AND proposal_index = $2`,
        [sanitizedPromptRel, proposal_index]
      );

      if (existing.rows.length > 0) {
        console.log(`  ⊘ Skipping duplicate: ${file} (proposal_index=${proposal_index})`);
        results.details.push({
          prompt_rel: sanitizedPromptRel,
          action: 'base',
          filename: file,
          success: true,
          id: existing.rows[0].id,
          error: 'Already exists, skipped'
        });
        continue;
      }

      const destKey = `drafts/bases/${sanitizedPromptRel.replace(/\//g, '_')}_${proposal_index}.png`;
      const imageBuffer = await fs.promises.readFile(filePath);
      const contentType = file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
      const image_path = await uploadToMinio(imageBuffer, destKey, contentType);

      const seed = Math.floor(Math.random() * 2147483647);
      const variantName = getVariantNameFromFilename(file);
      const isBaseFile = isBaseVariant(file);
      const variantMeta = metadata?.variants.find(v =>
        v.name.toLowerCase().includes(variantName.toLowerCase())
      );

      const result = await queryOLTP(
        `INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, seed, asset_type, prompt_text, negative_prompt, width, height, chosen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, prompt_rel, proposal_index, image_path`,
        [
          sanitizedPromptRel,
          proposal_index,
          image_path,
          seed,
          metadata?.asset_type || 'unknown',
          variantMeta?.prompt || metadata?.variants[0]?.prompt || '',
          variantMeta?.negativePrompt || metadata?.variants[0]?.negativePrompt || '',
          metadata?.width || 1024,
          metadata?.height || 1024,
          isBaseFile
        ]
      );

      results.imported.bases++;
      results.details.push({
        prompt_rel: sanitizedPromptRel,
        action: 'base',
        filename: file,
        success: true,
        id: result.rows[0].id
      });

      console.log(`  ✓ Imported: ${file}`);
    } catch (err: any) {
      console.error(`  ✗ Failed: ${file}: ${err.message}`);
      results.errors.push({ file, error: err.message });
      results.details.push({
        prompt_rel: sanitizedPromptRel,
        action: 'base',
        filename: file,
        success: false,
        error: err.message
      });
    }
  }
}

assetsImportRouter.get('/import-drafts', async (req, res, next) => {
  try {
    const { prompt_rel, all } = req.query;

    const sanitizedPromptRel = sanitizePromptRel(prompt_rel as string);
    if (!sanitizedPromptRel && all !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Must specify prompt_rel or all=true',
        timestamp: new Date().toISOString()
      });
    }

    const draftsFolders = await collectDraftsFolders(sanitizedPromptRel);
    if (draftsFolders.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No drafts folders found. PROMPT_ROOT=${getPromptRoot()}`,
        timestamp: new Date().toISOString()
      });
    }

    const results = await importDrafts(draftsFolders);
    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

assetsImportRouter.post('/import-base', async (req, res, next) => {
  try {
    const { prompt_rel, file_path, asset_type, width, height } = req.body;

    const sanitizedPromptRel = sanitizePromptRel(prompt_rel);
    const sanitizedFilePath = sanitizeFilePath(file_path);

    if (!sanitizedPromptRel || !sanitizedFilePath) {
      return res.status(400).json({
        success: false,
        error: 'Invalid prompt_rel or file_path',
        timestamp: new Date().toISOString()
      });
    }

    if (!prompt_rel || !file_path) {
      return res.status(400).json({
        success: false,
        error: 'prompt_rel and file_path are required',
        timestamp: new Date().toISOString()
      });
    }

    const resolvedFilePath = resolveAllowedImportFile(sanitizedPromptRel, sanitizedFilePath);
    if (!resolvedFilePath) {
      return res.status(400).json({
        success: false,
        error: 'file_path must be inside the drafts directory for prompt_rel',
        timestamp: new Date().toISOString()
      });
    }

    try {
      await fs.promises.access(resolvedFilePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: `File not found: ${file_path}`,
        timestamp: new Date().toISOString()
      });
    }

    const proposal_index = 0;
    const existing = await queryOLTP(
      `SELECT id FROM asset_bases WHERE prompt_rel = $1 AND proposal_index = $2`,
      [sanitizedPromptRel, proposal_index]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Imported base already exists for this prompt',
        timestamp: new Date().toISOString()
      });
    }

    const destKey = `drafts/bases/${sanitizedPromptRel.replace(/\//g, '_')}_${proposal_index}.png`;

    const imageBuffer = await fs.promises.readFile(resolvedFilePath);
    const contentType = resolvedFilePath.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    const image_path = await uploadToMinio(imageBuffer, destKey, contentType);

    const seed = Math.floor(Math.random() * 2147483647);
    const result = await queryOLTP(
      `INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, seed, asset_type, width, height, chosen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, prompt_rel, proposal_index, image_path`,
      [sanitizedPromptRel, proposal_index, image_path, seed, asset_type || 'unknown', width || 1024, height || 1024, false]
    );

    res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    next(error);
  }
});

assetsImportRouter.delete('/imported-drafts', async (req, res, next) => {
  try {
    const { prompt_rel, all } = req.query;

    let sanitizedPromptRel: string | null = null;
    if (prompt_rel) {
      sanitizedPromptRel = sanitizePromptRel(prompt_rel as string);
      if (!sanitizedPromptRel) {
        return res.status(400).json({
          success: false,
          error: 'Invalid prompt_rel path',
          timestamp: new Date().toISOString()
        });
      }
    }

    if (!sanitizedPromptRel && all !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Must specify prompt_rel or all=true',
        timestamp: new Date().toISOString()
      });
    }

    let deleted = { bases: 0, variants: 0 };
    const baseImagePaths: string[] = [];
    const variantImagePaths: string[] = [];

    if (all === 'true') {
      const basesRes = await queryOLTP(
        `SELECT id, image_path FROM asset_bases WHERE image_path LIKE 's3://%/drafts/%'`
      );

      const allVariantsRes = await queryOLTP(
        `SELECT id, image_path FROM asset_variants WHERE base_id IN (SELECT id FROM asset_bases WHERE image_path LIKE 's3://%/drafts/%')`
      );

      await withOLTPTransaction(async (client) => {
        await client.query(`DELETE FROM asset_variants WHERE base_id IN (SELECT id FROM asset_bases WHERE image_path LIKE 's3://%/drafts/%')`);
        await client.query(`DELETE FROM asset_bases WHERE image_path LIKE 's3://%/drafts/%'`);
      });

      baseImagePaths.push(...basesRes.rows.map(row => row.image_path));
      variantImagePaths.push(...allVariantsRes.rows.map(row => row.image_path));

      deleted.bases = basesRes.rows.length;
      deleted.variants = allVariantsRes.rows.length;
    } else {
      const basesRes = await queryOLTP(
        `SELECT id, image_path FROM asset_bases WHERE prompt_rel = $1 AND image_path LIKE 's3://%/drafts/%'`,
        [sanitizedPromptRel]
      );

      const variantIdsRes = await queryOLTP(
        `SELECT id, image_path FROM asset_variants WHERE base_id IN (SELECT id FROM asset_bases WHERE prompt_rel = $1 AND image_path LIKE 's3://%/drafts/%')`,
        [sanitizedPromptRel]
      );

      await withOLTPTransaction(async (client) => {
        await client.query(`DELETE FROM asset_variants WHERE base_id IN (SELECT id FROM asset_bases WHERE prompt_rel = $1 AND image_path LIKE 's3://%/drafts/%')`, [sanitizedPromptRel]);
        await client.query(`DELETE FROM asset_bases WHERE prompt_rel = $1 AND image_path LIKE 's3://%/drafts/%'`, [sanitizedPromptRel]);
      });

      baseImagePaths.push(...basesRes.rows.map(row => row.image_path));
      variantImagePaths.push(...variantIdsRes.rows.map(row => row.image_path));

      deleted.bases = basesRes.rows.length;
      deleted.variants = variantIdsRes.rows.length;
    }

    for (const imagePath of baseImagePaths) {
      await deleteFromMinio(imagePath).catch(() => {});
    }
    for (const imagePath of variantImagePaths) {
      await deleteFromMinio(imagePath).catch(() => {});
    }

    res.json({
      success: true,
      data: deleted,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});