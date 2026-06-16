import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { oltpPool, queryOLAP } from '../database/connection.js';
import { deleteCache } from '../database/redis.js';
import { BankService } from '../services/BankService.js';
import { GigFileSchema, Gig } from '../../../shared/src/schemas/gig.js';

export const gigsRouter = express.Router();

let cachedGigs: Gig[] = [];
function loadGigs(): Gig[] {
  if (cachedGigs.length > 0) return cachedGigs;
  const filePath = path.join(path.dirname(new URL(import.meta.url).pathname), '../../../content/gigs/gigs.yaml');
  const parsed = yaml.load(fs.readFileSync(filePath, 'utf8'));
  cachedGigs = GigFileSchema.parse(parsed).gigs;
  return cachedGigs;
}

gigsRouter.get('/', authMiddleware, (req, res, next) => {
  try {
    res.json(loadGigs());
  } catch (err) {
    next(err);
  }
});

gigsRouter.post('/execute', authMiddleware, async (req: AuthRequest, res, next) => {
  const { gigId } = req.body;
  const userId = req.userId!;

  try {
    const gig = loadGigs().find(g => g.id === gigId);
    if (!gig) return res.status(404).json({ error: 'GIG_NOT_FOUND' });

    const client = await oltpPool.connect();
    try {
      await client.query('BEGIN');

      // Atomically deduct TBs — fails silently if insufficient
      const updateResult = await client.query(
        `UPDATE users
         SET time_blocks = time_blocks - $1, updated_at = NOW()
         WHERE id = $2 AND time_blocks >= $1
         RETURNING time_blocks, current_location_id`,
        [gig.time_block_cost, userId]
      );

      if (updateResult.rows.length === 0) {
        throw new Error('INSUFFICIENT_TIME_BLOCKS');
      }

      const { time_blocks: newTimeBlocks, current_location_id: currentLocationId } = updateResult.rows[0];

      if (gig.location_restriction_id && gig.location_restriction_id !== currentLocationId) {
        throw new Error('LOCATION_RESTRICTION_FAILED');
      }

      // Credit payout + ledger via BankService (runs its own nested transaction)
      await BankService.modifyBalance(userId, gig.credit_payout, 'creds', 'salary', `Completed: ${gig.title}`);

      if (gig.reputation_target && gig.reputation_reward) {
        await client.query(
          `INSERT INTO user_reputations (user_id, faction, score)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, faction)
           DO UPDATE SET score = user_reputations.score + EXCLUDED.score`,
          [userId, gig.reputation_target, gig.reputation_reward]
        );
      }

      await client.query('COMMIT');

      // Async OLAP telemetry — fire-and-forget
      queryOLAP(
        `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
         VALUES (gen_random_uuid(), $1, 'gig_completed', $2, $3)`,
        [userId, JSON.stringify({ gig_id: gig.id, payout: gig.credit_payout }), gig.time_block_cost]
      ).catch(err => console.error('Telemetry error:', err));

      await deleteCache(`user:state:${userId}`);

      res.json({ success: true, newTimeBlocks });
    } catch (txError: any) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: txError.message });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});
