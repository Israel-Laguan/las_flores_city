import { Request, Response, NextFunction } from 'express';
import {
  GenerateBasesRequestSchema,
  GenerateVariantsRequestSchema,
} from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { deleteFromMinio, uploadToMinio } from '../services/StorageService.js';
import { resolvePromptFile, slugify } from './assets.helpers.js';
import { sanitizePromptRel } from '../utils/sanitize.js';
import crypto from 'crypto';
import fs from 'node:fs';

export async function handleGenerateBases(req: Request, res: Response, next: NextFunction) {
  try {
    const parse = GenerateBasesRequestSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ success: false, error: 'Invalid request body', timestamp: new Date().toISOString() });
      return;
    }
    const { prompt_rel, count, asset_type, negative_prompt, width, height } = parse.data;

    const sanitizedPromptRel = sanitizePromptRel(prompt_rel);
    if (!sanitizedPromptRel) {
      res.status(400).json({ success: false, error: 'Invalid prompt_rel path', timestamp: new Date().toISOString() });
      return;
    }

    const promptFile = resolvePromptFile(sanitizedPromptRel);
    if (!fs.existsSync(promptFile)) {
      res.status(404).json({ success: false, error: `Prompt file not found: ${prompt_rel}`, timestamp: new Date().toISOString() });
      return;
    }

    const { baseVariant, finalWidth, finalHeight, finalAssetType, finalNegativePrompt } = await prepareBaseGeneration(
      sanitizedPromptRel,
      promptFile,
      width,
      height,
      asset_type,
      negative_prompt
    );

    const maxIdxRes = await queryOLTP(
      `SELECT COALESCE(MAX(proposal_index), -1) AS max_idx FROM asset_bases WHERE prompt_rel = $1`,
      [sanitizedPromptRel]
    );
    const startIndex = Number(maxIdxRes.rows[0]?.max_idx ?? -1) + 1;

    const { newBases, errors } = await generateBases(
      sanitizedPromptRel,
      count,
      startIndex,
      baseVariant,
      finalWidth,
      finalHeight,
      finalAssetType,
      finalNegativePrompt
    );

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
}

async function prepareBaseGeneration(
  sanitizedPromptRel: string,
  promptFile: string,
  width?: number,
  height?: number,
  asset_type?: string,
  negative_prompt?: string
) {
  const { parsePromptFile } = await import('./assets.helpers.js');
  const parsed = await parsePromptFile(promptFile);
  if (!parsed || parsed.variants.length === 0) {
    throw new Error('No prompt variants found in file');
  }

  const baseVariant = parsed.variants[0];
  const finalWidth = width || parsed.width;
  const finalHeight = height || parsed.height;
  const finalAssetType = asset_type || parsed.asset_type;
  const finalNegativePrompt = negative_prompt || baseVariant.negativePrompt;

  return { parsed, baseVariant, finalWidth, finalHeight, finalAssetType, finalNegativePrompt };
}

async function generateBases(
  sanitizedPromptRel: string,
  count: number,
  startIndex: number,
  baseVariant: { prompt: string; negativePrompt: string },
  finalWidth: number,
  finalHeight: number,
  finalAssetType: string,
  finalNegativePrompt: string
) {
  const { generateBaseImage } = await import('../services/AssetGenerationService.js');
  const newBases: any[] = [];
  const errors: any[] = [];

  for (let offset = 0; offset < count; offset++) {
    const proposalIndex = startIndex + offset;
    let image_path: string | undefined;
    try {
      const seed = Math.floor(Math.random() * 2147483647);
      const buffer = await generateBaseImage({
        prompt: baseVariant.prompt,
        negativePrompt: finalNegativePrompt,
        width: finalWidth,
        height: finalHeight,
        seed,
      });

      const key = `drafts/bases/${slugify(sanitizedPromptRel)}__base_${crypto.randomUUID()}.png`;
      image_path = await uploadToMinio(buffer, key);

      const result = await queryOLTP(
        `INSERT INTO asset_bases (prompt_rel, proposal_index, image_path, seed, asset_type, prompt_text, negative_prompt, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, prompt_rel, proposal_index, image_path, seed, chosen, created_at, asset_type, prompt_text, negative_prompt, width, height, final_path`,
        [sanitizedPromptRel, proposalIndex, image_path, seed, finalAssetType, baseVariant.prompt, finalNegativePrompt, finalWidth, finalHeight]
      );
      newBases.push(result.rows[0]);
    } catch (err: any) {
      if (image_path) {
        await deleteFromMinio(image_path).catch((deleteErr) =>
          console.error('Failed to delete orphaned generated base from MinIO:', deleteErr)
        );
      }
      console.error(`Error generating base ${proposalIndex}:`, err);
      errors.push({ proposal_index: proposalIndex, error: err.message });
    }
  }

  return { newBases, errors };
}

export async function handleGenerateVariants(req: Request, res: Response, next: NextFunction) {
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

    const { newVariants, errors } = await generateVariants(base_id, base, variants, usedVariantNames);

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
}

async function generateVariants(
  base_id: string | number,
  base: { image_path: string; width: number; height: number; prompt_rel: string },
  variants: Array<{ variant_name: string; prompt: string; i2i_strength: number; width?: number; height?: number; negative_prompt?: string }>,
  usedVariantNames: Set<string>
) {
  const { generateVariantImage } = await import('../services/AssetGenerationService.js');
  const newVariants: any[] = [];
  const errors: any[] = [];

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

    let image_path: string | undefined;
    try {
      const finalWidth = v.width || base.width || 1024;
      const finalHeight = v.height || base.height || 1024;
      const buffer = await generateVariantImage({
        prompt: v.prompt,
        sourceImageUrl: base.image_path,
        strength: v.i2i_strength,
        width: finalWidth,
        height: finalHeight,
        negativePrompt: v.negative_prompt,
      });

      const key = `drafts/variants/${slugify(base.prompt_rel)}__${slugify(variantName)}_${crypto.randomUUID()}.png`;
      image_path = await uploadToMinio(buffer, key);

      const result = await queryOLTP(
        `INSERT INTO asset_variants (base_id, variant_name, image_path, i2i_strength, prompt_text, negative_prompt, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, base_id, variant_name, image_path, i2i_strength, created_at, prompt_text, negative_prompt, width, height, final_path`,
        [base_id, variantName, image_path, v.i2i_strength, v.prompt, v.negative_prompt || null, finalWidth, finalHeight]
      );
      newVariants.push(result.rows[0]);
    } catch (err: any) {
      if (image_path) {
        await deleteFromMinio(image_path).catch((deleteErr) =>
          console.error('Failed to delete orphaned generated variant from MinIO:', deleteErr)
        );
      }
      console.error(`Error generating variant ${variantName}:`, err);
      errors.push({ variant_name: variantName, error: err.message });
    }
  }

  return { newVariants, errors };
}