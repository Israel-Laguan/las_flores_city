import { queryOLAP } from '../database/connection.js';

export type ShopPurchaseEventData = {
  shop_item_id: string;
  shop_item_name: string;
  price: number;
  currency_type: 'credits' | 'gold_credits';
};

export type IapCompletedEventData = {
  capture_id: string;
  amount_usd: number;
  gold_credits_granted: number;
  reference_id: string;
};

/**
 * Emits a `shop_purchase` event to OLAP after a successful /shop/buy.
 *
 * Fire-and-forget by design: if OLAP is unreachable we log and move on.
 * Per the project rule, OLAP events are emitted AFTER the OLTP commit
 * succeeds but never block the HTTP response on the analytics write.
 */
export async function recordShopPurchaseEvent(
  userId: string,
  data: ShopPurchaseEventData
): Promise<void> {
  try {
    await queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
       VALUES (gen_random_uuid(), $1, 'shop_purchase', $2, 0)`,
      [userId, JSON.stringify(data)]
    );
  } catch (err) {
    console.error('Failed to emit shop_purchase event:', err);
  }
}

/**
 * Emits an `iap_completed` event to OLAP after a successful PayPal webhook.
 *
 * Includes the PayPal capture id (for cross-system tracing) and our own
 * reference_id (the UUID we set at checkout time) so the analytics row
 * can be joined back to the bank_transactions ledger row that carries
 * the same reference_id.
 */
export async function recordIapCompletedEvent(
  userId: string,
  data: IapCompletedEventData
): Promise<void> {
  try {
    await queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
       VALUES (gen_random_uuid(), $1, 'iap_completed', $2, 0)`,
      [userId, JSON.stringify(data)]
    );
  } catch (err) {
    console.error('Failed to emit iap_completed event:', err);
  }
}
