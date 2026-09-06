/* eslint-disable max-lines-per-function */
import express from 'express';
import { adminStoryBuilderPlansTemplatesRouter } from './admin-story-builder-plans-templates.js';
import { adminStoryBuilderPlansCrudRouter } from './admin-story-builder-plans-crud.js';
import { adminStoryBuilderPlansUpdatesRouter } from './admin-story-builder-plans-updates.js';

export const adminStoryBuilderPlansRouter = express.Router();

// Mount the split route files
adminStoryBuilderPlansRouter.use(adminStoryBuilderPlansTemplatesRouter);
adminStoryBuilderPlansRouter.use(adminStoryBuilderPlansCrudRouter);
adminStoryBuilderPlansRouter.use(adminStoryBuilderPlansUpdatesRouter);