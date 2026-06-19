import { queryOLAP } from '../database/connection.js';
import { invalidatePattern } from '../database/redis.js';
import { SocialFeedService } from '../services/SocialFeedService.js';

/**
 * Atomic Breakthrough Solve
 *
 * Runs in the caller's open `withOLTPTransaction` block.
 *
 * Returns one of:
 *   - { kind: 'winner',  mysteryId, isBreakthrough: true  }  — first solver
 *   - { kind: 'solver',  mysteryId, isBreakthrough: false }  — late solve in window
 *   - { kind: 'late',    mysteryId, isBreakthrough: false }  — mystery archived
 *   - { kind: 'unrelated' }                                    — no mystery_solve
 *
 * The atomic "first-to-act" pattern: only one of N concurrent
 * UPDATEs returns a row. The winner transitions ACTIVE → RESOLVING
 * and sets the 24h expiration; all others see status=RESOLVING and
 * fall through to the late/solver branch.
 */
export type BreakthroughResult =
  | { kind: 'winner'; mysteryId: string; isBreakthrough: true }
  | { kind: 'solver'; mysteryId: string; isBreakthrough: false }
  | { kind: 'late'; mysteryId: string; isBreakthrough: false }
  | { kind: 'unrelated' };

export type BreakthroughSolveOutcome = {
  result: BreakthroughResult;
  status:
    | { mysteryId: string; isBreakthrough: true; kind: 'winner' }
    | { mysteryId: string; isBreakthrough: false; kind: 'solver' | 'late' }
    | undefined;
};

export async function processBreakthroughSolve(
  client: any,
  userId: string,
  mysteryId: string | undefined
): Promise<BreakthroughSolveOutcome> {
  const unrelated = (): BreakthroughSolveOutcome => ({
    result: { kind: 'unrelated' },
    status: undefined,
  });

  if (!mysteryId) {
    return unrelated();
  }

  const winnerResult = await client.query(
    `UPDATE mysteries
        SET status = 'RESOLVING',
            expires_at = NOW() + INTERVAL '24 hours'
      WHERE id = $1
        AND status = 'ACTIVE'
      RETURNING id`,
    [mysteryId]
  );

  if (winnerResult.rows.length > 0) {
    await client.query(
      `UPDATE player_mysteries
          SET status = 'SOLVED',
              solved_at = NOW()
        WHERE user_id = $1
          AND mystery_id = $2`,
      [userId, mysteryId]
    );
    const result: BreakthroughResult = {
      kind: 'winner',
      mysteryId,
      isBreakthrough: true,
    };
    return { result, status: { mysteryId, isBreakthrough: true, kind: 'winner' } };
  }

  const statusResult = await client.query(
    'SELECT status FROM mysteries WHERE id = $1',
    [mysteryId]
  );

  if (statusResult.rows.length === 0) {
    return unrelated();
  }

  const currentStatus = statusResult.rows[0].status;
  const playerStatus = currentStatus === 'ARCHIVED' ? 'SOLVED_LATE' : 'SOLVED';

  await client.query(
    `UPDATE player_mysteries
        SET status = $3,
            solved_at = NOW()
      WHERE user_id = $1
          AND mystery_id = $2`,
    [userId, mysteryId, playerStatus]
  );

  if (currentStatus === 'ARCHIVED') {
    const result: BreakthroughResult = {
      kind: 'late',
      mysteryId,
      isBreakthrough: false,
    };
    return { result, status: { mysteryId, isBreakthrough: false, kind: 'late' } };
  }
  const result: BreakthroughResult = {
    kind: 'solver',
    mysteryId,
    isBreakthrough: false,
  };
  return { result, status: { mysteryId, isBreakthrough: false, kind: 'solver' } };
}

/**
 * Post-commit side effects for a Breakthrough solve.
 *
 * Runs after the OLTP transaction has committed. Always:
 *   1. invalidates `dialogue:resolved:*` and `global:feed` cache
 *   2. fires an OLAP `mystery_solved` event
 *   3. (winner only) injects a [BREAKTHROUGH] system post into the
 *      social feed
 *
 * Never throws. All errors are logged with console.error.
 */
export async function emitBreakthroughSideEffects(
  userId: string,
  result: BreakthroughResult
): Promise<void> {
  if (result.kind === 'unrelated') return;

  try {
    await invalidatePattern('dialogue:resolved:*');
  } catch (err) {
    console.error('Breakthrough cache invalidation error:', err);
  }

  queryOLAP(
    `INSERT INTO player_events (id, user_id, event_type, event_data)
     VALUES (gen_random_uuid(), $1, 'mystery_solved', $2)`,
    [userId, JSON.stringify({ mysteryId: result.mysteryId, isBreakthrough: result.isBreakthrough })]
  ).catch((err) => console.error('Breakthrough OLAP event error:', err));

  if (result.kind === 'winner') {
    try {
      await SocialFeedService.createPost(
        'Las Flores Network',
        '@system',
        '',
        '[BREAKTHROUGH] Case closed. The 24h resolution window is now active.',
        'system'
      );
    } catch (err) {
      console.error('Breakthrough social post error:', err);
    }
  }
}
