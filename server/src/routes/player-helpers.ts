import { queryOLTP } from '../database/connection.js';

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
      u.last_login,
      u.created_at,
      u.updated_at
    FROM users u
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
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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