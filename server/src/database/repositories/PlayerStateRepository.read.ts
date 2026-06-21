import pg from 'pg';
import { queryOLTP } from '../connection.js';
import type { FullStateRow } from './PlayerStateRepository.js';

export async function getFullState(userId: string): Promise<FullStateRow | null> {
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

export async function getForChoiceFilter(userId: string): Promise<{
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

export async function getCurrentLocation(userId: string): Promise<{
  current_location_id: string | null;
} | null> {
  const result = await queryOLTP(
    `SELECT current_location_id FROM player_states WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function getDialogueCursor(userId: string): Promise<{
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

export async function getBalancesForLedger(userId: string): Promise<{
  credits: number; gold_credits: number;
} | null> {
  const result = await queryOLTP(
    `SELECT credits, gold_credits FROM player_states WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function getBalances(client: pg.PoolClient, userId: string): Promise<{
  credits: number; gold_credits: number;
} | null> {
  const result = await client.query(
    `SELECT credits, gold_credits FROM player_states WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}