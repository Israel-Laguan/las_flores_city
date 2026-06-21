import express, { type Response } from 'express';
import {
  ShopPurchaseRequestSchema,
  EquipRequestSchema,
  type ShopItem,
  type PlayerInventoryItem,
} from '@las-flores/shared';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { queryOLTP, queryOLAP, withOLTPTransaction } from '../database/connection.js';
import { getCache, setCache, deleteCache } from '../database/redis.js';
import { userStateCacheKey } from './player-helpers.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { recordIapCompletedEvent, recordShopPurchaseEvent } from '../services/MarketplaceEvents.js';

export const shopRouter = express.Router();

const CATALOG_CACHE_TTL_SECONDS = 300;
const INVENTORY_CACHE_TTL_SECONDS = 60;

function inventoryCacheKey(userId: string): string {
  return `user:inventory:${userId}`;
}

function dbRowToShopItem(row: any): ShopItem {
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

function dbRowToInventoryItem(row: any): PlayerInventoryItem {
  return {
    id: row.id,
    user_id: row.user_id,
    shop_item_id: row.shop_item_id,
    acquired_via: row.acquired_via,
    reference_id: row.reference_id ?? undefined,
    acquired_at: row.acquired_at,
    item: dbRowToShopItem({
      id: row.item_id,
      name: row.item_name,
      description: row.item_description,
      item_type: row.item_type,
      price: row.item_price,
      currency_type: row.item_currency_type,
      asset_url: row.item_asset_url,
      is_active: row.item_is_active,
    }),
  };
}

type ShopPurchaseErrorCode =
  | 'ITEM_NOT_FOUND'
  | 'ALREADY_OWNED'
  | 'INSUFFICIENT_FUNDS'
  | 'USER_NOT_FOUND';

type ShopPurchaseResult =
  | { error: ShopPurchaseErrorCode }
  | { inventory: PlayerInventoryItem; item: ShopItem; newBalance: number };

const SHOP_PURCHASE_STATUS: Record<ShopPurchaseErrorCode, number> = {
  ITEM_NOT_FOUND: 404,
  ALREADY_OWNED: 409,
  INSUFFICIENT_FUNDS: 402,
  USER_NOT_FOUND: 404,
};

function sendShopError(res: Response, errorCode: ShopPurchaseErrorCode): void {
  res.status(SHOP_PURCHASE_STATUS[errorCode]).json({
    success: false,
    error: errorCode,
    timestamp: new Date().toISOString(),
  });
}

async function buyShopItem(userId: string, shopItemId: string): Promise<ShopPurchaseResult> {
  return withOLTPTransaction(async (client) => {
    const itemRes = await client.query(
      `SELECT id, name, description, item_type, price, currency_type, asset_url, is_active
       FROM shop_items
       WHERE id = $1
       FOR UPDATE`,
      [shopItemId]
    );
    if (itemRes.rows.length === 0 || !itemRes.rows[0].is_active) {
      return { error: 'ITEM_NOT_FOUND' as const };
    }
    const item = dbRowToShopItem(itemRes.rows[0]);

    const ownRes = await client.query(
      `SELECT 1 FROM player_inventory WHERE user_id = $1 AND shop_item_id = $2`,
      [userId, shopItemId]
    );
    if (ownRes.rows.length > 0) {
      return { error: 'ALREADY_OWNED' as const };
    }

    const currencyCol = item.currency_type === 'gold_credits' ? 'gold_credits' : 'credits';
    const newBalance = await PlayerStateRepository.chargeCurrency(
      client,
      userId,
      currencyCol,
      item.price
    );
    if (newBalance === null) {
      // getBalances returned null (no player_states row) OR insufficient funds.
      // Distinguish: if the row exists but funds insufficient -> INSUFFICIENT_FUNDS.
      const balances = await PlayerStateRepository.getBalances(client, userId);
      if (!balances) {
        return { error: 'USER_NOT_FOUND' as const };
      }
      return { error: 'INSUFFICIENT_FUNDS' as const };
    }

    await client.query(
      `INSERT INTO bank_transactions
         (user_id, amount, currency_type, transaction_type, description, balance_after, reference_type, reference_id)
       VALUES ($1, $2, $3, 'debit', $4, $5, 'shop_purchase', $6)`,
      [
        userId,
        -item.price,
        item.currency_type === 'gold_credits' ? 'gold_credits' : 'creds',
        `Shop purchase: ${item.name}`,
        newBalance,
        shopItemId,
      ]
    );

    const invRes = await client.query(
      `INSERT INTO player_inventory (user_id, shop_item_id, acquired_via, reference_id)
       VALUES ($1, $2, 'purchase', $3)
       RETURNING id, user_id, shop_item_id, acquired_via, reference_id, acquired_at`,
      [userId, shopItemId, shopItemId]
    );
    const inventory = dbRowToInventoryItem({
      ...invRes.rows[0],
      item_id: item.id,
      item_name: item.name,
      item_description: item.description,
      item_type: item.item_type,
      item_price: item.price,
      item_currency_type: item.currency_type,
      item_asset_url: item.asset_url,
      item_is_active: item.is_active,
    });

    return { inventory, item, newBalance };
  });
}

// ============================================================
// GET /shop/catalog
// Returns active shop items. Cached in Redis for 5 minutes.
// ============================================================
shopRouter.get('/catalog', authMiddleware, async (req: AuthRequest, res, next) => {
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

// ============================================================
// GET /shop/inventory
// Returns the player's owned shop items, denormalised with the
// shop_items columns so the UI doesn't need a second round-trip.
// ============================================================
shopRouter.get('/inventory', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!;
    const cacheKey = inventoryCacheKey(userId);
    const cached = await getCache<PlayerInventoryItem[]>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached, timestamp: new Date().toISOString() });
      return;
    }

    const result = await queryOLTP(
      `SELECT
         inv.id,
         inv.user_id,
         inv.shop_item_id,
         inv.acquired_via,
         inv.reference_id,
         inv.acquired_at,
         si.id          AS item_id,
         si.name        AS item_name,
         si.description AS item_description,
         si.item_type,
         si.price       AS item_price,
         si.currency_type AS item_currency_type,
         si.asset_url   AS item_asset_url,
         si.is_active   AS item_is_active
       FROM player_inventory inv
       JOIN shop_items si ON si.id = inv.shop_item_id
       WHERE inv.user_id = $1
       ORDER BY inv.acquired_at DESC`,
      [userId]
    );

    const items = result.rows.map(dbRowToInventoryItem);
    await setCache(cacheKey, items, INVENTORY_CACHE_TTL_SECONDS);

    res.json({ success: true, data: items, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// POST /shop/buy
// Validates balance + ownership, deducts the price, grants the
// item, and emits a shop_purchase event to OLAP.
//
// Currency handling:
//   - gold_credits: existing CHECK (gold_credits >= 0) gives
//     free overdraft protection via PG 23514.
//   - credits: NO CHECK constraint (overdraft allowed by design
//     for rent), so we add an explicit app-level guard inside
//     the transaction. The route does NOT add a CHECK because
//     rent must remain able to push credits negative.
// ============================================================
shopRouter.post('/buy', authMiddleware, async (req: AuthRequest, res, next) => {
  const parse = ShopPurchaseRequestSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Invalid request body', timestamp: new Date().toISOString() });
    return;
  }
  const { shop_item_id } = parse.data;
  const userId = req.userId!;

  try {
    const result = await buyShopItem(userId, shop_item_id);

    if ('error' in result) {
      sendShopError(res, result.error);
      return;
    }

    await deleteCache(userStateCacheKey(userId));
    await deleteCache(inventoryCacheKey(userId));

    await recordShopPurchaseEvent(userId, {
      shop_item_id: result.item.id,
      shop_item_name: result.item.name,
      price: result.item.price,
      currency_type: result.item.currency_type,
    });

    res.json({
      success: true,
      data: {
        inventory_item: result.inventory,
        new_balance: result.newBalance,
        currency_type: result.item.currency_type,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error.code === '23514') {
      sendShopError(res, 'INSUFFICIENT_FUNDS');
      return;
    }
    if (error.code === '23505') {
      sendShopError(res, 'ALREADY_OWNED');
      return;
    }
    next(error);
  }
});

// ============================================================
// POST /shop/equip
// Sets equipped_theme_id or equipped_border_id on the player's
// public_profile. Validates that the player owns the item.
// ============================================================
shopRouter.post('/equip', authMiddleware, async (req: AuthRequest, res, next) => {
  const parse = EquipRequestSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Invalid request body', timestamp: new Date().toISOString() });
    return;
  }
  const { slot, shop_item_id } = parse.data;
  const userId = req.userId!;

  try {
    if (shop_item_id !== null) {
      const itemRes = await queryOLTP(
        `SELECT si.item_type
         FROM player_inventory inv
         JOIN shop_items si ON si.id = inv.shop_item_id
         WHERE inv.user_id = $1 AND inv.shop_item_id = $2`,
        [userId, shop_item_id]
      );
      if (itemRes.rows.length === 0) {
        res.status(403).json({ success: false, error: 'ITEM_NOT_OWNED', timestamp: new Date().toISOString() });
        return;
      }
      const requiredType = slot === 'theme' ? 'ui_theme' : 'avatar_border';
      if (itemRes.rows[0].item_type !== requiredType) {
        res.status(400).json({ success: false, error: 'WRONG_SLOT_TYPE', timestamp: new Date().toISOString() });
        return;
      }
    }

    const column = slot === 'theme' ? 'equipped_theme_id' : 'equipped_border_id';

    await queryOLTP(
      `INSERT INTO public_profiles (user_id, ${column})
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET ${column} = EXCLUDED.${column}, updated_at = NOW()`,
      [userId, shop_item_id]
    );

    res.json({ success: true, data: { slot, shop_item_id }, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /shop/profile/:userId
// Returns a player's public profile (display name, equipped
// cosmetics, badges). Public for the leaderboard "look at this
// player" view.
// ============================================================
shopRouter.get('/profile/:userId', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { userId: targetUserId } = req.params;
    if (!targetUserId) {
      res.status(400).json({ success: false, error: 'Missing userId', timestamp: new Date().toISOString() });
      return;
    }

    const result = await queryOLTP(
      `SELECT
         u.id           AS user_id,
         u.username     AS username,
         u.display_name AS display_name,
         pp.badges      AS badges,
         theme.id          AS theme_id,
         theme.name        AS theme_name,
         theme.description AS theme_description,
         theme.item_type   AS theme_item_type,
         theme.price       AS theme_price,
         theme.currency_type AS theme_currency_type,
         theme.asset_url   AS theme_asset_url,
         theme.is_active   AS theme_is_active,
         border.id          AS border_id,
         border.name        AS border_name,
         border.description AS border_description,
         border.item_type   AS border_item_type,
         border.price       AS border_price,
         border.currency_type AS border_currency_type,
         border.asset_url   AS border_asset_url,
         border.is_active   AS border_is_active
       FROM users u
       LEFT JOIN public_profiles pp ON pp.user_id = u.id
       LEFT JOIN shop_items theme ON theme.id = pp.equipped_theme_id
       LEFT JOIN shop_items border ON border.id = pp.equipped_border_id
       WHERE u.id = $1`,
      [targetUserId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'USER_NOT_FOUND', timestamp: new Date().toISOString() });
      return;
    }

    const row = result.rows[0];
    const profile = {
      user_id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      equipped_theme: row.theme_id ? dbRowToShopItem({
        id: row.theme_id,
        name: row.theme_name,
        description: row.theme_description,
        item_type: row.theme_item_type,
        price: row.theme_price,
        currency_type: row.theme_currency_type,
        asset_url: row.theme_asset_url,
        is_active: row.theme_is_active,
      }) : null,
      equipped_border: row.border_id ? dbRowToShopItem({
        id: row.border_id,
        name: row.border_name,
        description: row.border_description,
        item_type: row.border_item_type,
        price: row.border_price,
        currency_type: row.border_currency_type,
        asset_url: row.border_asset_url,
        is_active: row.border_is_active,
      }) : null,
      badges: row.badges || [],
    };

    res.json({ success: true, data: profile, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// recordIapCompletedEvent is imported to keep the dep graph
// honest for the test suite; the PayPal webhook calls it.
void recordIapCompletedEvent;
