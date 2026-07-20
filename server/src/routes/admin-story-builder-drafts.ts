import fs from 'node:fs/promises';
import express from 'express';
import path from 'node:path';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { markDrafted, markChosen } from '../services/AssetNeedsService.js';
import { generatePromptFiles } from '../services/PromptFileGenerator.js';
import {
  generateLocalDrafts,
  listLocalAssets,
  chooseDraft,
  resolveEntityRootDir,
  findNeedByPromptType,
  getAssetFieldName,
  isValidAssetFilename,
} from '../services/LocalDraftService.js';

export const adminStoryBuilderDraftsRouter = express.Router();

const MAX_DRAFT_COUNT = 8;
const DEFAULT_DRAFT_COUNT = 3;

function resolveContentDir(): string {
  return path.resolve(process.cwd(), 'content');
}

/** Load and validate a plan from the DB by ID. Returns 404/400-aware result. */
async function loadPlan(id: string): Promise<{ ok: true; plan: ContentPlan } | { ok: false; status: number; error: string }> {
  const result = await queryOLTP<{ plan_json: any; status: string }>(
    'SELECT plan_json, status FROM content_plans WHERE id = $1', [id]
  );
  if (result.rows.length === 0) {
    return { ok: false, status: 404, error: 'Plan not found' };
  }
  try {
    const plan = ContentPlanSchema.parse(result.rows[0].plan_json);
    return { ok: true, plan };
  } catch {
    return { ok: false, status: 400, error: 'Stored plan failed schema validation' };
  }
}

