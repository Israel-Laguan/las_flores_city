import { type Response } from 'express';
import {
  type ShopItem,
  type PlayerInventoryItem,
} from '@las-flores/shared';
import { withOLTPTransaction } from '../database/connection.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { dbRowToShopItem } from './shop.catalog.js';

export type ShopPurchaseErrorCode =
  | 'ITEM_NOT_FOUND'
  | 'ALREADY_OWNED'
  | 'INSUFFICIENT_FUNDS'
  | 'USER_NOT_FOUND';

export type ShopPurchaseResult =
  | { error: ShopPurchaseErrorCode }
  | { inventory: PlayerInventoryItem; item: ShopItem; newBalance: number };

export const SHOP_PURCHASE_STATUS: Record<ShopPurchaseErrorCode, number> = {
  ITEM_NOT_FOUND: 404,
  ALREADY_OWNED: 409,
  INSUFFICIENT_FUNDS: 402,
  USER_NOT_FOUND: 404,
};

export function sendShopError(res: Response, errorCode: ShopPurchaseErrorCode): void {
  res.status(SHOP_PURCHASE_STATUS[errorCode]).json({
    success: false,
    error: errorCode,
    timestamp: new Date().toISOString(),
  });
}

export async function buyShopItem(userId: string, shopItemId: string): Promise<ShopPurchaseResult> {
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
