import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { ContentPlanSchema } from '@las-flores/shared';
import { contentPlanService } from '../services/ContentPlanService.js';
import { executePlan } from '../services/StoryBuilderOrchestrator.js';

export const adminStoryBuilderRouter = express.Router();

adminStoryBuilderRouter.use(authAndAdminMiddleware);

// POST /admin/story-builder/plan
// Body: { description: string }
// Returns: { success: true, data: { plan: ContentPlan } }
adminStoryBuilderRouter.post('/plan', async (req: AuthRequest, res) => {
  try {
    const { description } = req.body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'description is required and must be a non-empty string',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const plan = await contentPlanService.parseDescription(description.trim(), req.userId!);

    res.json({
      success: true,
      data: { plan },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plan error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate plan',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /admin/story-builder/execute
// Body: { plan: ContentPlan }
// Returns: { success: true, data: ExecutionResult }
adminStoryBuilderRouter.post('/execute', async (req, res) => {
  try {
    const { plan: rawPlan } = req.body;

    if (!rawPlan) {
      res.status(400).json({
        success: false,
        error: 'plan is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const plan = ContentPlanSchema.parse(rawPlan);
    const result = await executePlan(plan);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /execute error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute plan',
      timestamp: new Date().toISOString(),
    });
  }
});
