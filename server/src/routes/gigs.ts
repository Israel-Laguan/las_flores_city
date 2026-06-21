import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { oltpPool, queryOLAP } from '../database/connection.js';
import { deleteCache } from '../database/redis.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { GigFileSchema, Gig } from '../../../shared/src/schemas/gig.js';

export const gigsRouter = express.Router();

let cachedGigs: Gig[] = [];
function loadGigs(): Gig[] {
  if (cachedGigs.length > 0) return cachedGigs;
  const candidates = [
    path.resolve(process.cwd(), 'content/gigs/gigs.yaml'),
    path.resolve(process.cwd(), '../content/gigs/gigs.yaml'),
    path.resolve(__dirname, '../../../../content/gigs/gigs.yaml'),
    path.resolve(__dirname, '../../../../../content/gigs/gigs.yaml'),
  ];
  const filePath = candidates.find(fs.existsSync);
  if (!filePath) throw new Error('Unable to locate content/gigs/gigs.yaml');
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

      // Atomically deduct TBs — fails if insufficient
      const tbResult = await PlayerStateRepository.spendTimeBlocksWithLocation(
        client,
        userId,
        gig.time_block_cost
      );

      if (!tbResult) {
        throw new Error('INSUFFICIENT_TIME_BLOCKS');
      }

      const { time_blocks: newTimeBlocks, current_location_id: currentLocationId } = tbResult;

      if (gig.location_restriction_id && gig.location_restriction_id !== currentLocationId) {
        throw new Error('LOCATION_RESTRICTION_FAILED');
      }

      const newBalances = await PlayerStateRepository.modifyBalance(
        client,
        userId,
        gig.credit_payout
      );

      await client.query(
        `INSERT INTO bank_transactions
         (user_id, amount, currency_type, transaction_type, description, balance_after)
         VALUES ($1, $2, 'creds', 'salary', $3, $4)`,
        [userId, gig.credit_payout, `Completed: ${gig.title}`, newBalances.credits]
      );

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
