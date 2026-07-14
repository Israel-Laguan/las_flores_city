import express from 'express';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { deleteFromMinio } from '../services/StorageService.js';
import fs from 'node:fs';
import { adminMiddleware } from '../middleware/adminAuth.js';
import { sanitizePromptRel, sanitizeFilePath } from '../utils/sanitize.js';
import { resolveAllowedImportFile } from './assets-import.helpers.js';
import { collectDraftsFolders, importDrafts } from './assets-import.drafts.js';
import { getPromptRoot } from './assets.helpers.js';

export const assetsImportRouter = express.Router();

assetsImportRouter.use(adminMiddleware);

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

    const { uploadToMinio } = await import('../services/StorageService.js');
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