// POST /plans/:id/generate-drafts — generate local PNGs, no MinIO, no DB row
adminStoryBuilderDraftsRouter.post('/plans/:id/generate-drafts', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const count = Math.max(1, Math.min(Number(req.query.count) || DEFAULT_DRAFT_COUNT, MAX_DRAFT_COUNT));

    const statusRes = await queryOLTP<{ status: string }>(
      'SELECT status FROM content_plans WHERE id = $1', [id]
    );
    if (statusRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
      return;
    }
    if (statusRes.rows[0].status !== 'proposed' && statusRes.rows[0].status !== 'approved') {
      res.status(400).json({
        success: false,
        error: `Plan must be proposed or approved to generate drafts. Current status: ${statusRes.rows[0].status}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const loaded = await loadPlan(id);
    if (!loaded.ok) {
      res.status(loaded.status).json({ success: false, error: loaded.error, timestamp: new Date().toISOString() });
      return;
    }
    const plan = loaded.plan;
    const contentDir = resolveContentDir();
    const generated: Array<{ itemId: string; slug: string; files: string[] }> = [];

    for (const item of plan.items) {
      const pendingNeeds = item.assetNeeds.filter(n => n.status === 'pending');
      if (pendingNeeds.length === 0) continue;

      const entityRoot = resolveEntityRootDir(item, contentDir);
      await generatePromptFiles([item], contentDir);
      const files = await generateLocalDrafts(item, entityRoot, count);

      for (const need of pendingNeeds) {
        markDrafted(need);
      }
      generated.push({ itemId: item.id, slug: item.slug, files });
    }

    await queryOLTP('UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2', [plan, id]);

    res.json({ success: true, data: { planId: id, generated, itemCount: generated.length }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/generate-drafts error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate drafts', timestamp: new Date().toISOString() });
  }
});

// GET /plans/:id/drafts — list local drafts for every item in the plan
adminStoryBuilderDraftsRouter.get('/plans/:id/drafts', async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const loaded = await loadPlan(id);
    if (!loaded.ok) {
      res.status(loaded.status).json({ success: false, error: loaded.error, timestamp: new Date().toISOString() });
      return;
    }
    const plan = loaded.plan;
    const contentDir = resolveContentDir();

    let planModified = false;
    const items = [];
    for (const item of plan.items) {
      const entityRoot = resolveEntityRootDir(item, contentDir);
      const assets = await listLocalAssets(entityRoot);
      const preSelected = assets.length > 0 ? assets[0].filename : null;

      items.push({
        itemId: item.id, slug: item.slug, type: item.type,
        assets: assets.map(a => ({
          filename: a.filename,
          sizeBytes: a.sizeBytes,
          mtime: a.mtime.toISOString(),
          previewUrl: `/admin/story-builder/plans/${id}/drafts/preview?itemId=${encodeURIComponent(item.id)}&filename=${encodeURIComponent(a.filename)}`,
        })),
        preSelected,
      });

      // Auto-choose __default.png for pending asset needs
      const defaultAsset = assets.find(a => a.filename.endsWith('__default.png'));
      if (defaultAsset) {
        for (const need of item.assetNeeds) {
          if (need.status === 'pending') {
            const fieldName = getAssetFieldName(need);
            if (!(item.fields as any).asset_paths) (item.fields as any).asset_paths = {};
            (item.fields as any).asset_paths[fieldName] = defaultAsset.filename;
            markChosen(need);
            planModified = true;
          }
        }
      }
    }

    if (planModified) {
      await queryOLTP('UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2', [plan, id]);
    }

    res.json({ success: true, data: { planId: id, items }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] GET /plans/:id/drafts error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to list drafts', timestamp: new Date().toISOString() });
  }
});

// POST /plans/:id/choose-draft — select a draft as canonical for an asset need
adminStoryBuilderDraftsRouter.post('/plans/:id/choose-draft', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { itemId, promptType, filename } = req.body;

    if (!itemId || typeof itemId !== 'string') {
      res.status(400).json({ success: false, error: 'itemId is required', timestamp: new Date().toISOString() });
      return;
    }
    if (!promptType || typeof promptType !== 'string') {
      res.status(400).json({ success: false, error: 'promptType is required', timestamp: new Date().toISOString() });
      return;
    }
    if (!filename || typeof filename !== 'string') {
      res.status(400).json({ success: false, error: 'filename is required', timestamp: new Date().toISOString() });
      return;
    }

    const loaded = await loadPlan(id);
    if (!loaded.ok) {
      res.status(loaded.status).json({ success: false, error: loaded.error, timestamp: new Date().toISOString() });
      return;
    }
    const plan = loaded.plan;

    const item = plan.items.find(i => i.id === itemId);
    if (!item) {
      res.status(404).json({ success: false, error: 'Item not found in plan', timestamp: new Date().toISOString() });
      return;
    }
    const need = findNeedByPromptType(item, promptType);
    if (!need) {
      res.status(404).json({ success: false, error: `AssetNeed with promptType '${promptType}' not found`, timestamp: new Date().toISOString() });
      return;
    }

    const fieldName = getAssetFieldName(need);
    if (!(item.fields as any).asset_paths) (item.fields as any).asset_paths = {};
    (item.fields as any).asset_paths[fieldName] = filename;

    const contentDir = resolveContentDir();
    const entityRoot = resolveEntityRootDir(item, contentDir);
    await chooseDraft(item, entityRoot, filename, contentDir);

    markChosen(need);

    await queryOLTP('UPDATE content_plans SET plan_json = $1, updated_at = NOW() WHERE id = $2', [plan, id]);
    res.json({ success: true, data: { planId: id, itemId, promptType, filename, status: 'chosen' }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/choose-draft error:', error);
    const status = error.message?.includes('ENOENT') || error.code === 'ENOENT' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to choose draft', timestamp: new Date().toISOString() });
  }
});

// GET /plans/:id/drafts/preview — serve a local draft image for the admin thumbnail grid
adminStoryBuilderDraftsRouter.get('/plans/:id/drafts/preview', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const itemId = req.query.itemId;
    const filename = req.query.filename;

    if (!itemId || typeof itemId !== 'string') {
      res.status(400).json({ success: false, error: 'itemId query parameter is required', timestamp: new Date().toISOString() });
      return;
    }
    if (!filename || typeof filename !== 'string') {
      res.status(400).json({ success: false, error: 'filename query parameter is required', timestamp: new Date().toISOString() });
      return;
    }
    if (filename.includes('..') || path.isAbsolute(filename)) {
      res.status(403).json({ success: false, error: 'Invalid filename', timestamp: new Date().toISOString() });
      return;
    }
    if (!isValidAssetFilename(filename)) {
      res.status(400).json({ success: false, error: 'Unsupported file type', timestamp: new Date().toISOString() });
      return;
    }

    const loaded = await loadPlan(id);
    if (!loaded.ok) {
      res.status(loaded.status).json({ success: false, error: loaded.error, timestamp: new Date().toISOString() });
      return;
    }
    const plan = loaded.plan;

    const item = plan.items.find(i => i.id === itemId);
    if (!item) {
      res.status(404).json({ success: false, error: 'Item not found in plan', timestamp: new Date().toISOString() });
      return;
    }

    const contentDir = resolveContentDir();
    const entityRoot = resolveEntityRootDir(item, contentDir);
    const filePath = path.join(entityRoot, 'assets', filename);

    // Path safety: must be inside contentDir
    if (!filePath.startsWith(contentDir + path.sep)) {
      res.status(403).json({ success: false, error: 'Access denied', timestamp: new Date().toISOString() });
      return;
    }

    const imageBuffer = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    res.setHeader('Content-Type', contentTypeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(imageBuffer);
  } catch (error: any) {
    console.error('[story-builder] GET /plans/:id/drafts/preview error:', error);
    const status = error.code === 'ENOENT' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to preview draft', timestamp: new Date().toISOString() });
  }
});
