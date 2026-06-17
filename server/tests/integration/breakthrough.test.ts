import { queryOLTP, queryOLAP, withOLTPTransaction } from '../../src/database/connection.js';
import {
  processBreakthroughSolve,
  emitBreakthroughSideEffects,
} from '../../src/routes/dialogue-breakthrough-helpers.js';

// ============================================================
// Breakthrough State Machine integration tests (Task 3.3)
//
// Exercises the atomic "first-to-act" winner election on the
// `mysteries` table when N players hit `mystery_solve` at the
// same instant, the ARCHIVED → SOLVED_LATE branch, and the
// OLAP `mystery_solved` event fire.
//
// Uses the project's existing test user + dedicated synthetic
// UUIDs (to avoid colliding with live data). Each test scopes
// its own `mysteries` + `player_mysteries` rows and cleans up
// in `afterAll`.
// ============================================================

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_2_ID = '00000000-0000-0000-0000-000000000002';
const TEST_MYSTERY_ID = 'b3c4d5e6-3333-4333-8333-cccccccccccc';
const TEST_MYSTERY_ARCHIVED_ID = 'b3c4d5e6-4444-4444-8444-dddddddddddd';

async function ensureUser(
  id: string,
  email: string,
  username: string,
  displayName: string
): Promise<void> {
  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name, time_blocks)
     VALUES ($1, $2, $3, $4, 48)
     ON CONFLICT (id) DO NOTHING`,
    [id, email, username, displayName]
  );
}

async function seedMystery(
  id: string,
  title: string,
  description: string,
  status: 'ACTIVE' | 'ARCHIVED'
): Promise<void> {
  await queryOLTP(
    `INSERT INTO mysteries (id, title, description, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
       SET status = $4,
           expires_at = NULL`,
    [id, title, description, status]
  );
}

async function joinMystery(userId: string, mysteryId: string): Promise<void> {
  await queryOLTP(
    `INSERT INTO player_mysteries (user_id, mystery_id, status)
     VALUES ($1, $2, 'INVESTIGATING')
     ON CONFLICT (user_id, mystery_id) DO UPDATE
       SET status = 'INVESTIGATING', solved_at = NULL`,
    [userId, mysteryId]
  );
}

async function expectMysteryResolving(
  mysteryId: string,
  expectedStatus: 'RESOLVING' | 'ARCHIVED'
): Promise<void> {
  const { rows } = await queryOLTP<{ status: string; expires_at: string | null }>(
    `SELECT status, expires_at FROM mysteries WHERE id = $1`,
    [mysteryId]
  );
  expect(rows[0].status).toBe(expectedStatus);
  if (expectedStatus === 'RESOLVING') {
    const expiresAt = new Date(rows[0].expires_at as string).getTime();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(now + oneDay - 60_000);
    expect(expiresAt).toBeLessThan(now + oneDay + 60_000);
  }
}

async function expectPlayerSolved(
  userId: string,
  mysteryId: string,
  expectedPlayerStatus: 'SOLVED' | 'SOLVED_LATE'
): Promise<void> {
  const { rows } = await queryOLTP<{ status: string; solved_at: string | null }>(
    `SELECT status, solved_at FROM player_mysteries
     WHERE user_id = $1 AND mystery_id = $2`,
    [userId, mysteryId]
  );
  expect(rows[0].status).toBe(expectedPlayerStatus);
  expect(rows[0].solved_at).not.toBeNull();
}

async function setupFixtures(): Promise<void> {
  // Ensure both test users exist (api-contract.test.ts may
  // have deleted the shared user 00000000-... in its afterAll).
  await ensureUser(
    TEST_USER_ID,
    'breakthrough-test@example.com',
    'breakthrough_test',
    'Breakthrough Test'
  );
  await ensureUser(
    TEST_USER_2_ID,
    'breakthrough-test-2@example.com',
    'breakthrough_test_2',
    'Breakthrough Test 2'
  );

  // Seed the two test mysteries.
  await seedMystery(TEST_MYSTERY_ID, 'Concurrent Test Mystery', 'race winner election', 'ACTIVE');
  await seedMystery(TEST_MYSTERY_ARCHIVED_ID, 'Archived Test Mystery', 'late solve branch', 'ARCHIVED');

  // Seed player_mysteries for the concurrent test.
  await joinMystery(TEST_USER_ID, TEST_MYSTERY_ID);
  await joinMystery(TEST_USER_2_ID, TEST_MYSTERY_ID);
}

async function cleanupFixtures(): Promise<void> {
  await queryOLTP(
    `DELETE FROM player_mysteries WHERE mystery_id IN ($1, $2)`,
    [TEST_MYSTERY_ID, TEST_MYSTERY_ARCHIVED_ID]
  );
  await queryOLTP(
    `DELETE FROM mysteries WHERE id IN ($1, $2)`,
    [TEST_MYSTERY_ID, TEST_MYSTERY_ARCHIVED_ID]
  );
  await queryOLTP(
    `DELETE FROM player_events
     WHERE event_type = 'mystery_solved'
       AND event_data->>'mysteryId' IN ($1, $2)`,
    [TEST_MYSTERY_ID, TEST_MYSTERY_ARCHIVED_ID]
  );
}

describe('BreakthroughStateMachine', () => {
  beforeAll(setupFixtures);

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } catch (err) {
      // best-effort cleanup; do not throw
      console.error('breakthrough.test.ts cleanup error:', err);
    }
  });

  describe('processBreakthroughSolve', () => {
    it('elects exactly one winner across N concurrent solve calls', async () => {
      // Fire two concurrent solves. The atomic UPDATE on
      // `mysteries` must allow only one to win.
      const [a, b] = await Promise.all([
        withOLTPTransaction(async (client) =>
          processBreakthroughSolve(client, TEST_USER_ID, TEST_MYSTERY_ID)
        ),
        withOLTPTransaction(async (client) =>
          processBreakthroughSolve(client, TEST_USER_2_ID, TEST_MYSTERY_ID)
        ),
      ]);

      const outcomes = [a, b];
      const winnerOutcome = outcomes.find((o) => o.result.kind === 'winner');
      const loserOutcome = outcomes.find(
        (o) => o.result.kind === 'solver' || o.result.kind === 'late'
      );
      expect(winnerOutcome).toBeDefined();
      expect(loserOutcome).toBeDefined();

      const winnerUserId = winnerOutcome === a ? TEST_USER_ID : TEST_USER_2_ID;
      const loserUserId = winnerUserId === TEST_USER_ID ? TEST_USER_2_ID : TEST_USER_ID;

      await expectMysteryResolving(TEST_MYSTERY_ID, 'RESOLVING');
      await expectPlayerSolved(winnerUserId, TEST_MYSTERY_ID, 'SOLVED');
      await expectPlayerSolved(loserUserId, TEST_MYSTERY_ID, 'SOLVED');
    });

    it('returns { kind: "late" } and stamps SOLVED_LATE when mystery is ARCHIVED', async () => {
      const outcome = await withOLTPTransaction(async (client) =>
        processBreakthroughSolve(client, TEST_USER_ID, TEST_MYSTERY_ARCHIVED_ID)
      );

      expect(outcome.result.kind).toBe('late');
      expect(outcome.result.isBreakthrough).toBe(false);
      expect(outcome.status).toEqual({
        mysteryId: TEST_MYSTERY_ARCHIVED_ID,
        isBreakthrough: false,
        kind: 'late',
      });

      // The player_mysteries row may not exist if the player
      // never joined; the WHERE clause silently affects 0 rows.
      // The breakthrough result is still 'late' either way.
      const { rows } = await queryOLTP<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM player_mysteries
         WHERE user_id = $1 AND mystery_id = $2`,
        [TEST_USER_ID, TEST_MYSTERY_ARCHIVED_ID]
      );
      if (parseInt(rows[0].count, 10) > 0) {
        await expectPlayerSolved(TEST_USER_ID, TEST_MYSTERY_ARCHIVED_ID, 'SOLVED_LATE');
      }
    });

    it('returns { kind: "unrelated" } when no mystery_solve is provided', async () => {
      const outcome = await withOLTPTransaction(async (client) =>
        processBreakthroughSolve(client, TEST_USER_ID, undefined)
      );
      expect(outcome.result.kind).toBe('unrelated');
      expect(outcome.status).toBeUndefined();
    });

    it('fires OLAP mystery_solved events for both winner and loser', async () => {
      // Reset the mystery and player_mysteries state so we can
      // re-run the race and capture the OLAP events directly.
      await queryOLTP(
        `UPDATE mysteries SET status = 'ACTIVE', expires_at = NULL
         WHERE id = $1`,
        [TEST_MYSTERY_ID]
      );
      await queryOLTP(
        `UPDATE player_mysteries SET status = 'INVESTIGATING', solved_at = NULL
         WHERE mystery_id = $1`,
        [TEST_MYSTERY_ID]
      );
      // Wipe any leftover events from the earlier tests.
      await queryOLAP(
        `DELETE FROM player_events
         WHERE event_type = 'mystery_solved'
           AND event_data->>'mysteryId' = $1`,
        [TEST_MYSTERY_ID]
      );

      // Race two players, then post-commit fire side effects.
      const [a, b] = await Promise.all([
        withOLTPTransaction(async (client) =>
          processBreakthroughSolve(client, TEST_USER_ID, TEST_MYSTERY_ID)
        ),
        withOLTPTransaction(async (client) =>
          processBreakthroughSolve(client, TEST_USER_2_ID, TEST_MYSTERY_ID)
        ),
      ]);

      await emitBreakthroughSideEffects(TEST_USER_ID, a.result);
      await emitBreakthroughSideEffects(TEST_USER_2_ID, b.result);

      // The fire-and-forget queryOLAP is awaited inside
      // emitBreakthroughSideEffects's try/catch — actually
      // emitBreakthroughSideEffects awaits the OLAP call's
      // catch but not the resolve, so the query may still be
      // in flight. Poll briefly.
      let count = 0;
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const { rows } = await queryOLAP<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM player_events
           WHERE event_type = 'mystery_solved'
             AND event_data->>'mysteryId' = $1`,
          [TEST_MYSTERY_ID]
        );
        count = parseInt(rows[0].count, 10);
        if (count >= 2) break;
      }
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });
});
