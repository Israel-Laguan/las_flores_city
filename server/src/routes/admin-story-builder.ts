import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { adminStoryBuilderMetaRouter } from './admin-story-builder-meta.js';
import { adminStoryBuilderPlansRouter } from './admin-story-builder-plans.js';
import { adminStoryBuilderActionsRouter } from './admin-story-builder-actions.js';
import { adminStoryBuilderLoreRouter } from './admin-story-builder-lore.js';

export const adminStoryBuilderRouter = express.Router();

adminStoryBuilderRouter.use(authAndAdminMiddleware);

// Mount plan CRUD routes
adminStoryBuilderRouter.use(adminStoryBuilderPlansRouter);

// Mount action routes (plan, refine, preview, stage, migrate, retry)
adminStoryBuilderRouter.use(adminStoryBuilderActionsRouter);

// Mount lore regeneration routes
adminStoryBuilderRouter.use(adminStoryBuilderLoreRouter);

// Mount secondary handlers (execute, version history, templates)
adminStoryBuilderRouter.use(adminStoryBuilderMetaRouter);
