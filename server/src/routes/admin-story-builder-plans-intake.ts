import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ChatMessageSchema, type ChatMessage } from '@las-flores/shared';
import { graphIntakeService, GraphIntakeDisabledError, GraphIntakeValidationError } from '../services/GraphIntakeService.js';
import { isNeo4jEnabled } from '../services/Neo4jClient.js';

export const adminStoryBuilderPlansIntakeRouter = express.Router();

// POST /admin/story-builder/plans/intake — Create a new graph-based plan from a description
// This is the HTTP mirror of the validated CLI intake flow (npm run plan:intake).
// It stops at `proposed`: it creates a reviewable AI plan and graph deltas, but never
// stages, migrates, or solidifies.
adminStoryBuilderPlansIntakeRouter.post('/plans/intake', async (req: AuthRequest, res) => {
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

    // Validate description
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

    const result = await graphIntakeService.createPlanFromDescription(
      description,
      validatedMessages,
      req.userId,
    );

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

    console.error('[story-builder] POST /plans/intake error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create plan',
      timestamp: new Date().toISOString(),
    });
  }
});
