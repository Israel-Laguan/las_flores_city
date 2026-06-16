import express from 'express';
import { queryOLTP, queryOLAP, withOLTPTransaction } from '../database/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCache, setCache, deleteCache } from '../database/redis.js';
import {
  userStateCacheKey,
  assemblePlayerState,
  validateUpdateField,
  buildUpdateQuery,
} from './player-helpers.js';
import { assembleScenePayload } from './location.js';

export const playerRouter = express.Router();

// GET /player/state - Get current player state (requires auth)
// 1.1.3a: State Assembler + 1.1.3c: Redis Caching
playerRouter.get('/state', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() });
    }

    const cached = await getCache(userId);
    if (cached) {
      return res.json({ success: true, data: cached, timestamp: new Date().toISOString() });
    }

    const state = await assemblePlayerState(userId);
    if (!state) {
      return res.status(404).json({ success: false, error: 'Player not found', timestamp: new Date().toISOString() });
    }

    await setCache(userId, state, 60);

    res.json({ success: true, data: state, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Get player state error:', error);
    res.status(500).json({ success: false, error: 'Failed to get player state', timestamp: new Date().toISOString() });
  }
});

// POST /player/update - Update player state (requires auth)
// 1.1.4a: Partial Update Logic + 1.1.4b: Validation + Atomic DB Update
playerRouter.post('/update', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() });
    }
    const { time_blocks, credits, gold_credits, current_location_id, current_node_id } = req.body;

    const tbValidation = validateUpdateField(time_blocks, 'time_blocks', 0, 48);
    if (!tbValidation.valid) {
      return res.status(400).json({ success: false, error: tbValidation.error, timestamp: new Date().toISOString() });
    }

    const creditsValidation = validateUpdateField(credits, 'credits', 0);
    if (!creditsValidation.valid) {
      return res.status(400).json({ success: false, error: creditsValidation.error, timestamp: new Date().toISOString() });
    }

    const gcValidation = validateUpdateField(gold_credits, 'gold_credits', 0);
    if (!gcValidation.valid) {
      return res.status(400).json({ success: false, error: gcValidation.error, timestamp: new Date().toISOString() });
    }

    const { sql: updates, values } = buildUpdateQuery({ time_blocks, credits, gold_credits, current_location_id, current_node_id });

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided', timestamp: new Date().toISOString() });
    }

    values.push(userId);
    await queryOLTP(`UPDATE users SET ${updates} WHERE id = $${values.length}`, values);

    await deleteCache(userStateCacheKey(userId));

    const state = await assemblePlayerState(userId);

    res.json({ success: true, data: state, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Update player error:', error);
    res.status(500).json({ success: false, error: 'Failed to update player', timestamp: new Date().toISOString() });
  }
});

// POST /player/move - Move to a new location (requires auth)
// 2.1.1: Request Validation + Access Control
// 2.1.2: Atomic TB Deduction
// 2.1.3: OLAP Event Emission
const MOVEMENT_TB_COST = 1;

