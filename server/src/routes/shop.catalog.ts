import express from 'express';
import { type ShopItem } from '@las-flores/shared';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { queryOLTP } from '../database/connection.js';
import { getCache, setCache } from '../database/redis.js';

const CATALOG_CACHE_TTL_SECONDS = 300;

export function dbRowToShopItem(row: any): ShopItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    item_type: row.item_type,
    price: row.price,
    currency_type: row.currency_type,
    asset_url: row.asset_url,
    is_active: row.is_active,
  };
}

export const shopCatalogRouter = express.Router();

// ============================================================
// GET /shop/catalog
// Returns active shop items. Cached in Redis for 5 minutes.
// ============================================================
shopCatalogRouter.get('/catalog', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const cacheKey = 'shop:catalog:active';
    const cached = await getCache<ShopItem[]>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached, timestamp: new Date().toISOString() });
      return;
    }

    const result = await queryOLTP(
      `SELECT id, name, description, item_type, price, currency_type, asset_url, is_active
       FROM shop_items
       WHERE is_active = TRUE
       ORDER BY item_type, price`,
      []
    );

    const items = result.rows.map(dbRowToShopItem);
    await setCache(cacheKey, items, CATALOG_CACHE_TTL_SECONDS);

    res.json({ success: true, data: items, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});
