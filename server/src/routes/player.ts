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
playerRouter.post('/sleep', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() });
    }

    const result = await withOLTPTransaction(async (client) => {
      await client.query(
        'UPDATE users SET time_blocks = 48 WHERE id = $1',
        [userId]
      );

      await client.query(
        'UPDATE users SET credits = credits - 10 WHERE id = $1 AND credits >= 10',
        [userId]
      );

      const userResult = await client.query(
        'SELECT time_blocks, credits FROM users WHERE id = $1',
        [userId]
      );

      return {
        time_blocks: userResult.rows[0].time_blocks,
        credits: userResult.rows[0].credits,
        credits_deducted: 10,
      };
    });

    await deleteCache(userStateCacheKey(userId));

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