playerRouter.post('/move', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() });
    }
    const { target_location_id } = req.body;

    // 2.1.1a: Request Validation - required field
    if (!target_location_id) {
      return res.status(400).json({ success: false, error: 'target_location_id is required', timestamp: new Date().toISOString() });
    }

    // 2.1.1a Check 1: Does the location exist?
    const locationResult = await queryOLTP(
      'SELECT id, name, metadata FROM scenes WHERE id = $1',
      [target_location_id]
    );

    if (locationResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Location not found', timestamp: new Date().toISOString() });
    }

    // 2.1.1b: Access Control - check if location is locked
    const metadata = locationResult.rows[0].metadata as Record<string, any> | null;
    if (metadata?.locked) {
      const reason = metadata.lock_reason || 'This location is currently inaccessible.';
      return res.status(403).json({
        success: false,
        error: 'location_locked',
        reason,
        timestamp: new Date().toISOString(),
      });
    }

    // 2.1.2: Atomic TB Deduction with same-location guard
    const result = await withOLTPTransaction(async (client) => {
      // Lock the player row to prevent race conditions
      const lockResult = await client.query(
        'SELECT time_blocks, current_location_id FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (lockResult.rows.length === 0) {
        throw new Error('Player not found');
      }

      const currentTB = lockResult.rows[0].time_blocks;
      const fromLocationId = lockResult.rows[0].current_location_id;

      // 2.1.1a Check 2: Already at that location?
      if (fromLocationId === target_location_id) {
        return { success: false, error: 'already_here' };
      }

      // 2.1.2b: Exhaustion handling
      if (currentTB < MOVEMENT_TB_COST) {
        return { success: false, error: 'exhausted' };
      }

      // Atomic deduction + location update in one statement
      await client.query(
        'UPDATE users SET time_blocks = time_blocks - $1, current_location_id = $2 WHERE id = $3',
        [MOVEMENT_TB_COST, target_location_id, userId]
      );

      const newResult = await client.query(
        'SELECT time_blocks FROM users WHERE id = $1',
        [userId]
      );

      return {
        success: true,
        from_location_id: fromLocationId,
        to_location_id: target_location_id,
        tb_cost: MOVEMENT_TB_COST,
        time_blocks_remaining: newResult.rows[0].time_blocks,
      };
    });

    // Invalidate player state cache
    await deleteCache(userStateCacheKey(userId));

    // Invalidate user-specific location caches for both old and new locations
    if (result.success) {
      await deleteCache(`user:location:${userId}:${result.from_location_id}`);
      await deleteCache(`user:location:${userId}:${result.to_location_id}`);
    }

    // Handle failure responses
    if (!result.success) {
      if (result.error === 'already_here') {
        return res.status(400).json({
          success: false,
          error: 'You are already at this location.',
          timestamp: new Date().toISOString(),
        });
      }
      if (result.error === 'exhausted') {
        return res.status(403).json({
          success: false,
          error: 'exhausted',
          reason: 'You are too exhausted to move. You need to sleep.',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 2.1.3: OLAP Event Emission - log the move AFTER commit
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

    // Assemble full ScenePayload for the new location
    const scenePayload = await assembleScenePayload(result.to_location_id, userId);

    res.json({
      success: true,
      data: {
        from_location_id: result.from_location_id,
        to_location_id: result.to_location_id,
        tb_cost: result.tb_cost,
        time_blocks_remaining: result.time_blocks_remaining,
        scene: scenePayload?.scene || null,
        npcs: scenePayload?.npcs || [],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Move error:', error);
    res.status(500).json({ success: false, error: 'Failed to move player', timestamp: new Date().toISOString() });
  }
});

// POST /player/sleep - Reset TB and advance day (requires auth)
// 2.2.2a: Location Verification
// 2.2.2b: Atomic Reset & Date Increment
// 2.2.2c: Redis Invalidation
// 2.2.3a: Rent Deduction
// 2.2.3b: Overdraft Handling
// 2.2.3c: Banking Ledger Logging
// 2.2.4a: OLAP Event Logging

const APARTMENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const RENT_AMOUNT = 10;

playerRouter.post('/sleep', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() });
    }

    // 2.2.2a: Location Verification - must be at The Apartment
    const locationCheck = await queryOLTP(
      'SELECT current_location_id FROM users WHERE id = $1',
      [userId]
    );

    if (locationCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Player not found', timestamp: new Date().toISOString() });
    }

    if (locationCheck.rows[0].current_location_id !== APARTMENT_ID) {
      return res.status(403).json({
        success: false,
        error: 'You cannot sleep here. Return to your apartment.',
        timestamp: new Date().toISOString(),
      });
    }

    // 2.2.2b + 2.2.3a + 2.2.3b + 2.2.3c: Atomic transaction
    const result = await withOLTPTransaction(async (client) => {
      // Lock the player row
      const lockResult = await client.query(
        'SELECT time_blocks, credits, current_day FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (lockResult.rows.length === 0) {
        throw new Error('Player not found');
      }

      const previousDay = lockResult.rows[0].current_day;
      const previousCredits = lockResult.rows[0].credits;

      // Reset time_blocks, increment day, clear conversation state
      await client.query(
        `UPDATE users SET
          time_blocks = 48,
          current_day = current_day + 1,
          current_node_id = NULL
        WHERE id = $1`,
        [userId]
      );

      // Deduct rent (allow negative balance for overdraft)
      await client.query(
        'UPDATE users SET credits = credits - $1 WHERE id = $2',
        [RENT_AMOUNT, userId]
      );

      // Fetch updated state
      const newResult = await client.query(
        'SELECT time_blocks, credits, current_day FROM users WHERE id = $1',
        [userId]
      );

      const newCredits = newResult.rows[0].credits;

      // 2.2.3c: Banking Ledger - log the rent deduction
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

    // 2.2.2c: Redis Invalidation
    await deleteCache(userStateCacheKey(userId));

    // 2.2.4a: OLAP Event Logging
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

    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Sleep error:', error);
    res.status(500).json({ success: false, error: 'Failed to sleep', timestamp: new Date().toISOString() });
  }
});

// POST /player/spend-time-blocks - Spend time blocks (requires auth)
playerRouter.post('/spend-time-blocks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() });
    }
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount is required', timestamp: new Date().toISOString() });
    }

    const result = await withOLTPTransaction(async (client) => {
      const lockResult = await client.query(
        'SELECT time_blocks FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (lockResult.rows.length === 0) {
        throw new Error('Player not found');
      }

      const currentTB = lockResult.rows[0].time_blocks;

      if (currentTB < amount) {
        return { success: false, error: 'insufficient_blocks' };
      }

      await client.query(
        'UPDATE users SET time_blocks = time_blocks - $1 WHERE id = $2',
        [amount, userId]
      );

      const newResult = await client.query(
        'SELECT time_blocks FROM users WHERE id = $1',
        [userId]
      );

      return {
        success: true,
        spent: amount,
        description,
        remaining: newResult.rows[0].time_blocks,
      };
    });

    await deleteCache(userStateCacheKey(userId));

    if (!result.success) {
      return res.status(403).json({ success: false, error: 'Insufficient time blocks', timestamp: new Date().toISOString() });
    }

    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Spend time blocks error:', error);
    res.status(500).json({ success: false, error: 'Failed to spend time blocks', timestamp: new Date().toISOString() });
  }
});

// POST /player/set-flag - Set a player flag (requires auth)
playerRouter.post('/set-flag', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() });
    }
    const { key, value } = req.body;

    if (!key) {
      return res.status(400).json({ success: false, error: 'key is required', timestamp: new Date().toISOString() });
    }

    await queryOLTP(
      'UPDATE player_states SET flags = flags || $1 WHERE user_id = $2',
      [JSON.stringify({ [key]: value }), userId]
    );

    res.json({ success: true, data: { key, value }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Set flag error:', error);
    res.status(500).json({ success: false, error: 'Failed to set flag', timestamp: new Date().toISOString() });
  }
});