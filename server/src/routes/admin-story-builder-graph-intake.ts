import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ChatMessageSchema, type ChatMessage } from '@las-flores/shared';
import { graphIntakeService, GraphIntakeDisabledError, GraphIntakeValidationError } from '../services/GraphIntakeService.js';
import { isNeo4jEnabled } from '../services/Neo4jClient.js';

export const adminStoryBuilderGraphIntakeRouter = express.Router();

// POST /admin/story-builder/plans/graph-intake — Create a new graph-based plan from a description
adminStoryBuilderGraphIntakeRouter.post('/plans/graph-intake', async (req: AuthRequest, res) => {
  try {
    // Check if Neo4j is enabled first (fast fail)
    if (!isNeo4jEnabled()) {
      res.status(409).json({
        success: false,
        error: 'Neo4j authoring graph is disabled — cannot create graph-based plan. Enable NEO4J_ENABLED first.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { description, messages } = req.body ?? {};

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Description is required and must be a non-empty string',
        timestamp: new Date().toISOString(),
      });
      return;
    }

        // Validate messages if provided. A supplied non-array is a 400; each entry
    // must satisfy ChatMessageSchema (role ∈ user|assistant, content min 1).
    let validatedMessages: ChatMessage[] = [];
    if (messages !== undefined && messages !== null) {
      if (!Array.isArray(messages)) {
        res.status(400).json({
          success: false,
          error: 'messages must be an array when provided',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      for (let i = 0; i < messages.length; i++) {
        const parsed = ChatMessageSchema.safeParse(messages[i]);
        if (!parsed.success) {
          res.status(400).json({
            success: false,
            error: `messages[${i}]: ${parsed.error.issues.map((x) => x.message).join('; ')}`,
            timestamp: new Date().toISOString(),
          });
          return;
        }
        validatedMessages.push(parsed.data);
      }
    }

    const result = await graphIntakeService.createPlanFromDescription(description, validatedMessages);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error instanceof GraphIntakeDisabledError) {
      res.status(409).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (error instanceof GraphIntakeValidationError) {
      res.status(400).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    console.error('[story-builder] POST /plans/graph-intake error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create graph-based plan',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /admin/story-builder/plans/:id/graph-deltas — Get deltas+edges for a graph-based plan
adminStoryBuilderGraphIntakeRouter.get('/plans/:id/graph-deltas', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Plan ID is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { deltas, edges } = await graphIntakeService.getPlanDeltas(id);

    res.json({
      success: true,
      data: { planId: id, deltas, edges },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] GET /plans/:id/graph-deltas error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch graph deltas',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /admin/story-builder/plans/:id/graph-plan — Synthesize a legacy
// ContentPlan from a graph-based plan's deltas+edges so the existing
// (preview/approve/stage/migrate) StoryBuilder steps can consume it. This is
// the compatibility seam for clients that still drive the plan_json review
// UI after M32 moved authoring to the graph.
adminStoryBuilderGraphIntakeRouter.get('/plans/:id/graph-plan', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Plan ID is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const plan = await graphIntakeService.synthesizeLegacyPlan(id);

    if (!plan) {
      res.status(404).json({
        success: false,
        error: 'Plan not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      success: true,
      data: { plan },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] GET /plans/:id/graph-plan error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to synthesize plan from graph deltas',
      timestamp: new Date().toISOString(),
    });
  }
});

// DELETE /admin/story-builder/plans/:id/graph-intake — Discard a graph-based plan and its deltas
adminStoryBuilderGraphIntakeRouter.delete('/plans/:id/graph-intake', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Plan ID is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // When Neo4j is disabled, discardPlan is a no-op — returning 200 would
    // falsely claim the plan was discarded while its row and deltas remain
    // intact. Fail closed with 409 unless the graph is available to discard.
    if (!isNeo4jEnabled()) {
      res.status(409).json({
        success: false,
        error: 'Neo4j authoring graph is disabled — cannot discard graph-based plan. Enable NEO4J_ENABLED first.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    await graphIntakeService.discardPlan(id);

    res.json({
      success: true,
      data: { planId: id, message: 'Plan and its deltas discarded' },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] DELETE /plans/:id/graph-intake error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to discard plan',
      timestamp: new Date().toISOString(),
    });
  }
});
