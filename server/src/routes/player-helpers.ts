import { queryOLTP, queryOLAP, withOLTPTransaction } from '../database/connection.js';

export function userStateCacheKey(userId: string): string {
  return `user:state:${userId}`;
}

export async function assemblePlayerState(userId: string) {
  const result = await queryOLTP(
    `SELECT
      u.id,
      u.username,
      u.current_location_id,
      u.time_blocks,
      u.credits,
      u.gold_credits,
      u.current_node_id,
      u.current_day,
      u.alignment,
      u.last_login,
      u.created_at,
      u.updated_at,
      ue.is_nsfw_unlocked,
      ue.patreon_tier
    FROM users u
    LEFT JOIN user_entitlements ue ON u.id = ue.user_id
    WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    userId: row.id,
    username: row.username,
    locationId: row.current_location_id,
    timeBlocks: row.time_blocks,
    credits: row.credits,
    goldCredits: row.gold_credits,
    currentNodeId: row.current_node_id,
    currentDay: row.current_day,
    // Meta-plot finale alignment. Default 'neutral'
    // covers pre-migration users (the column is NOT NULL DEFAULT
    // 'neutral' in OLTP, so this fallback shouldn't fire, but
    // keeping it for type safety).
    alignment: row.alignment || 'neutral',
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isNsfwUnlocked: row.is_nsfw_unlocked || false,
    patreonTier: row.patreon_tier || 'none',
  };
}

export function validateUpdateField(value: any, name: string, min?: number, max?: number): { valid: boolean; error?: string } {
  if (value === undefined) return { valid: true };

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { valid: false, error: `${name} must be an integer` };
  }

  if (min !== undefined && value < min) {
    return { valid: false, error: `${name} cannot be negative` };
  }

  if (max !== undefined && value > max) {
    return { valid: false, error: `${name} must be between ${min} and ${max}` };
  }

  return { valid: true };
}

export function buildUpdateQuery(updates: { time_blocks?: number; credits?: number; gold_credits?: number; current_location_id?: string; current_node_id?: string }): { sql: string; values: any[] } {
  const updateClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.time_blocks !== undefined) {
    updateClauses.push(`time_blocks = $${paramIndex++}`);
    values.push(updates.time_blocks);
  }

  if (updates.credits !== undefined) {
    updateClauses.push(`credits = $${paramIndex++}`);
    values.push(updates.credits);
  }

  if (updates.gold_credits !== undefined) {
    updateClauses.push(`gold_credits = $${paramIndex++}`);
    values.push(updates.gold_credits);
  }

  if (updates.current_location_id !== undefined) {
    updateClauses.push(`current_location_id = $${paramIndex++}`);
    values.push(updates.current_location_id);
  }

  if (updates.current_node_id !== undefined) {
    updateClauses.push(`current_node_id = $${paramIndex++}`);
    values.push(updates.current_node_id);
  }

  return { sql: updateClauses.join(', '), values };
}

export const MOVEMENT_TB_COST = 1;

export type MoveResult =
  | { success: true; from_location_id: string; to_location_id: string; tb_cost: number; time_blocks_remaining: number }
  | { success: false; error: 'already_here' | 'exhausted' };

export async function performMoveTransaction(
  userId: string,
  targetLocationId: string
): Promise<MoveResult> {
  return withOLTPTransaction(async (client) => {
    const lockResult = await client.query(
      'SELECT time_blocks, current_location_id FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (lockResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const currentTB = lockResult.rows[0].time_blocks;
    const fromLocationId = lockResult.rows[0].current_location_id;

    if (fromLocationId === targetLocationId) {
      return { success: false, error: 'already_here' };
    }

    if (currentTB < MOVEMENT_TB_COST) {
      return { success: false, error: 'exhausted' };
    }

    await client.query(
      'UPDATE users SET time_blocks = time_blocks - $1, current_location_id = $2 WHERE id = $3',
      [MOVEMENT_TB_COST, targetLocationId, userId]
    );

    const newResult = await client.query(
      'SELECT time_blocks FROM users WHERE id = $1',
      [userId]
    );

    return {
      success: true,
      from_location_id: fromLocationId,
      to_location_id: targetLocationId,
      tb_cost: MOVEMENT_TB_COST,
      time_blocks_remaining: newResult.rows[0].time_blocks,
    };
  });
}

export async function emitMoveAnalytics(
  userId: string,
  result: { from_location_id: string; to_location_id: string; tb_cost: number }
): Promise<void> {
  try {
    await queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
       VALUES (gen_random_uuid(), $1, 'move', $2, $3)`,
      [
        userId,
        JSON.stringify({
          from_location_id: result.from_location_id,
          to_location_id: result.to_location_id,
        }),
        result.tb_cost,
      ]
    );
  } catch (eventError) {
    console.error('Failed to emit move event to OLAP:', eventError);
  }
}

export const RENT_AMOUNT = 10;

export type SleepResult = {
  time_blocks: number;
  credits: number;
  current_day: number;
  credits_deducted: number;
  previous_day: number;
  rent_paid: true;
  overdraft: boolean;
};

export async function performSleepTransaction(
  userId: string
): Promise<SleepResult> {
  return withOLTPTransaction(async (client) => {
    const lockResult = await client.query(
      'SELECT time_blocks, credits, current_day FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (lockResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const previousDay = lockResult.rows[0].current_day;
    const previousCredits = lockResult.rows[0].credits;

    await client.query(
      `UPDATE users SET
        time_blocks = 48,
        current_day = current_day + 1,
        current_node_id = NULL
      WHERE id = $1`,
      [userId]
    );

    await client.query(
      'UPDATE users SET credits = credits - $1 WHERE id = $2',
      [RENT_AMOUNT, userId]
    );

    const newResult = await client.query(
      'SELECT time_blocks, credits, current_day FROM users WHERE id = $1',
      [userId]
    );

    const newCredits = newResult.rows[0].credits;

    await client.query(
      `INSERT INTO bank_transactions (user_id, transaction_type, amount, description, balance_after, reference_type)
       VALUES ($1, 'debit', $2, 'Daily Rent - Nakamura & Morgan LTD', $3, 'rent')`,
      [userId, RENT_AMOUNT, newCredits]
    );

    return {
      time_blocks: newResult.rows[0].time_blocks,
      credits: newCredits,
      current_day: newResult.rows[0].current_day,
      credits_deducted: RENT_AMOUNT,
      previous_day: previousDay,
      rent_paid: true,
      overdraft: newCredits < 0,
    };
  });
}

export async function emitSleepAnalytics(
  userId: string,
  result: SleepResult
): Promise<void> {
  try {
    await queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
       VALUES (gen_random_uuid(), $1, 'sleep', $2, 0)`,
      [
        userId,
        JSON.stringify({
          completed_day: result.previous_day,
          credits_deducted: result.credits_deducted,
          new_day: result.current_day,
          overdraft: result.overdraft,
        }),
      ]
    );
  } catch (eventError) {
    console.error('Failed to emit sleep event to OLAP:', eventError);
  }
}