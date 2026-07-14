import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { contentPlanService } from '../services/ContentPlanService.js';

export const adminStoryBuilderLoreRouter = express.Router();

// POST /admin/story-builder/plans/:id/items/:itemId/lore — Regenerate lore for a specific item
adminStoryBuilderLoreRouter.post('/plans/:id/items/:itemId/lore', async (req: AuthRequest, res) => {
  try {
    const { id, itemId } = req.params;

    // Load plan from DB
    const result = await queryOLTP<{ plan_json: any; status: string }>(
      'SELECT plan_json, status FROM content_plans WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Plan not found', timestamp: new Date().toISOString() });
      return;
    }

    let plan: ContentPlan;
    try {
      plan = ContentPlanSchema.parse(result.rows[0].plan_json);
    } catch {
      res.status(400).json({ success: false, error: 'Stored plan failed schema validation', timestamp: new Date().toISOString() });
      return;
    }

    // Find the specific item
    const item = plan.items.find(i => i.id === itemId);
    if (!item) {
      res.status(404).json({ success: false, error: 'Item not found in plan', timestamp: new Date().toISOString() });
      return;
    }

    // Check if item has lore_path
    const lorePath = item.fields.lore_path;
    if (!lorePath) {
      res.status(400).json({ success: false, error: 'Item does not have lore_path field', timestamp: new Date().toISOString() });
      return;
    }

    // Gather context and generate lore
    const context = await contentPlanService.gatherContext();
    // Access private provider - we need to export it or use a getter
    const provider = (contentPlanService as any).provider;
    const loreContent = await provider.generateLore(item, context);

    // Write to lore file (overwrite existing)
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const loreRoot = path.resolve(process.cwd(), 'docs', 'lore');
    const fullPath = path.resolve(loreRoot, lorePath);

    // Path safety check
    if (!fullPath.startsWith(loreRoot + path.sep) && fullPath !== loreRoot) {
      res.status(400).json({ success: false, error: 'Invalid lore path', timestamp: new Date().toISOString() });
      return;
    }

    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, loreContent, 'utf-8');

    res.json({
      success: true,
      data: { lorePath, content: loreContent },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/items/:itemId/lore error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to regenerate lore', timestamp: new Date().toISOString() });
  }
});
