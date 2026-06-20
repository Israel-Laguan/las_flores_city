import express from 'express';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCache, setCache, deleteCache } from '../database/redis.js';
import {
  userStateCacheKey,
  assemblePlayerState,
  validateUpdateField,
  performMoveTransaction,
  emitMoveAnalytics,
  performSleepTransaction,
  emitSleepAnalytics,
} from './player-helpers.js';
import { assembleScenePayload } from './location.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';

export const playerRouter = express.Router();

// GET /player/state - Get current player state (requires auth)
// 1.1.3a: State Assembler + 1.1.3c: Redis Caching
playerRouter.get('/state', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() });
    }

    const cacheKey = userStateCacheKey(userId);
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, timestamp: new Date().toISOString() });
    }

    const state = await assemblePlayerState(userId);
    if (!state) {
      return res.status(404).json({ success: false, error: 'Player not found', timestamp: new Date().toISOString() });
    }

    await setCache(cacheKey, state, 60);

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

    // Build the partial-update object (only include defined fields)
    const patch: Record<string, any> = {};
    if (time_blocks !== undefined) patch.time_blocks = time_blocks;
    if (credits !== undefined) patch.credits = credits;
    if (gold_credits !== undefined) patch.gold_credits = gold_credits;
    if (current_location_id !== undefined) patch.current_location_id = current_location_id;
    if (current_node_id !== undefined) patch.current_node_id = current_node_id;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided', timestamp: new Date().toISOString() });
    }

    await PlayerStateRepository.partialUpdate(userId, patch);

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
playerRouter.post('/move', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() });
    }
    const { target_location_id } = req.body;

    const locationError = await validateMoveLocation(target_location_id);
    if (locationError) {
      return res.status(locationError.status).json({ ...locationError.body, timestamp: new Date().toISOString() });
    }

    const result = await performMoveTransaction(userId, target_location_id);

    await deleteCache(userStateCacheKey(userId));
    if (result.success) {
      await deleteCache(`user:location:${userId}:${result.from_location_id}`);
      await deleteCache(`user:location:${userId}:${result.to_location_id}`);
    }

    if (!result.success) {
      return res.status(result.error === 'already_here' ? 400 : 403).json(formatMoveError(result.error));
    }

    await emitMoveAnalytics(userId, result);

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

async function validateMoveLocation(
  targetLocationId: string
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  if (!targetLocationId) {
    return { status: 400, body: { success: false, error: 'target_location_id is required' } };
  }

  const locationResult = await queryOLTP(
    'SELECT id, name, metadata FROM scenes WHERE id = $1',
    [targetLocationId]
  );

  if (locationResult.rows.length === 0) {
    return { status: 404, body: { success: false, error: 'Location not found' } };
  }

  const metadata = locationResult.rows[0].metadata as Record<string, any> | null;
  if (metadata?.locked) {
    const reason = metadata.lock_reason || 'This location is currently inaccessible.';
    return {
      status: 403,
      body: { success: false, error: 'location_locked', reason },
    };
  }

  return null;
}

function formatMoveError(error: 'already_here' | 'exhausted') {
  if (error === 'already_here') {
    return { success: false, error: 'You are already at this location.' };
  }
  return { success: false, error: 'exhausted', reason: 'You are too exhausted to move. You need to sleep.' };
}

// POST /player/sleep - Reset TB and advance day (requires auth)
// 2.2.2a: Location Verification
// 2.2.2b: Atomic Reset & Date Increment
// 2.2.2c: Redis Invalidation
// 2.2.3a: Rent Deduction
// 2.2.3b: Overdraft Handling
// 2.2.3c: Banking Ledger Logging
// 2.2.4a: OLAP Event Logging
playerRouter.post('/sleep', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: new Date().toISOString() });
    }

    const sleepLocationError = await checkSleepLocation(userId);
    if (sleepLocationError) {
      return res.status(sleepLocationError.status).json({ ...sleepLocationError.body, timestamp: new Date().toISOString() });
    }

    const result = await performSleepTransaction(userId);

    await deleteCache(userStateCacheKey(userId));
    await emitSleepAnalytics(userId, result);

    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Sleep error:', error);
    res.status(500).json({ success: false, error: 'Failed to sleep', timestamp: new Date().toISOString() });
  }
});

async function checkSleepLocation(
  userId: string
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const locationRow = await PlayerStateRepository.getCurrentLocation(userId);

  if (!locationRow) {
    return { status: 404, body: { success: false, error: 'Player not found' } };
  }

  if (!locationRow.current_location_id) {
    return {
      status: 403,
      body: { success: false, error: 'You cannot sleep here. Return to your apartment.' },
    };
  }

  const sceneResult = await queryOLTP(
    'SELECT metadata FROM scenes WHERE id = $1',
    [locationRow.current_location_id]
  );

  const sceneMetadata = sceneResult.rows[0]?.metadata as Record<string, any> | null;
  if (!sceneMetadata?.is_sleep_location) {
    return {
      status: 403,
      body: { success: false, error: 'You cannot sleep here. Return to your apartment.' },
    };
  }

  return null;
}

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
      const tbResult = await PlayerStateRepository.spendTimeBlocks(client, userId, amount);

      if (!tbResult.success) {
        return { success: false, error: 'insufficient_blocks' };
      }

      return {
        success: true,
        spent: amount,
        description,
        remaining: tbResult.remaining,
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

    await withOLTPTransaction(async (client) => {
      await PlayerStateRepository.mergeFlags(client, userId, { [key]: value });
    });

    res.json({ success: true, data: { key, value }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Set flag error:', error);
    res.status(500).json({ success: false, error: 'Failed to set flag', timestamp: new Date().toISOString() });
  }
});