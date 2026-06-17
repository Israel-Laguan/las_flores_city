import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { queryOLTP } from '../database/connection.js';
import { getCache, setCache } from '../database/redis.js';
import { resolveMediaUrl, verifyCdnProxySignature, fetchCdnMedia } from '../services/StorageService.js';

export const vaultRouter = Router();

interface VaultRow {
  id: string;
  title: string;
  description: string;
  media_url: string;
  item_type: string;
  requires_signed_url: boolean;
  unlocked_at: string;
}

vaultRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const cacheKey = `user:vault:${userId}`;

  try {
    const cachedVault = await getCache<unknown[]>(cacheKey);
    if (cachedVault) {
      return res.json({
        success: true,
        data: cachedVault,
        timestamp: new Date().toISOString(),
      });
    }

    const query = `
      SELECT
        v.id, v.title, v.description, v.media_url, v.item_type,
        v.requires_signed_url,
        pv.unlocked_at
      FROM player_vault pv
      JOIN vault_items v ON pv.item_id = v.id
      WHERE pv.user_id = $1
      ORDER BY pv.unlocked_at DESC
    `;
    const { rows } = await queryOLTP<VaultRow>(query, [userId]);

    const items = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        mediaUrl: await resolveMediaUrl(row.media_url, {
          requiresSignedUrl: row.requires_signed_url,
          itemId: row.id,
          userId,
        }),
        itemType: row.item_type,
        unlockedAt: row.unlocked_at,
      }))
    );

    await setCache(cacheKey, items, 300);

    res.json({
      success: true,
      data: items,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

vaultRouter.get('/media/:itemId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;
  const { itemId } = req.params;
  const expires = parseInt(req.query.expires as string, 10);
  const sig = req.query.sig as string;

  if (!expires || !sig) {
    return res.status(400).json({
      success: false,
      error: 'Missing signature parameters',
      timestamp: new Date().toISOString(),
    });
  }

  if (!verifyCdnProxySignature(itemId, userId, expires, sig)) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired signature',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const itemResult = await queryOLTP(
      `SELECT v.media_url
       FROM vault_items v
       JOIN player_vault pv ON pv.item_id = v.id
       WHERE v.id = $1 AND pv.user_id = $2 AND v.requires_signed_url = true`,
      [itemId, userId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Vault item not found or not unlocked',
        timestamp: new Date().toISOString(),
      });
    }

    const { buffer, contentType } = await fetchCdnMedia(itemResult.rows[0].media_url);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});
