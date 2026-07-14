import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { queryOLTP } from '../database/connection.js';
import { uploadToMinio } from '../services/StorageService.js';
import { getPromptRoot, parsePromptFile, resolvePromptFile } from './assets.helpers.js';
import { sanitizePromptRel } from '../utils/sanitize.js';
import { getVariantNameFromFilename, isBaseVariant } from './assets-import.helpers.js';
import type { DraftsFolderRef, ImportResult } from './assets-import.helpers.js';

const DRAFTS_DIR = 'drafts';

export async function collectDraftsFolders(promptRel: string | null): Promise<DraftsFolderRef[]> {
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

export async function importDrafts(draftsFolders: DraftsFolderRef[]): Promise<ImportResult> {
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
