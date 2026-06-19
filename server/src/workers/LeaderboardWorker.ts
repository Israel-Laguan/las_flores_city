import { oltpPool, queryOLAP } from '../database/connection.js';
import { invalidatePattern } from '../database/redis.js';
import { SocialFeedService } from '../services/SocialFeedService.js';
import type { LeaderboardBadgeType, LeaderboardEntry } from '../../../shared/src/types/leaderboard.js';

const LEADERBOARD_SOCIAL_HANDLE = '@system';
const LEADERBOARD_SOCIAL_AUTHOR = 'Las Flores Network';
const LEADERBOARD_SOCIAL_AVATAR = '';
const LEADERBOARD_TOP_N = 3;
const BREAKTHROUGH_RANK = 1;
const DIAMOND_CUTOFF_RANK = 10;
const OLAP_GRACE_PERIOD_MINUTES = 2;

type SolverRow = {
  user_id: string;
  username: string;
  started_at: Date;
  solved_at: Date;
};

type LeaderboardRow = {
  userId: string;
  username: string;
  tbSpent: number;
  deltaSeconds: number;
};

type OlapUsageRow = {
  user_id: string;
  tb_spent: string | number | null;
};

/**
 * LeaderboardWorker (Task 3.4)
 *
 * Finalizes mysteries whose 24h Breakthrough window has expired.
 * Runs on a setInterval cron in the Express bootstrap. The work
 * itself is idempotent: each (mystery_id, user_id) pair has a PK in
 * `leaderboards`, and `mysteries.status` is moved to 'ARCHIVED' so
 * subsequent ticks skip the row.
 */
