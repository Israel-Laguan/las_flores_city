import express from 'express';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { uploadToMinio, deleteFromMinio } from '../services/StorageService.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PROMPT_ROOT, parsePromptFile, resolvePromptFile, slugify } from './assets.helpers.js';

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

function getProposalIndex(filename: string): number {
  if (isBaseVariant(filename)) {
    return 0;
  }
  const variantName = getVariantNameFromFilename(filename);
  const hash = crypto.createHash('md5').update(variantName).digest('hex');
  return Math.abs(parseInt(hash, 16)) % 100;
}

/**
 * Get prompt_rel from a drafts folder path
 * Drafts are in: PROMPT_ROOT/isometric-map/assets/lm_electra.prompt/drafts
 * We want: isometric-map/assets/lm_electra
 */
function getPromptRelFromDraftsFolder(draftsFolder: string): string {
  const parentFolder = path.dirname(draftsFolder);
  const relPath = path.relative(PROMPT_ROOT, parentFolder);
  // Remove .prompt suffix if present at the end
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
      // Find all drafts folders
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === DRAFTS_DIR) {
              console.log(`[import-drafts] Found drafts folder: ${fullPath}`);
              draftsFolders.push(fullPath);
            } else {
              walk(fullPath);
            }
          }
        }
      };
      console.log(`[import-drafts] Walking PROMPT_ROOT: ${PROMPT_ROOT}`);
      walk(PROMPT_ROOT);
      console.log(`[import-drafts] Found ${draftsFolders.length} drafts folders for bulk import`);
    } else {
      // Find the specific drafts folder
      const promptFile = resolvePromptFile(prompt_rel as string);
      const promptDir = path.dirname(promptFile);
      // The prompt file is e.g. "lm_electra.prompt.md"
      // The drafts are in "lm_electra.prompt/drafts/"
      // So we need to replace .prompt.md with .prompt/drafts
      const baseName = path.basename(promptFile, '.md'); // e.g. "lm_electra.prompt"
      const draftsFolder = path.join(promptDir, baseName, DRAFTS_DIR);
      console.log(`[import-drafts] Looking for drafts: ${draftsFolder} (exists: ${fs.existsSync(draftsFolder)})`);
      if (fs.existsSync(draftsFolder)) {
        draftsFolders.push(draftsFolder);
      } else {
        // Fallback: try the old way for compatibility
        const oldDraftsFolder = path.join(promptDir, DRAFTS_DIR);
        console.log(`[import-drafts] Trying fallback: ${oldDraftsFolder} (exists: ${fs.existsSync(oldDraftsFolder)})`);
        if (fs.existsSync(oldDraftsFolder)) {
          draftsFolders.push(oldDraftsFolder);
        }
      }
    }
    
    if (draftsFolders.length === 0) {
      console.log(`[import-drafts] No drafts folders found. Searched in: ${PROMPT_ROOT}`);
      return res.status(404).json({
        success: false,
        error: `No drafts folders found. PROMPT_ROOT=${PROMPT_ROOT}. Make sure drafts exist in ${path.join(PROMPT_ROOT, '*', '*', DRAFTS_DIR)}`,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`[import-drafts] Processing ${draftsFolders.length} drafts folders`);
    for (const draftsFolder of draftsFolders) {
      const prompt_rel = getPromptRelFromDraftsFolder(draftsFolder);
      console.log(`[import-drafts] Processing: ${prompt_rel} (folder: ${draftsFolder})`);
      const files = fs.readdirSync(draftsFolder);
      const imageFiles = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
      
      console.log(`[import-drafts] Found ${imageFiles.length} images in ${draftsFolder}`);
      if (imageFiles.length === 0) continue;
      
      // Try to parse prompt file for metadata
      const promptFile = resolvePromptFile(prompt_rel);
      const metadata = parsePromptFile(promptFile);
      
      // Group files
      const bases = imageFiles.filter(f => isBaseVariant(f));
      const variants = imageFiles.filter(f => !isBaseVariant(f));
      
      // Process bases
      for (const file of bases) {
        try {
          const filePath = path.join(draftsFolder, file);
          const proposal_index = getProposalIndex(file);
          const destKey = `drafts/bases/${prompt_rel.replace(/\//g, '_')}_${proposal_index}.png`;
          
          // Upload to MinIO
          const imageBuffer = fs.readFileSync(filePath);
          const contentType = file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
          const image_path = await uploadToMinio(imageBuffer, destKey, contentType);
          
          // Insert into database
          const seed = Math.floor(Math.random() * 2147483647);
          const result = await queryOLTP(
            `INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, seed, asset_type, prompt_text, negative_prompt, width, height, chosen)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (prompt_rel, proposal_index) DO UPDATE
             SET image_path = EXCLUDED.image_path, seed = EXCLUDED.seed, asset_type = EXCLUDED.asset_type,
                 prompt_text = EXCLUDED.prompt_text, negative_prompt = EXCLUDED.negative_prompt,
                 width = EXCLUDED.width, height = EXCLUDED.height, created_at = EXCLUDED.created_at
             RETURNING id, prompt_rel, proposal_index, image_path`,
            [
              prompt_rel,
              proposal_index,
              image_path,
              seed,
              metadata?.asset_type || 'unknown',
              metadata?.variants[0]?.prompt || '',
              metadata?.variants[0]?.negativePrompt || '',
              metadata?.width || 1024,
              metadata?.height || 1024,
              false
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
          
        } catch (err: any) {
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
      
      // Process variants
      for (const file of variants) {
        try {
          const filePath = path.join(draftsFolder, file);
          const variantName = getVariantNameFromFilename(file);
          const destKey = `drafts/variants/${prompt_rel.replace(/\//g, '_')}_${slugify(variantName)}.png`;
          
          // Upload to MinIO
          const imageBuffer = fs.readFileSync(filePath);
          const contentType = file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
          const image_path = await uploadToMinio(imageBuffer, destKey, contentType);
          
          // Find a base for this variant (use first base if no exact match)
          const basesRes = await queryOLTP(
            `SELECT id FROM asset_bases WHERE prompt_rel = $1 ORDER BY created_at ASC LIMIT 1`,
            [prompt_rel]
          );
          
          if (basesRes.rows.length === 0) {
            throw new Error('No base found for this variant');
          }
          
          const base_id = basesRes.rows[0].id;
          
          // Insert into database
          const result = await queryOLTP(
            `INSERT INTO asset_variants (base_id, variant_name, image_path, i2i_strength, prompt_text, negative_prompt, width, height)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (base_id, variant_name) DO UPDATE
             SET image_path = EXCLUDED.image_path, i2i_strength = EXCLUDED.i2i_strength,
                 prompt_text = EXCLUDED.prompt_text, negative_prompt = EXCLUDED.negative_prompt,
                 width = EXCLUDED.width, height = EXCLUDED.height, created_at = EXCLUDED.created_at
             RETURNING id, base_id, variant_name, image_path`,
            [
              base_id,
              variantName,
              image_path,
              0.7,
              metadata?.variants.find(v => v.name.toLowerCase().includes(variantName.toLowerCase()))?.prompt || '',
              metadata?.variants.find(v => v.name.toLowerCase().includes(variantName.toLowerCase()))?.negativePrompt || '',
              metadata?.width || 1024,
              metadata?.height || 1024
            ]
          );
          
          results.imported.variants++;
          results.details.push({
            prompt_rel,
            action: 'variant',
            filename: file,
            success: true,
            id: result.rows[0].id
          });
          
        } catch (err: any) {
          results.errors.push({ file, error: err.message });
          results.details.push({
            prompt_rel,
            action: 'variant',
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
 * POST /assets/import-base
 * Body: { prompt_rel: string, file_path: string, asset_type?: string, width?: number, height?: number }
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
    
    // Check if file exists
    if (!fs.existsSync(file_path)) {
      return res.status(404).json({
        success: false,
        error: `File not found: ${file_path}`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Determine destination key
    const proposal_index = 0;
    const destKey = `drafts/bases/${prompt_rel.replace(/\//g, '_')}_${proposal_index}.png`;
    
    // Upload to MinIO
    const imageBuffer = fs.readFileSync(file_path);
    const contentType = file_path.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    const image_path = await uploadToMinio(imageBuffer, destKey, contentType);
    
    // Insert into database
    const seed = Math.floor(Math.random() * 2147483647);
    const result = await queryOLTP(
      `INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, seed, asset_type, width, height, chosen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (prompt_rel, proposal_index) DO UPDATE
       SET image_path = EXCLUDED.image_path, seed = EXCLUDED.seed, asset_type = EXCLUDED.asset_type,
           width = EXCLUDED.width, height = EXCLUDED.height, created_at = EXCLUDED.created_at
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
 * Clean up imported drafts (delete from MinIO and database)
 * DELETE /assets/imported-drafts?prompt_rel=...&all=true
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
    
    if (all === 'true') {
      // Delete all imported bases and variants
      const basesRes = await queryOLTP(
        `SELECT id, image_path FROM asset_bases WHERE image_path LIKE 's3://%/drafts/%'`
      );
      
      for (const row of basesRes.rows) {
        await deleteFromMinio(row.image_path).catch(() => {});
      }
      
      await queryOLTP(`DELETE FROM asset_variants WHERE base_id IN (SELECT id FROM asset_bases WHERE image_path LIKE 's3://%/drafts/%')`);
      await queryOLTP(`DELETE FROM asset_bases WHERE image_path LIKE 's3://%/drafts/%'`);
      
      deleted.bases = basesRes.rows.length;
      deleted.variants = (await queryOLTP(`SELECT COUNT(*) FROM asset_variants WHERE base_id IN (SELECT id FROM asset_bases WHERE image_path LIKE 's3://%/drafts/%')`)).rows[0].count || 0;
    } else {
      // Delete for specific prompt_rel
      const basesRes = await queryOLTP(
        `SELECT id, image_path FROM asset_bases WHERE prompt_rel = $1 AND image_path LIKE 's3://%/drafts/%'`,
        [prompt_rel]
      );
      
      for (const row of basesRes.rows) {
        await deleteFromMinio(row.image_path).catch(() => {});
      }
      
      const variantIdsRes = await queryOLTP(
        `SELECT id, image_path FROM asset_variants WHERE base_id IN (SELECT id FROM asset_bases WHERE prompt_rel = $1)`,
        [prompt_rel]
      );
      
      for (const row of variantIdsRes.rows) {
        await deleteFromMinio(row.image_path).catch(() => {});
      }
      
      await queryOLTP(`DELETE FROM asset_variants WHERE base_id IN (SELECT id FROM asset_bases WHERE prompt_rel = $1)`, [prompt_rel]);
      await queryOLTP(`DELETE FROM asset_bases WHERE prompt_rel = $1 AND image_path LIKE 's3://%/drafts/%'`, [prompt_rel]);
      
      deleted.bases = basesRes.rows.length;
      deleted.variants = variantIdsRes.rows.length;
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
