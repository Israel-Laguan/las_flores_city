import express from 'express';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { getPromptCatalog } from './assets.helpers.js';
import {
  handleListAssets,
  handleListAllAssets,
  handleApproveBase,
  handlePublishAsset,
  handleGetImage,
  handleDeleteBase,
  handleDeleteVariant,
} from './assets.handlers.js';
import {
  handleGenerateBases,
  handleGenerateVariants,
} from './assets.generation.handlers.js';

export const assetsRouter = express.Router();

assetsRouter.use(authAndAdminMiddleware);

const generateRateLimiter = createRateLimiter({
  windowSeconds: 60,
  maxRequests: 30,
  keyPrefix: 'rl:asset-gen'
});

assetsRouter.get('/prompt-catalog', async (req, res, next) => {
  try {
    const data = await getPromptCatalog();
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

assetsRouter.post('/generate-bases', generateRateLimiter, handleGenerateBases);
assetsRouter.post('/generate-variants', generateRateLimiter, handleGenerateVariants);
assetsRouter.get('/list', handleListAssets);
assetsRouter.get('/list-all', handleListAllAssets);
assetsRouter.post('/approve-base', handleApproveBase);
assetsRouter.post('/publish', handlePublishAsset);
assetsRouter.get('/image/:id', handleGetImage);
assetsRouter.delete('/bases/:id', handleDeleteBase);
assetsRouter.delete('/variants/:id', handleDeleteVariant);