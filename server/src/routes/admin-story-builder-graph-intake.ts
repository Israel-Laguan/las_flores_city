import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
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

    // Validate messages if provided
    const validatedMessages = messages && Array.isArray(messages) ? messages : [];

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
