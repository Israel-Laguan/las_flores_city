import { queryOLTP, queryOLAP, withOLTPTransaction } from '../database/connection.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';

export function userStateCacheKey(userId: string): string {
  return `user:state:${userId}`;
}

export async function assemblePlayerState(userId: string) {
  const row = await PlayerStateRepository.getFullState(userId);
  if (!row) return null;

  return {
    userId: row.id,
    username: row.username,
    locationId: row.current_location_id,
    timeBlocks: row.time_blocks,
    credits: row.credits,
    goldCredits: row.gold_credits,
    currentNodeId: row.current_node_id,
    currentDay: row.current_day,
    alignment: row.alignment || 'neutral',
    storyBeat: row.story_beat || 'prologue',
    flags: row.flags || {},
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isNsfwUnlocked: row.is_nsfw_unlocked,
    patreonTier: row.patreon_tier,
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

async function getTravelCost(fromLocationId: string, toLocationId: string): Promise<number> {
  const result = await queryOLTP(
    `SELECT sqrt(pow(fd.x - td.x, 2) + pow(fd.y - td.y, 2)) as distance
     FROM scenes fs
     JOIN districts fd ON fs.district_id = fd.id
     JOIN scenes ts ON ts.id = $2
     JOIN districts td ON ts.district_id = td.id
     WHERE fs.id = $1`,
    [fromLocationId, toLocationId]
  );
  const dist = parseFloat(result.rows[0]?.distance || '0');
  if (result.rows.length === 0 || isNaN(dist)) return MOVEMENT_TB_COST;
  if (dist === 0) return 0;
  return Math.floor(dist / 2) + 1;
}

export async function performMoveTransaction(
  userId: string,
  targetLocationId: string
): Promise<MoveResult> {
  return withOLTPTransaction(async (client) => {
    const fromResult = await client.query(
      'SELECT current_location_id FROM player_states WHERE user_id = $1',
      [userId]
    );
    if (fromResult.rows.length === 0) throw new Error('Player not found');
    const fromLocationId = fromResult.rows[0].current_location_id;

    const tbCost = fromLocationId === targetLocationId
      ? 0
      : await getTravelCost(fromLocationId, targetLocationId);

    const result = await PlayerStateRepository.move(client, userId, targetLocationId, tbCost);
    return result;
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
    // First: get the current day for analytics (before sleep overwrites it)
    const stateResult = await client.query(
      `SELECT current_day FROM player_states WHERE user_id = $1`,
      [userId]
    );
    if (stateResult.rows.length === 0) throw new Error('Player not found');
    const previousDay = stateResult.rows[0].current_day;

    // Perform the sleep via repo (atomic under this transaction's client)
    const result = await PlayerStateRepository.sleep(client, userId, RENT_AMOUNT);

    // Bank transaction ledger entry
    await client.query(
      `INSERT INTO bank_transactions (user_id, transaction_type, amount, description, balance_after, reference_type)
       VALUES ($1, 'debit', $2, 'Daily Rent - Nakamura & Morgan LTD', $3, 'rent')`,
      [userId, RENT_AMOUNT, result.credits]
    );

    return {
      time_blocks: result.time_blocks,
      credits: result.credits,
      current_day: result.current_day,
      credits_deducted: RENT_AMOUNT,
      previous_day: previousDay,
      rent_paid: true,
      overdraft: result.overdraft,
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
