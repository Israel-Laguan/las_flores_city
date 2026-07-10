import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import type { AuthRequest } from '../middleware/auth.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { signMinioUrl } from '../services/StorageService.js';

export const adminAssetRouter = express.Router();

adminAssetRouter.use(authAndAdminMiddleware);

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

adminAssetRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const assetPath = req.query.path;
    if (!assetPath || typeof assetPath !== 'string') {
      res.status(400).json({ success: false, error: 'path query parameter is required', timestamp: new Date().toISOString() });
      return;
    }

    if (assetPath.length > 500) {
      res.status(400).json({ success: false, error: 'Asset path too long', timestamp: new Date().toISOString() });
      return;
    }

    const normalizedPath = path.normalize(assetPath);
    if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
      res.status(403).json({ success: false, error: 'Access denied', timestamp: new Date().toISOString() });
      return;
    }

    const ext = path.extname(normalizedPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      res.status(400).json({ success: false, error: 'Unsupported file type', timestamp: new Date().toISOString() });
      return;
    }

    const localAssetRoot = path.resolve(process.cwd(), 'content/assets');
    const localPath = path.join(localAssetRoot, normalizedPath);

    try {
      await fs.access(localPath);
      const imageBuffer = await fs.readFile(localPath);
      res.setHeader('Content-Type', getContentType(normalizedPath));
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(imageBuffer);
      return;
    } catch {
      // Local file not found, try MinIO
    }

    const minioKey = `las-flores/${normalizedPath}`;
    try {
      const signedUrl = await signMinioUrl(minioKey, 300);
      const resp = await fetch(signedUrl, { signal: AbortSignal.timeout(15000) });
      if (resp.ok) {
        const imageBuffer = Buffer.from(await resp.arrayBuffer());
        res.setHeader('Content-Type', getContentType(normalizedPath));
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(imageBuffer);
        return;
      }
    } catch {
      // MinIO fetch failed
    }

    res.status(404).json({ success: false, error: 'Asset not found', timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[admin-asset] GET / error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch asset',
      timestamp: new Date().toISOString(),
    });
  }
});
