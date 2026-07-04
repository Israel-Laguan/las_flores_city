import express from 'express';
import {
  GenerateBasesRequestSchema,
  GenerateVariantsRequestSchema,
  ApproveBaseRequestSchema,
  AssetListResponseSchema,
  PromptCatalogResponseSchema,
  PublishAssetRequestSchema,
  PublishAssetResponseSchema,
  AssetListAllResponseSchema,
} from '@las-flores/shared';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { generateBaseImage, generateVariantImage, fetchImageAsBase64 } from '../services/AssetGenerationService.js';
import { uploadToMinio, signMinioUrl, deleteFromMinio } from '../services/StorageService.js';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  parsePromptFile,
  resolvePromptFile,
  getPromptCatalog,
  executePublishAsset,
  slugify,
} from './assets.helpers.js';

export const assetsRouter = express.Router();

// GET /assets/prompt-catalog
assetsRouter.get('/prompt-catalog', async (_req, res, next) => {
  try {
    const data = await getPromptCatalog();
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// POST /assets/generate-bases
assetsRouter.post('/generate-bases', async (req, res, next) => {
  try {
    const parse = GenerateBasesRequestSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ success: false, error: 'Invalid request body', timestamp: new Date().toISOString() });
      return;
    }
    const { prompt_rel, count, asset_type, negative_prompt, width, height } = parse.data;

    const promptFile = resolvePromptFile(prompt_rel);
    if (!fs.existsSync(promptFile)) {
      res.status(404).json({ success: false, error: `Prompt file not found: ${prompt_rel}`, timestamp: new Date().toISOString() });
      return;
    }

    const parsed = await parsePromptFile(promptFile);
    if (!parsed || parsed.variants.length === 0) {
      res.status(400).json({ success: false, error: 'No prompt variants found in file', timestamp: new Date().toISOString() });
      return;
    }

    const baseVariant = parsed.variants[0];
    const finalWidth = width || parsed.width;
    const finalHeight = height || parsed.height;
    const finalAssetType = asset_type || parsed.asset_type;
    const finalNegativePrompt = negative_prompt || baseVariant.negativePrompt;

    const maxIdxRes = await queryOLTP(
      `SELECT COALESCE(MAX(proposal_index), -1) AS max_idx FROM asset_bases WHERE prompt_rel = $1`,
      [prompt_rel]
    );
    const startIndex = Number(maxIdxRes.rows[0]?.max_idx ?? -1) + 1;

    const newBases = [];
    const errors = [];
    for (let offset = 0; offset < count; offset++) {
      const proposalIndex = startIndex + offset;
      try {
        const seed = Math.floor(Math.random() * 2147483647);
        const buffer = await generateBaseImage({
          prompt: baseVariant.prompt,
          negativePrompt: finalNegativePrompt,
          width: finalWidth,
          height: finalHeight,
          seed,
        });

        const key = `drafts/bases/${slugify(prompt_rel)}__base_${crypto.randomUUID()}.png`;
        const image_path = await uploadToMinio(buffer, key);

        const result = await queryOLTP(
          `INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, seed, asset_type, prompt_text, negative_prompt, width, height)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, prompt_rel, proposal_index, image_path, seed, chosen, created_at, asset_type, prompt_text, negative_prompt, width, height, final_path`,
          [prompt_rel, proposalIndex, image_path, seed, finalAssetType, baseVariant.prompt, finalNegativePrompt, finalWidth, finalHeight]
        );
        newBases.push(result.rows[0]);
      } catch (err: any) {
        console.error(`Error generating base ${proposalIndex}:`, err);
        errors.push({ proposal_index: proposalIndex, error: err.message });
      }
    }

    const success = errors.length === 0;
    const status = success ? 200 : newBases.length > 0 ? 207 : 500;
    res.status(status).json({
      success,
      data: newBases,
      ...(errors.length > 0 ? { errors } : {}),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// POST /assets/generate-variants
assetsRouter.post('/generate-variants', async (req, res, next) => {
  try {
    const parse = GenerateVariantsRequestSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ success: false, error: 'Invalid request body', timestamp: new Date().toISOString() });
      return;
    }
    const { base_id, variants } = parse.data;

    const baseRes = await queryOLTP(`SELECT image_path, prompt_rel, width, height FROM asset_bases WHERE id = $1`, [base_id]);
    if (baseRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Base not found', timestamp: new Date().toISOString() });
      return;
    }
    const base = baseRes.rows[0];

    const existingVariantsRes = await queryOLTP(
      `SELECT variant_name FROM asset_variants WHERE base_id = $1`,
      [base_id]
    );
    const usedVariantNames = new Set(existingVariantsRes.rows.map((row: any) => row.variant_name));

    const newVariants = [];
    const errors = [];
    for (const v of variants) {
      let variantName = v.variant_name;
      if (usedVariantNames.has(variantName)) {
        let suffix = 2;
        while (usedVariantNames.has(`${v.variant_name}_${suffix}`)) {
          suffix++;
        }
        variantName = `${v.variant_name}_${suffix}`;
      }
      usedVariantNames.add(variantName);

      try {
        const buffer = await generateVariantImage({
          prompt: v.prompt,
          sourceImageUrl: base.image_path,
          strength: v.i2i_strength,
          width: v.width || base.width || 1024,
          height: v.height || base.height || 1024,
          negativePrompt: v.negative_prompt,
        });

        const key = `drafts/variants/${slugify(base.prompt_rel)}__${slugify(variantName)}_${crypto.randomUUID()}.png`;
        const image_path = await uploadToMinio(buffer, key);

        const result = await queryOLTP(
          `INSERT INTO asset_variants (base_id, variant_name, image_path, i2i_strength, prompt_text, negative_prompt, width, height)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, base_id, variant_name, image_path, i2i_strength, created_at, prompt_text, negative_prompt, width, height, final_path`,
          [base_id, variantName, image_path, v.i2i_strength, v.prompt, v.negative_prompt || null, v.width || base.width, v.height || base.height]
        );
        newVariants.push(result.rows[0]);
      } catch (err: any) {
        console.error(`Error generating variant ${variantName}:`, err);
        errors.push({ variant_name: variantName, error: err.message });
      }
    }

    const success = errors.length === 0;
    const status = success ? 200 : newVariants.length > 0 ? 207 : 500;
    res.status(status).json({
      success,
      data: newVariants,
      ...(errors.length > 0 ? { errors } : {}),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// GET /assets/list
assetsRouter.get('/list', async (req, res, next) => {
  try {
    const prompt_rel = req.query.prompt_rel as string;
    if (!prompt_rel) {
      res.status(400).json({ success: false, error: 'Missing prompt_rel query parameter', timestamp: new Date().toISOString() });
      return;
    }

    const basesRes = await queryOLTP(`SELECT id, prompt_rel, proposal_index, image_path, seed, chosen, created_at, asset_type, prompt_text, negative_prompt, width, height, final_path FROM asset_bases WHERE prompt_rel = $1 ORDER BY created_at ASC`, [prompt_rel]);

    const variantsRes = await queryOLTP(
      `SELECT v.id, v.base_id, v.variant_name, v.image_path, v.i2i_strength, v.created_at, v.prompt_text, v.negative_prompt, v.width, v.height, v.final_path
       FROM asset_variants v
       JOIN asset_bases b ON b.id = v.base_id
       WHERE b.prompt_rel = $1
       ORDER BY v.created_at ASC`,
      [prompt_rel]
    );

    const bases = basesRes.rows.map((r: any) => ({
      ...r,
      seed: typeof r.seed === 'string' ? parseInt(r.seed, 10) : r.seed,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
    const variants = variantsRes.rows.map((r: any) => ({
      ...r,
      i2i_strength: typeof r.i2i_strength === 'string' ? parseFloat(r.i2i_strength) : r.i2i_strength,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));

    const data = AssetListResponseSchema.parse({
      prompt_rel,
      bases,
      variants,
    });

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// GET /assets/list-all
assetsRouter.get('/list-all', async (_req, res, next) => {
  try {
    const basesRes = await queryOLTP(`
      SELECT prompt_rel, COUNT(*) as base_count, COUNT(CASE WHEN chosen THEN 1 END) as chosen_count
      FROM asset_bases
      GROUP BY prompt_rel
    `);

    const variantsRes = await queryOLTP(`
      SELECT b.prompt_rel, COUNT(v.id) as variant_count
      FROM asset_variants v
      JOIN asset_bases b ON b.id = v.base_id
      GROUP BY b.prompt_rel
    `);

    const variantMap = new Map(variantsRes.rows.map((r: any) => [r.prompt_rel, r.variant_count]));

    const chosenRes = await queryOLTP(`SELECT DISTINCT ON (prompt_rel) prompt_rel, id FROM asset_bases WHERE chosen ORDER BY prompt_rel`);
    const chosenMap = new Map(chosenRes.rows.map((r: any) => [r.prompt_rel, r.id]));

    const groups = basesRes.rows.map((r: any) => {
      const count = typeof r.base_count === 'string' ? parseInt(r.base_count, 10) : r.base_count;
      const vCount = typeof variantMap.get(r.prompt_rel) === 'string'
        ? parseInt(variantMap.get(r.prompt_rel) as string, 10)
        : (variantMap.get(r.prompt_rel) || 0);
      return {
        prompt_rel: r.prompt_rel,
        base_count: count || 0,
        variant_count: vCount,
        chosen_base_id: chosenMap.get(r.prompt_rel) || null,
      };
    });

    const data = AssetListAllResponseSchema.parse({ groups });
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// POST /assets/approve-base
assetsRouter.post('/approve-base', async (req, res, next) => {
  try {
    const parse = ApproveBaseRequestSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ success: false, error: 'Invalid request body', timestamp: new Date().toISOString() });
      return;
    }
    const { base_id } = parse.data;

    await withOLTPTransaction(async (client) => {
      const baseRes = await client.query(`SELECT prompt_rel FROM asset_bases WHERE id = $1`, [base_id]);
      if (baseRes.rows.length === 0) {
        throw new Error('Base not found');
      }
      const prompt_rel = baseRes.rows[0].prompt_rel;

      await client.query(`UPDATE asset_bases SET chosen = FALSE WHERE prompt_rel = $1`, [prompt_rel]);
      await client.query(`UPDATE asset_bases SET chosen = TRUE WHERE id = $1`, [base_id]);
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    if (error.message === 'Base not found') {
      res.status(404).json({ success: false, error: 'Base not found', timestamp: new Date().toISOString() });
      return;
    }
    next(error);
  }
});

// POST /assets/publish
assetsRouter.post('/publish', async (req, res, next) => {
  try {
    const parse = PublishAssetRequestSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ success: false, error: 'Invalid request body', timestamp: new Date().toISOString() });
      return;
    }
    const { base_id, variant_id, final_path } = parse.data;

    if (!base_id && !variant_id) {
      res.status(400).json({ success: false, error: 'Must specify base_id or variant_id', timestamp: new Date().toISOString() });
      return;
    }

    const { computedFinalPath, publicUrl } = await executePublishAsset({ base_id, variant_id, final_path });

    const data = PublishAssetResponseSchema.parse({
      success: true,
      final_path: computedFinalPath,
      url: publicUrl,
    });

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    if (error.message === 'Base not found' || error.message === 'Variant not found') {
      res.status(404).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
      return;
    }
    next(error);
  }
});

// GET /assets/image/:id
assetsRouter.get('/image/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    let baseRes = await queryOLTP(`SELECT image_path FROM asset_bases WHERE id = $1`, [id]);
    let imagePath: string | null = null;

    if (baseRes.rows.length > 0) {
      imagePath = baseRes.rows[0].image_path;
    } else {
      const variantRes = await queryOLTP(`SELECT image_path FROM asset_variants WHERE id = $1`, [id]);
      if (variantRes.rows.length > 0) {
        imagePath = variantRes.rows[0].image_path;
      }
    }

    if (!imagePath) {
      res.status(404).json({ success: false, error: 'Image not found', timestamp: new Date().toISOString() });
      return;
    }

    const signedUrl = await signMinioUrl(imagePath, 300);

    const resp = await fetch(signedUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error(`Failed to fetch source image: ${resp.status}`);
    const imageBuffer = Buffer.from(await resp.arrayBuffer());
    const contentType = imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(imageBuffer);
  } catch (error) {
    next(error);
  }
});

// DELETE /assets/bases/:id
assetsRouter.delete('/bases/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    let baseImagePath: string | null = null;
    let variantImagePaths: string[] = [];

    await withOLTPTransaction(async (client) => {
      const baseRes = await client.query(`SELECT image_path FROM asset_bases WHERE id = $1`, [id]);
      if (baseRes.rows.length === 0) {
        throw new Error('Base not found');
      }
      baseImagePath = baseRes.rows[0].image_path;

      const variantsRes = await client.query(`SELECT image_path FROM asset_variants WHERE base_id = $1`, [id]);
      variantImagePaths = variantsRes.rows.map((r) => r.image_path);

      await client.query(`DELETE FROM asset_variants WHERE base_id = $1`, [id]);
      await client.query(`DELETE FROM asset_bases WHERE id = $1`, [id]);
    });

    // Perform MinIO cleanup after transaction commits
    if (baseImagePath) {
      await deleteFromMinio(baseImagePath).catch((err) => console.error('Failed to delete base from Minio:', err));
    }
    for (const vp of variantImagePaths) {
      if (vp) {
        await deleteFromMinio(vp).catch((err) => console.error('Failed to delete variant from Minio:', err));
      }
    }

    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error.message === 'Base not found') {
      res.status(404).json({ success: false, error: 'Base not found', timestamp: new Date().toISOString() });
      return;
    }
    next(error);
  }
});

// DELETE /assets/variants/:id
assetsRouter.delete('/variants/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    let variantImagePath: string | null = null;

    await withOLTPTransaction(async (client) => {
      const variantRes = await client.query(`SELECT image_path FROM asset_variants WHERE id = $1`, [id]);
      if (variantRes.rows.length === 0) {
        throw new Error('Variant not found');
      }
      variantImagePath = variantRes.rows[0].image_path;

      await client.query(`DELETE FROM asset_variants WHERE id = $1`, [id]);
    });

    // Perform MinIO cleanup after transaction commits
    if (variantImagePath) {
      await deleteFromMinio(variantImagePath).catch((err) => console.error('Failed to delete variant from Minio:', err));
    }

    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error.message === 'Variant not found') {
      res.status(404).json({ success: false, error: 'Variant not found', timestamp: new Date().toISOString() });
      return;
    }
    next(error);
  }
});
