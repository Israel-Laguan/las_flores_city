import pg from 'pg';
import { queryOLTP } from '../connection.js';

export type MoveResultOk = {
  success: true;
  from_location_id: string;
  to_location_id: string;
  tb_cost: number;
  time_blocks_remaining: number;
};

export type MoveResultFail = {
  success: false;
  error: 'already_here' | 'exhausted';
};

export type MoveResultType = MoveResultOk | MoveResultFail;

export interface SleepResult {
  time_blocks: number;
  credits: number;
  current_day: number;
  credits_deducted: number;
  previous_day: number;
  rent_paid: true;
  overdraft: boolean;
}

export async function modifyBalance(
  client: pg.PoolClient,
  userId: string,
  creditsDelta?: number,
  goldDelta?: number
): Promise<{ credits: number; gold_credits: number }> {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (creditsDelta !== undefined) {
    sets.push(`credits = credits + $${i++}`);
    params.push(creditsDelta);
  }
  if (goldDelta !== undefined) {
    sets.push(`gold_credits = gold_credits + $${i++}`);
    params.push(goldDelta);
  }
  sets.push(`updated_at = NOW()`);
  params.push(userId);

  const result = await client.query(
    `UPDATE player_states SET ${sets.join(', ')}
     WHERE user_id = $${i}
     RETURNING credits, gold_credits`,
    params
  );

  return result.rows[0];
}

export async function chargeCurrency(
  client: pg.PoolClient,
  userId: string,
  currency: 'credits' | 'gold_credits',
  amount: number
): Promise<number | null> {
  const balances = await getBalances(client, userId);
  if (!balances) return null;
  const current = balances[currency];
  if (current < amount) return null;

  const result = await client.query(
    `UPDATE player_states
       SET ${currency} = ${currency} - $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING ${currency}`,
    [amount, userId]
  );
  return result.rows[0][currency] as number;
}

