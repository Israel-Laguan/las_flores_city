import express from 'express';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { uploadToMinio, deleteFromMinio } from '../services/StorageService.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getPromptRoot, parsePromptFile, resolvePromptFile, slugify } from './assets.helpers.js';

const DRAFTS_DIR = 'drafts';

export const assetsImportRouter = express.Router();

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

/**
 * Get prompt_rel from a drafts folder path
 * Drafts are in: PROMPT_ROOT/isometric-map/assets/lm_electra.prompt/drafts
 * We want: isometric-map/assets/lm_electra
 */
function getPromptRelFromDraftsFolder(draftsFolder: string): string {
  const parentFolder = path.dirname(draftsFolder);
  const relPath = path.relative(getPromptRoot(), parentFolder);
  return relPath.replace(/\.prompt$/, '');
}

/**
 * Import all drafts from filesystem to database and MinIO
 * GET /assets/import-drafts?prompt_rel=isometric-map/assets/tile_street
 * GET /assets/import-drafts?all=true (import all)
 */
assetsImportRouter.get('/import-drafts', async (req, res, next) => {
  try {
    const { prompt_rel, all } = req.query;
    
    if (!prompt_rel && !all) {
      return res.status(400).json({
        success: false,
        error: 'Must specify prompt_rel or all=true',
        timestamp: new Date().toISOString()
      });
    }
    
    const results = {
      imported: { bases: 0, variants: 0 },
      errors: [] as Array<{ file: string; error: string }>,
      details: [] as Array<{
        prompt_rel: string;
        action: 'base' | 'variant';
        filename: string;
        success: boolean;
        id?: string;
        error?: string;
      }>
    };
    
    const draftsFolders = [] as string[];
    
    if (all === 'true') {
      const walk = async (dir: string) => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === DRAFTS_DIR) {
              console.log(`[import-drafts] Found drafts folder: ${fullPath}`);
              draftsFolders.push(fullPath);
            } else {
              await walk(fullPath);
            }
          }
        }
      };
      console.log(`[import-drafts] Walking PROMPT_ROOT: ${getPromptRoot()}`);
      await walk(getPromptRoot());
      console.log(`[import-drafts] Found ${draftsFolders.length} drafts folders`);
    } else {
      const promptFile = resolvePromptFile(prompt_rel as string);
      const promptDir = path.dirname(promptFile);
      const baseName = path.basename(promptFile, '.md');
      const draftsFolder = path.join(promptDir, baseName, DRAFTS_DIR);
      console.log(`[import-drafts] Looking for drafts: ${draftsFolder}`);
      try {
        await fs.promises.access(draftsFolder);
        console.log(`[import-drafts] Found drafts folder: ${draftsFolder}`);
        draftsFolders.push(draftsFolder);
      } catch {
        const oldDraftsFolder = path.join(promptDir, DRAFTS_DIR);
        console.log(`[import-drafts] Trying fallback: ${oldDraftsFolder}`);
        try {
          await fs.promises.access(oldDraftsFolder);
          console.log(`[import-drafts] Found fallback drafts folder: ${oldDraftsFolder}`);
          draftsFolders.push(oldDraftsFolder);
        } catch {
          console.log(`[import-drafts] No drafts folders found for ${prompt_rel}`);
        }
      }
    }
    
    if (draftsFolders.length === 0) {
      console.log(`[import-drafts] No drafts folders found`);
      return res.status(404).json({
        success: false,
        error: `No drafts folders found. PROMPT_ROOT=${getPromptRoot()}`,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`[import-drafts] Processing ${draftsFolders.length} drafts folders`);
    
    for (const draftsFolder of draftsFolders) {
      const prompt_rel = getPromptRelFromDraftsFolder(draftsFolder);
      console.log(`[import-drafts] Processing: ${prompt_rel}`);
      const files = await fs.promises.readdir(draftsFolder);
      const imageFiles = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
      
      console.log(`[import-drafts] Found ${imageFiles.length} images`);
      if (imageFiles.length === 0) continue;
      
      const promptFilePath = resolvePromptFile(prompt_rel);
      const metadata = parsePromptFile(promptFilePath);
      
      // SIMPLE APPROACH: Import ALL files as separate bases
      // Users can approve one and generate variants manually in the UI
      for (const file of imageFiles) {
        try {
          const filePath = path.join(draftsFolder, file);
          const fileHash = crypto.createHash('md5').update(`${prompt_rel}_${file}`).digest('hex');
          const proposal_index = Math.abs(parseInt(fileHash.slice(0, 8), 16)) % 10000;
          
          // Check if this base already exists (skip duplicates)
          const existing = await queryOLTP(
            `SELECT id FROM asset_bases WHERE prompt_rel = $1 AND proposal_index = $2`,
            [prompt_rel, proposal_index]
          );
          
          if (existing.rows.length > 0) {
            console.log(`  ⊘ Skipping duplicate: ${file} (proposal_index=${proposal_index})`);
            results.details.push({
              prompt_rel,
              action: 'base',
              filename: file,
              success: true,
              id: existing.rows[0].id,
              error: 'Already exists, skipped'
            });
            continue;
          }
          
          const destKey = `drafts/bases/${prompt_rel.replace(/\//g, '_')}_${proposal_index}.png`;
          
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
              prompt_rel,
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
            prompt_rel,
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
            prompt_rel,
            action: 'base',
            filename: file,
            success: false,
            error: err.message
          });
        }
      }
    }
    
    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * Import a single image file as a base
 */
