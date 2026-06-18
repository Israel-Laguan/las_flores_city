import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { queryOLTP } from '../database/connection.js';
import { getCache, setCache } from '../database/redis.js';
import { MediaSigner } from '../services/MediaSigner.js';

export const vaultRouter = Router();

interface VaultRow {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  media_path: string;
  item_type: string;
  requires_signed_url: boolean;
  unlocked_at: string;
}

vaultRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.userId!;

  try {
    // Resolve entitlement first so the cache key bifurcates SFW vs NSFW users,
    // preventing cache poisoning of premium_cg metadata across entitlement states.
    const entRes = await queryOLTP<{ is_nsfw_unlocked: boolean | null }>(
      `SELECT is_nsfw_unlocked FROM user_entitlements WHERE user_id = $1`,
      [userId]
    );
    const isNsfwUnlocked = entRes.rows[0]?.is_nsfw_unlocked ?? false;
    const cacheKey = `user:vault:${userId}:nsfw:${isNsfwUnlocked}`;

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
        v.id, v.title, v.description, v.thumbnail_url, v.media_path,
        v.item_type, v.requires_signed_url,
        pv.unlocked_at
      FROM player_vault pv
      JOIN vault_items v ON pv.item_id = v.id
      WHERE pv.user_id = $1
      ORDER BY pv.unlocked_at DESC
    `;
    const { rows } = await queryOLTP<VaultRow>(query, [userId]);

    const items = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      mediaPath: row.media_path,
      itemType: row.item_type,
      requiresSignedUrl: row.requires_signed_url,
      unlockedAt: row.unlocked_at,
    }));

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

  try {
    const query = `
      SELECT
        v.media_path,
        v.item_type,
        v.requires_signed_url,
        ue.is_nsfw_unlocked
      FROM vault_items v
      JOIN player_vault pv ON v.id = pv.item_id
      LEFT JOIN user_entitlements ue ON ue.user_id = pv.user_id
      WHERE pv.user_id = $1 AND pv.item_id = $2
    `;
    const { rows } = await queryOLTP<{
      media_path: string;
      item_type: string;
      requires_signed_url: boolean;
      is_nsfw_unlocked: boolean | null;
    }>(query, [userId, itemId]);

    if (rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED_OR_NOT_OWNED',
        timestamp: new Date().toISOString(),
      });
    }

    const { media_path, item_type, requires_signed_url, is_nsfw_unlocked } = rows[0];

    if (item_type === 'premium_cg' && !is_nsfw_unlocked) {
      return res.status(403).json({
        success: false,
        error: 'ENTITLEMENT_REVOKED',
        timestamp: new Date().toISOString(),
      });
    }

    const shouldSign = requires_signed_url || item_type === 'premium_cg';
    const url = shouldSign
      ? MediaSigner.generateSecureUrl(media_path)
      : `${process.env.CDN_BASE_URL || ''}${media_path.startsWith('/') ? media_path : `/${media_path}`}`;

    res.json({
      success: true,
      data: { url },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
