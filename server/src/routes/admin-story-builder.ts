import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { adminStoryBuilderPlansRouter } from './admin-story-builder-plans.js';
import { adminStoryBuilderActionsRouter } from './admin-story-builder-actions.js';
import { adminStoryBuilderLoreRouter } from './admin-story-builder-lore.js';
import { adminStoryBuilderGraphIntakeRouter } from './admin-story-builder-graph-intake.js';

export const adminStoryBuilderRouter = express.Router();

adminStoryBuilderRouter.use(authAndAdminMiddleware);

// Mount plan CRUD routes
adminStoryBuilderRouter.use(adminStoryBuilderPlansRouter);

// Mount action routes (preview, stage, migrate, retry, verify)
adminStoryBuilderRouter.use(adminStoryBuilderActionsRouter);

// Mount lore regeneration routes
adminStoryBuilderRouter.use(adminStoryBuilderLoreRouter);

// Mount graph-based intake routes (M32)
adminStoryBuilderRouter.use(adminStoryBuilderGraphIntakeRouter);
