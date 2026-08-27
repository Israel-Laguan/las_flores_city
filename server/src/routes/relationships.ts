import express, { type Response } from 'express';
import { withOLTPTransaction } from '@las-flores/infra';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { applyRelationshipDelta, getRelationship } from '../database/repositories/RelationshipRepository.js';

export const relationshipsRouter = express.Router();

function characterIdOf(req: AuthRequest): string {
  const value = req.params.characterId;
  return Array.isArray(value) ? value[0] : value;
}

relationshipsRouter.get('/:characterId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await withOLTPTransaction((client) =>
      getRelationship(client, req.userId!, characterIdOf(req))
    );
    return res.json({ success: true, data: snapshot, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[relationships] read failed:', error);
    return res.status(500).json({ success: false, error: 'relationship_read_failed' });
  }
});

/**
 * Small pilot loop: a repeatable check-in costs one time block and is paced to
 * one interaction per game day. Richer invitation/date content will replace
 * this interaction key after the pilot review.
 */
relationshipsRouter.post('/:characterId/interact', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (req.body?.interactionKey !== 'check_in') {
    return res.status(400).json({ success: false, error: 'unknown_interaction' });
  }

  try {
    const result = await withOLTPTransaction(async (client) => {
      const character = await client.query(
        'SELECT 1 FROM characters WHERE id = $1', [characterIdOf(req)]
      );
      if (character.rows.length === 0) return { error: 'character_not_found' as const };
      const player = await client.query<{ current_day: number }>(
        'SELECT current_day FROM player_states WHERE user_id = $1 FOR UPDATE', [req.userId]
      );
      if (player.rows.length === 0) return { error: 'player_not_found' as const };
      const currentDay = player.rows[0].current_day;
      const existing = await client.query<{ last_interaction_day: number | null }>(
        `SELECT last_interaction_day FROM user_relationships
          WHERE user_id = $1 AND character_id = $2 FOR UPDATE`,
        [req.userId, characterIdOf(req)]
      );
      if (existing.rows[0]?.last_interaction_day === currentDay) {
        return { error: 'interaction_paced' as const };
      }
      const spend = await PlayerStateRepository.spendTimeBlocks(client, req.userId!, 1);
      if (!spend.success) return { error: 'insufficient_time_blocks' as const };
      await applyRelationshipDelta(client, req.userId!, characterIdOf(req), {
        axes: { familiarity: 1, visibility: 1 },
        vibe: 5,
        bond: 1,
      }, { currentDay, markInteraction: true });
      const snapshot = await getRelationship(client, req.userId!, characterIdOf(req));
      return { snapshot, timeBlocksSpent: 1 };
    });

    if ('error' in result) {
      const status = result.error === 'insufficient_time_blocks' ? 403
        : result.error === 'interaction_paced' ? 409 : 404;
      return res.status(status).json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[relationships] interaction failed:', error);
    return res.status(500).json({ success: false, error: 'relationship_interaction_failed' });
  }
});