async function getBalances(client: pg.PoolClient, userId: string): Promise<{
  credits: number; gold_credits: number;
} | null> {
  const result = await client.query(
    `SELECT credits, gold_credits FROM player_states WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function spendTimeBlocksWithLocation(
  client: pg.PoolClient,
  userId: string,
  amount: number
): Promise<{ time_blocks: number; current_location_id: string | null } | null> {
  const result = await client.query(
    `UPDATE player_states
       SET time_blocks = time_blocks - $1, updated_at = NOW()
     WHERE user_id = $2 AND time_blocks >= $1
     RETURNING time_blocks, current_location_id`,
    [amount, userId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function spendTimeBlocks(
  client: pg.PoolClient,
  userId: string,
  amount: number
): Promise<{ success: true; remaining: number } | { success: false }> {
  const lockResult = await client.query(
    `SELECT time_blocks FROM player_states WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  if (lockResult.rows.length === 0) throw new Error('Player not found');

  const currentTB = lockResult.rows[0].time_blocks;
  if (currentTB < amount) return { success: false };

  await client.query(
    `UPDATE player_states SET time_blocks = time_blocks - $1, updated_at = NOW()
     WHERE user_id = $2`,
    [amount, userId]
  );

  return { success: true, remaining: currentTB - amount };
}

export async function setDialogueCursor(
  client: pg.PoolClient,
  userId: string,
  nodeId: string | null,
  dialogueId: string | null
): Promise<void> {
  await client.query(
    `UPDATE player_states
       SET current_node_id = $1, active_dialogue_id = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [nodeId, dialogueId, userId]
  );
}

export async function clearDialogueAndSimulation(
  client: pg.PoolClient,
  userId: string
): Promise<void> {
  await client.query(
    `UPDATE player_states
       SET current_node_id = NULL, active_dialogue_id = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
  await client.query(
    `UPDATE users
       SET is_in_simulation = FALSE, simulation_mystery_id = NULL
     WHERE id = $1`,
    [userId]
  );
}

export async function move(
  client: pg.PoolClient,
  userId: string,
  targetLocationId: string,
  tbCost: number
): Promise<MoveResultType> {
  const lockResult = await client.query(
    `SELECT time_blocks, current_location_id FROM player_states
     WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  if (lockResult.rows.length === 0) throw new Error('Player not found');

  const currentTB = lockResult.rows[0].time_blocks;
  const fromLocationId = lockResult.rows[0].current_location_id;

  if (fromLocationId === targetLocationId) {
    return { success: false, error: 'already_here' };
  }
  if (currentTB < tbCost) {
    return { success: false, error: 'exhausted' };
  }

  await client.query(
    `UPDATE player_states
       SET time_blocks = time_blocks - $1,
           current_location_id = $2,
           updated_at = NOW()
     WHERE user_id = $3`,
    [tbCost, targetLocationId, userId]
  );

  return {
    success: true,
    from_location_id: fromLocationId,
    to_location_id: targetLocationId,
    tb_cost: tbCost,
    time_blocks_remaining: currentTB - tbCost,
  };
}

export async function sleep(
  client: pg.PoolClient,
  userId: string,
  rentAmount: number
): Promise<SleepResult> {
  const lockResult = await client.query(
    `SELECT time_blocks, credits, current_day FROM player_states
     WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  if (lockResult.rows.length === 0) throw new Error('Player not found');

  const previousDay = lockResult.rows[0].current_day;

  await client.query(
    `UPDATE player_states
       SET time_blocks = 48,
           current_day = current_day + 1,
           current_node_id = NULL,
           credits = credits - $1,
           updated_at = NOW()
     WHERE user_id = $2`,
    [rentAmount, userId]
  );

  const newResult = await client.query(
    `SELECT time_blocks, credits, current_day FROM player_states
     WHERE user_id = $1`,
    [userId]
  );

  const newCredits = newResult.rows[0].credits;

  return {
    time_blocks: newResult.rows[0].time_blocks,
    credits: newCredits,
    current_day: newResult.rows[0].current_day,
    credits_deducted: rentAmount,
    previous_day: previousDay,
    rent_paid: true,
    overdraft: newCredits < 0,
  };
}

export async function setStoryBeat(
  client: pg.PoolClient,
  userId: string,
  beat: string
): Promise<void> {
  await client.query(
    `UPDATE player_states SET story_beat = $1, updated_at = NOW()
     WHERE user_id = $2`,
    [beat, userId]
  );
}

export async function setAlignment(
  client: pg.PoolClient,
  userId: string,
  alignment: string
): Promise<void> {
  await client.query(
    `UPDATE player_states SET alignment = $1, updated_at = NOW()
     WHERE user_id = $2`,
    [alignment, userId]
  );
}

export async function enterSimulation(
  client: pg.PoolClient,
  userId: string,
  nodeId: string,
  dialogueId: string,
  mysteryId: string
): Promise<void> {
  await client.query(
    `UPDATE player_states
       SET current_node_id = $1, active_dialogue_id = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [nodeId, dialogueId, userId]
  );
  await client.query(
    `UPDATE users
       SET is_in_simulation = TRUE, simulation_mystery_id = $1
     WHERE id = $2`,
    [mysteryId, userId]
  );
}

export async function mergeFlags(
  client: pg.PoolClient,
  userId: string,
  flags: Record<string, boolean>
): Promise<void> {
  await client.query(
    `UPDATE player_states SET flags = flags || $1, updated_at = NOW()
     WHERE user_id = $2`,
    [JSON.stringify(flags), userId]
  );
}

export async function partialUpdate(
  userId: string,
  updates: {
    time_blocks?: number;
    credits?: number;
    gold_credits?: number;
    current_location_id?: string;
    current_node_id?: string;
  }
): Promise<void> {
  const clauses: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (updates.time_blocks !== undefined) {
    clauses.push(`time_blocks = $${i++}`);
    params.push(updates.time_blocks);
  }
  if (updates.credits !== undefined) {
    clauses.push(`credits = $${i++}`);
    params.push(updates.credits);
  }
  if (updates.gold_credits !== undefined) {
    clauses.push(`gold_credits = $${i++}`);
    params.push(updates.gold_credits);
  }
  if (updates.current_location_id !== undefined) {
    clauses.push(`current_location_id = $${i++}`);
    params.push(updates.current_location_id);
  }
  if (updates.current_node_id !== undefined) {
    clauses.push(`current_node_id = $${i++}`);
    params.push(updates.current_node_id);
  }

  if (clauses.length === 0) return;
  clauses.push(`updated_at = NOW()`);
  params.push(userId);

  await queryOLTP(
    `UPDATE player_states SET ${clauses.join(', ')} WHERE user_id = $${i}`,
    params
  );
}

export async function createForNewUser(
  userId: string,
  startLocationId: string
): Promise<void> {
  await queryOLTP(
    `INSERT INTO player_states (user_id, current_location_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
     VALUES ($1, $2, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')`,
    [userId, startLocationId]
  );
}