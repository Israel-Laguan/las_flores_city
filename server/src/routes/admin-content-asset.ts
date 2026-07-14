import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { validateContentPath } from './admin-content.helpers.js';
import { assignAsset } from '../services/ContentAssetService.js';

export const adminContentAssetRouter = express.Router();
adminContentAssetRouter.use(authAndAdminMiddleware);

adminContentAssetRouter.post('/assign-asset', async (req, res) => {
  try {
    const { contentPath, fieldPath, assetUrl } = req.body;

    if (!contentPath || typeof contentPath !== 'string') {
      res.status(400).json({ success: false, error: 'Missing required field: contentPath', timestamp: new Date().toISOString() });
      return;
    }
    if (!contentPath.endsWith('.yaml')) {
      res.status(400).json({ success: false, error: 'contentPath must end with .yaml', timestamp: new Date().toISOString() });
      return;
    }
    if (!fieldPath || typeof fieldPath !== 'string') {
      res.status(400).json({ success: false, error: 'Missing required field: fieldPath', timestamp: new Date().toISOString() });
      return;
    }
    if (!assetUrl || typeof assetUrl !== 'string') {
      res.status(400).json({ success: false, error: 'Missing required field: assetUrl', timestamp: new Date().toISOString() });
      return;
    }

    const pathCheck = validateContentPath(contentPath);
    if (!pathCheck.valid) {
      res.status(400).json({ success: false, error: pathCheck.reason, timestamp: new Date().toISOString() });
      return;
    }

    const result = await assignAsset(contentPath, fieldPath, assetUrl);
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('File not found')) {
      res.status(404).json({ success: false, error: message, timestamp: new Date().toISOString() });
      return;
    }
    const isValidation = message.includes('Path traversal') || message.includes('Invalid field path') || message.includes('Invalid YAML');
    console.error('[admin-content-asset] POST /assign-asset error:', error);
    res.status(isValidation ? 400 : 500).json({
      success: false,
      error: isValidation ? message : 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});
