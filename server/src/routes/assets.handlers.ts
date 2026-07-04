import { Request, Response, NextFunction } from 'express';
import {
  AssetListResponseSchema,
  AssetListAllResponseSchema,
  PublishAssetResponseSchema,
  PublishAssetRequestSchema,
  ApproveBaseRequestSchema,
} from '@las-flores/shared';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { uploadToMinio, signMinioUrl, deleteFromMinio } from '../services/StorageService.js';
import { executePublishAsset, slugify } from './assets.helpers.js';
import { sanitizePromptRel } from '../utils/sanitize.js';

export async function handleListAssets(req: Request, res: Response, next: NextFunction) {
  try {
    const prompt_rel = req.query.prompt_rel as string;
    if (!prompt_rel) {
      res.status(400).json({ success: false, error: 'Missing prompt_rel query parameter', timestamp: new Date().toISOString() });
      return;
    }

    const sanitizedPromptRel = sanitizePromptRel(prompt_rel);
    if (!sanitizedPromptRel) {
      res.status(400).json({ success: false, error: 'Invalid prompt_rel path', timestamp: new Date().toISOString() });
      return;
    }

    const basesRes = await queryOLTP(
      `SELECT id, prompt_rel, proposal_index, image_path, seed, chosen, created_at, asset_type, prompt_text, negative_prompt, width, height, final_path
       FROM asset_bases WHERE prompt_rel = $1 ORDER BY created_at ASC`,
      [sanitizedPromptRel]
    );

    const variantsRes = await queryOLTP(
      `SELECT v.id, v.base_id, v.variant_name, v.image_path, v.i2i_strength, v.created_at, v.prompt_text, v.negative_prompt, v.width, v.height, v.final_path
       FROM asset_variants v
       JOIN asset_bases b ON b.id = v.base_id
       WHERE b.prompt_rel = $1
       ORDER BY v.created_at ASC`,
      [sanitizedPromptRel]
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
}

export async function handleListAllAssets(_req: Request, res: Response, next: NextFunction) {
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
}

export async function handleApproveBase(req: Request, res: Response, next: NextFunction) {
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
}

export async function handlePublishAsset(req: Request, res: Response, next: NextFunction) {
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
}

export async function handleGetImage(req: Request, res: Response, next: NextFunction) {
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
}

export async function handleDeleteBase(req: Request, res: Response, next: NextFunction) {
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
}

export async function handleDeleteVariant(req: Request, res: Response, next: NextFunction) {
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
}