assetsImportRouter.post('/import-base', async (req, res, next) => {
  try {
    const { prompt_rel, file_path, asset_type, width, height } = req.body;
    
    if (!prompt_rel || !file_path) {
      return res.status(400).json({
        success: false,
        error: 'prompt_rel and file_path are required',
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      await fs.promises.access(file_path);
    } catch {
      return res.status(404).json({
        success: false,
        error: `File not found: ${file_path}`,
        timestamp: new Date().toISOString()
      });
    }
    
    const proposal_index = 0;
    const destKey = `drafts/bases/${prompt_rel.replace(/\//g, '_')}_${proposal_index}.png`;
    
    const imageBuffer = await fs.promises.readFile(file_path);
    const contentType = file_path.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    const image_path = await uploadToMinio(imageBuffer, destKey, contentType);
    
    const seed = Math.floor(Math.random() * 2147483647);
    const result = await queryOLTP(
      `INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, seed, asset_type, width, height, chosen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, prompt_rel, proposal_index, image_path`,
      [prompt_rel, proposal_index, image_path, seed, asset_type || 'unknown', width || 1024, height || 1024, false]
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

/**
 * Clean up imported drafts
 */
assetsImportRouter.delete('/imported-drafts', async (req, res, next) => {
  try {
    const { prompt_rel, all } = req.query;
    
    if (!prompt_rel && !all) {
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
        [prompt_rel]
      );
      
      const variantIdsRes = await queryOLTP(
        `SELECT id, image_path FROM asset_variants WHERE base_id IN (SELECT id FROM asset_bases WHERE prompt_rel = $1 AND image_path LIKE 's3://%/drafts/%')`,
        [prompt_rel]
      );
      
      await withOLTPTransaction(async (client) => {
        await client.query(`DELETE FROM asset_variants WHERE base_id IN (SELECT id FROM asset_bases WHERE prompt_rel = $1 AND image_path LIKE 's3://%/drafts/%')`, [prompt_rel]);
        await client.query(`DELETE FROM asset_bases WHERE prompt_rel = $1 AND image_path LIKE 's3://%/drafts/%'`, [prompt_rel]);
      });
      
      baseImagePaths.push(...basesRes.rows.map(row => row.image_path));
      variantImagePaths.push(...variantIdsRes.rows.map(row => row.image_path));
      
      deleted.bases = basesRes.rows.length;
      deleted.variants = variantIdsRes.rows.length;
    }
    
    // Clean up MinIO objects after transaction commits
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
