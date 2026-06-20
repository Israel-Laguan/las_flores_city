import pg from 'pg';
import { queryOLTP, withOLTPTransaction } from '../connection.js';

// ── Types ──────────────────────────────────────────────────────

export interface FullStateRow {
  id: string;
  username: string;
  current_location_id: string | null;
  time_blocks: number;
  credits: number;
  gold_credits: number;
  current_node_id: string | null;
  current_day: number;
  alignment: string;
  story_beat: string;
  flags: Record<string, boolean>;
  last_login: string;
  created_at: string;
  updated_at: string;
  is_nsfw_unlocked: boolean;
  patreon_tier: string;
}

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

// ── Repository ─────────────────────────────────────────────────

export class PlayerStateRepository {
  /**
   * Read the full player state joined with user_entitlements.
   * This is the central read path used by assemblePlayerState.
   */
  static async getFullState(userId: string): Promise<FullStateRow | null> {
    const result = await queryOLTP<FullStateRow>(
      `SELECT
         ps.user_id          AS id,
         u.username,
         ps.current_location_id,
         ps.time_blocks,
         ps.credits,
         ps.gold_credits,
         ps.current_node_id,
         ps.current_day,
         ps.alignment,
         ps.story_beat,
         COALESCE(ps.flags, '{}') AS flags,
         u.last_login,
         u.created_at,
         u.updated_at,
         COALESCE(ue.is_nsfw_unlocked, FALSE) AS is_nsfw_unlocked,
         COALESCE(ue.patreon_tier, 'none')     AS patreon_tier
       FROM users u
       JOIN player_states ps ON ps.user_id = u.id
       LEFT JOIN user_entitlements ue ON u.id = ue.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Get credits, flags, and time_blocks for choice filtering.
   * Used by filterChoices (dialogue-helpers, comms).
   */
  static async getForChoiceFilter(userId: string): Promise<{
    credits: number; flags: Record<string, boolean>; time_blocks: number;
  } | null> {
    const result = await queryOLTP(
      `SELECT credits, time_blocks, COALESCE(flags, '{}') AS flags
       FROM player_states
       WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return null;
    return {
      credits: result.rows[0].credits,
      time_blocks: result.rows[0].time_blocks,
      flags: result.rows[0].flags,
    };
  }

  /**
   * Get the current location for sleep-location checks.
   */
  static async getCurrentLocation(userId: string): Promise<{
    current_location_id: string | null;
  } | null> {
    const result = await queryOLTP(
      `SELECT current_location_id FROM player_states WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Get dialogue cursor (active_dialogue_id + current_node_id + TB + sim flags).
   * Used by getDialogState, /dialogue/active.
   */
  static async getDialogueCursor(userId: string): Promise<{
    current_node_id: string | null;
    active_dialogue_id: string | null;
    time_blocks: number;
    is_in_simulation: boolean;
    simulation_mystery_id: string | null;
  } | null> {
    const result = await queryOLTP(
      `SELECT
         ps.current_node_id,
         ps.active_dialogue_id,
         ps.time_blocks,
         COALESCE(u.is_in_simulation, FALSE)  AS is_in_simulation,
         u.simulation_mystery_id
       FROM player_states ps
       JOIN users u ON u.id = ps.user_id
       WHERE u.id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Get credits + gold_credits under FOR UPDATE for balance checks (shop, bank).
   */
  static async getBalances(client: pg.PoolClient, userId: string): Promise<{
    credits: number; gold_credits: number;
  } | null> {
    const result = await client.query(
      `SELECT credits, gold_credits FROM player_states WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Atomic balance mutation under FOR UPDATE.
   * Used by BankService.modifyBalance, shop purchases, gigs.
   */
  static async modifyBalance(
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

  /**
   * Atomic time-block deduction under FOR UPDATE.
   * Returns { success, remaining } or { success: false } if insufficient.
   */
  static async spendTimeBlocks(
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

  /**
   * Set the dialogue cursor. Pass null/null to clear (end dialogue).
   */
  static async setDialogueCursor(
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

  /**
   * Clear dialogue cursor AND simulation flags on users.
   * Used by /dialogue/end and end-branch in recordChoiceAndEffects.
   */
  static async clearDialogueAndSimulation(
    client: pg.PoolClient,
    userId: string
  ): Promise<void> {
    await client.query(
      `UPDATE player_states
         SET current_node_id = NULL, active_dialogue_id = NULL, updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
    // Simulation flags live on users (they are non-gameplay metadata)
    await client.query(
      `UPDATE users
         SET is_in_simulation = FALSE, simulation_mystery_id = NULL
       WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Atomically move to a new location.
   * Deducts TB cost, updates current_location_id.
   */
  static async move(
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

  /**
   * Atomically perform sleep: reset TB to 48, increment day, null
   * current_node_id, deduct rent.
   */
  static async sleep(
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

  /**
   * Set story_beat on player_states.
   */
  static async setStoryBeat(
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

  /**
   * Merge boolean flags into the player_states flags JSONB bag.
   */
  static async mergeFlags(
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

  /**
   * Generic partial update for POST /player/update.
   * Only sets the provided fields.
   */
  static async partialUpdate(
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

  /**
   * Create a fresh player_states row for a newly registered user.
   */
  static async createForNewUser(
    userId: string,
    startLocationId: string
  ): Promise<void> {
    await queryOLTP(
      `INSERT INTO player_states (user_id, current_location_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
       VALUES ($1, $2, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')`,
      [userId, startLocationId]
    );
  }
}