export class LeaderboardWorker {
  public static async processExpiredMysteries(): Promise<void> {
    const client = await oltpPool.connect();

    try {
      const { rows: expiredMysteries } = await client.query(
        `SELECT id, title
           FROM mysteries
          WHERE status = 'RESOLVING'
            AND expires_at <= NOW() - ($1 || ' minutes')::interval`,
        [OLAP_GRACE_PERIOD_MINUTES]
      );

      for (const mystery of expiredMysteries) {
        try {
          await this.finalizeMystery(client, mystery.id, mystery.title);
        } catch (err) {
          console.error(`[LeaderboardWorker] finalize failed for mystery=${mystery.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[LeaderboardWorker] processExpiredMysteries error:', err);
    } finally {
      client.release();
    }
  }

  private static async finalizeMystery(
    client: import('pg').PoolClient,
    mysteryId: string,
    title: string
  ): Promise<void> {
    await client.query('BEGIN');

    try {
      const solvers = await this.getSolvers(client, mysteryId);

      if (solvers.length === 0) {
        await this.applyAftermath(client, mysteryId);
        await this.archiveMystery(client, mysteryId);
        await client.query('COMMIT');
        await this.invalidateMysteryCaches();
        return;
      }

      const leaderboard = await this.buildLeaderboard(solvers);
      const socialTextParts = this.buildSocialTextParts(title, leaderboard);

      for (let i = 0; i < leaderboard.length; i++) {
        await this.upsertLeaderboardEntry(client, mysteryId, leaderboard[i], i + 1);
      }

      await this.applyAftermath(client, mysteryId);
      await this.archiveMystery(client, mysteryId);
      await client.query('COMMIT');
      await this.createLeaderboardPost(mysteryId, socialTextParts);
      await this.invalidateMysteryCaches();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  private static async getSolvers(
    client: import('pg').PoolClient,
    mysteryId: string
  ): Promise<SolverRow[]> {
    const { rows } = await client.query<SolverRow>(
      `SELECT pm.user_id, pm.started_at, pm.solved_at, u.username
         FROM player_mysteries pm
         JOIN users u ON u.id = pm.user_id
        WHERE pm.mystery_id = $1
          AND pm.status = 'SOLVED'
          AND pm.solved_at IS NOT NULL`,
      [mysteryId]
    );

    return rows;
  }

  private static async archiveMystery(
    client: import('pg').PoolClient,
    mysteryId: string
  ): Promise<void> {
    await client.query(`UPDATE mysteries SET status = 'ARCHIVED' WHERE id = $1`, [mysteryId]);
  }

  /**
   * Task 5.1: Execute the aftermath payload atomically inside
   * finalizeMystery's transaction. Demotes clue items to mementos
   * and scrubs temporary characters from live scenes. Both the
   * `retire_vault_items` UPDATE and `remove_scene_characters`
   * DELETE are no-ops on ids that don't exist, so a stale payload
   * can't poison the finalization.
   *
   * Runs BEFORE archiveMystery so that, if any statement throws,
   * the whole finalization rolls back, the mystery stays
   * RESOLVING, and the worker retries next tick — matching the
   * existing idempotency model.
   */
  private static async applyAftermath(
    client: import('pg').PoolClient,
    mysteryId: string
  ): Promise<void> {
    const { rows } = await client.query<{ aftermath_payload: any }>(
      `SELECT aftermath_payload FROM mysteries WHERE id = $1`,
      [mysteryId]
    );
    const payload = rows[0]?.aftermath_payload ?? {};

    // 1. Clues -> Mementos. The `item_type = 'clue'` guard keeps
    //    premium_cg items that share this mystery from being
    //    clobbered into mementos.
    if (Array.isArray(payload.retire_vault_items) && payload.retire_vault_items.length > 0) {
      await client.query(
        `UPDATE vault_items
            SET item_type = 'memento', updated_at = NOW()
          WHERE id = ANY($1::uuid[])
            AND item_type = 'clue'`,
        [payload.retire_vault_items]
      );
    }

    // 2. Scrub temporary characters from live scenes.
    if (Array.isArray(payload.remove_scene_characters)) {
      for (const mapping of payload.remove_scene_characters) {
        await client.query(
          `DELETE FROM scene_characters
                WHERE scene_id = $1 AND character_id = $2`,
          [mapping.scene_id, mapping.character_id]
        );
      }
    }
  }

  private static async upsertLeaderboardEntry(
    client: import('pg').PoolClient,
    mysteryId: string,
    row: LeaderboardRow,
    rank: number
  ): Promise<void> {
    const isBreakthrough = rank === BREAKTHROUGH_RANK;
    const badgeType: LeaderboardBadgeType = isBreakthrough
      ? 'breakthrough'
      : rank <= DIAMOND_CUTOFF_RANK
        ? 'diamond'
        : 'gold';

    await client.query(
      `INSERT INTO leaderboards
         (mystery_id, user_id, rank, total_tb_spent, delta_time_seconds, is_breakthrough)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (mystery_id, user_id) DO NOTHING`,
      [mysteryId, row.userId, rank, row.tbSpent, row.deltaSeconds, isBreakthrough]
    );

    await client.query(
      `UPDATE public_profiles
          SET badges = COALESCE(badges, '[]'::jsonb) || $1::jsonb
        WHERE user_id = $2`,
      [
        JSON.stringify([
          { mystery_id: mysteryId, badge_type: badgeType, earned_at: new Date().toISOString() },
        ]),
        row.userId,
      ]
    );
  }

  private static buildSocialTextParts(
    title: string,
    leaderboard: LeaderboardRow[]
  ): string[] {
    const socialTextParts: string[] = [
      `[CASE CLOSED] The ${title} mystery has been archived. Top Investigators:`,
    ];

    for (let i = 0; i < leaderboard.length; i++) {
      const row = leaderboard[i];
      const rank = i + 1;

      if (rank <= LEADERBOARD_TOP_N) {
        socialTextParts.push(`${rank}. @${row.username} - ${row.tbSpent} TBs`);
      }
    }

    return socialTextParts;
  }

  private static async createLeaderboardPost(
    mysteryId: string,
    socialTextParts: string[]
  ): Promise<void> {
    try {
      await SocialFeedService.createPost(
        LEADERBOARD_SOCIAL_AUTHOR,
        LEADERBOARD_SOCIAL_HANDLE,
        LEADERBOARD_SOCIAL_AVATAR,
        socialTextParts.join('\n'),
        'leaderboard'
      );
    } catch (postErr) {
      console.error(`[LeaderboardWorker] social post failed for mystery=${mysteryId}:`, postErr);
    }
  }

  /**
   * Task 5.1: expanded cache invalidation. A mystery archiving is
   * a major world-state event — NPCs drop the now-archived
   * overlays, the Vault must re-render demoted mementos, and
   * scrubbed characters must disappear from location payloads.
   * All three patterns use ioredis `keys` globbing (same mechanism
   * as dialogue-breakthrough-helpers.ts:131), so per-user keys like
   * `user:vault:${id}:nsfw:${flag}` and `user:location:${id}:${scene}`
   * are all caught.
   */
  private static async invalidateMysteryCaches(): Promise<void> {
    try {
      await invalidatePattern('dialogue:resolved:*');
      await invalidatePattern('user:vault:*');
      await invalidatePattern('user:location:*');
    } catch (err) {
      console.error('[LeaderboardWorker] mystery cache invalidation error:', err);
    }
  }

  /**
   * Aggregates TB-spending per solver via a single bulk OLAP query,
   * then merges with the OLTP solver bounds in Node.js. Avoids the
   * N+1 anti-pattern from the spec's first draft.
   */
  private static async buildLeaderboard(solvers: SolverRow[]): Promise<LeaderboardRow[]> {
    const minStarted = solvers
      .map((s) => s.started_at.getTime())
      .reduce((a, b) => Math.min(a, b));
    const maxSolved = solvers
      .map((s) => s.solved_at.getTime())
      .reduce((a, b) => Math.max(a, b));

    const userIds = solvers.map((s) => s.user_id);
    const olapBounds = new Date(minStarted);
    const olapBoundsEnd = new Date(maxSolved);

    const olapResult = await queryOLAP<OlapUsageRow>(
      `SELECT user_id,
              COALESCE(SUM(time_blocks_cost), 0)::bigint AS tb_spent
         FROM player_events
        WHERE user_id = ANY($1::uuid[])
          AND event_type IN ('move', 'dialogue_choice', 'gig_completed')
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY user_id`,
      [userIds, olapBounds, olapBoundsEnd]
    );
    // Task 5.4: queryOLAP may return null when the analytics database is
    // unreachable. Fall back to an empty rows array so the worker does not
    // crash — leaderboard entries simply won't have tb_spent for this run.
    const rows = olapResult?.rows ?? [];

    const tbByUser = new Map<string, number>();
    for (const row of rows) {
      tbByUser.set(row.user_id, Number(row.tb_spent ?? 0));
    }

    const result: LeaderboardRow[] = solvers.map((solver) => {
      const deltaSeconds = Math.max(
        0,
        Math.floor((solver.solved_at.getTime() - solver.started_at.getTime()) / 1000)
      );
      const tbSpent = tbByUser.get(solver.user_id) ?? 0;
      return {
        userId: solver.user_id,
        username: solver.username,
        tbSpent,
        deltaSeconds,
      };
    });

    result.sort((a, b) => {
      if (a.tbSpent !== b.tbSpent) return a.tbSpent - b.tbSpent;
      return a.deltaSeconds - b.deltaSeconds;
    });

    return result;
  }
}
