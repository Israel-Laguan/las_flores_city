import { queryOLTP, queryOLAP, withOLTPTransaction, closeConnections } from '../../src/database/connection.js';
import { closeRedis } from '../../src/database/redis.js';
import { LeaderboardWorker } from '../../src/workers/LeaderboardWorker.js';
import fs from 'fs';
import path from 'path';

// ============================================================
// OLAP Leaderboard Simulation
//
// Creates 5 synthetic players with varying TB spend and solve
// times, injects mocked telemetry into OLAP, and forces the
// Batch Worker to rank them. Asserts that:
//   1. Lowest TB spent wins (efficiency > speed)
//   2. Delta time is the tie-breaker when TB is equal
//   3. The Breakthrough rank (rank=1) is correctly assigned
//
// Uses dedicated synthetic UUIDs to avoid colliding with
// live data. Cleans up in afterAll.
// ============================================================

const MYSTERY_ID = 'a0000000-e29b-41d4-a716-446655440001';

type PlayerSpec = {
  name: string;
  email: string;
  tbSpent: number;
  deltaTimeSecs: number;
  expectedRank: number;
  expectedBreakthrough: boolean;
};

const PLAYERS: PlayerSpec[] = [
  { name: 'SimPlayerA', email: 'sim-a@test.com', tbSpent: 10, deltaTimeSecs: 300, expectedRank: 3, expectedBreakthrough: false },
  { name: 'SimPlayerB', email: 'sim-b@test.com', tbSpent: 15, deltaTimeSecs: 100, expectedRank: 4, expectedBreakthrough: false },
  { name: 'SimPlayerC', email: 'sim-c@test.com', tbSpent: 5,  deltaTimeSecs: 600, expectedRank: 1, expectedBreakthrough: true },
  { name: 'SimPlayerD', email: 'sim-d@test.com', tbSpent: 10, deltaTimeSecs: 200, expectedRank: 2, expectedBreakthrough: false },
  { name: 'SimPlayerE', email: 'sim-e@test.com', tbSpent: 50, deltaTimeSecs: 50,  expectedRank: 5, expectedBreakthrough: false },
];

// Fixed synthetic UUIDs to avoid hex-collision from similar names
const PLAYER_IDS: Record<string, string> = {
  SimPlayerA: 'd0000000-0000-4000-8000-00000000000a',
  SimPlayerB: 'd0000000-0000-4000-8000-00000000000b',
  SimPlayerC: 'd0000000-0000-4000-8000-00000000000c',
  SimPlayerD: 'd0000000-0000-4000-8000-00000000000d',
  SimPlayerE: 'd0000000-0000-4000-8000-00000000000e',
};

let createdUserIds: string[] = [];

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  try {
    await queryOLTP(sql);
  } catch {
    // Migration may already be applied
  }
}

async function ensurePublicProfile(userId: string, username: string): Promise<void> {
  await queryOLTP(
    `INSERT INTO public_profiles (user_id, badges)
     VALUES ($1, '[]'::jsonb)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

describe('OLAP Leaderboard Simulation', () => {
  beforeAll(async () => {
    createdUserIds = [];
    await applyMigration('017_mystery_state.sql');
    await applyMigration('021_leaderboards.sql');

    // 1. Ensure the mystery exists in RESOLVING status with
    //    expires_at well in the past so the worker picks it up.
    await queryOLTP(
      `INSERT INTO mysteries (id, title, description, status, expires_at)
       VALUES ($1, 'Test Old Town Leak', 'Simulation test mystery', 'RESOLVING', NOW() - INTERVAL '10 minutes')
       ON CONFLICT (id) DO UPDATE SET
         status = 'RESOLVING',
         expires_at = NOW() - INTERVAL '10 minutes'`,
      [MYSTERY_ID]
    );

    // 2. Create synthetic players and seed their participation.
    for (const p of PLAYERS) {
      const uid = PLAYER_IDS[p.name];
      createdUserIds.push(uid);

      await queryOLTP(
        `INSERT INTO users (id, email, username, display_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [uid, p.email, p.name.toLowerCase(), p.name]
      );
      await queryOLTP(
        `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
         VALUES ($1, 48, 0, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
         ON CONFLICT (user_id) DO NOTHING`,
        [uid]
      );

      await ensurePublicProfile(uid, p.name.toLowerCase());

      const startTime = new Date(Date.now() - p.deltaTimeSecs * 1000).toISOString();
      const solveTime = new Date().toISOString();

      await queryOLTP(
        `INSERT INTO player_mysteries (user_id, mystery_id, status, started_at, solved_at)
         VALUES ($1, $2, 'SOLVED', $3, $4)
         ON CONFLICT (user_id, mystery_id) DO UPDATE SET
           status = 'SOLVED',
           started_at = $3,
           solved_at = $4`,
        [uid, MYSTERY_ID, startTime, solveTime]
      );

      // 3. Inject synthetic OLAP telemetry.
      //    Use a 'move' event type (valid in the worker's IN clause)
      //    with the desired total TB cost. Place the event within
      //    the solver's time window.
      await queryOLAP(
        `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost, created_at)
         VALUES (gen_random_uuid(), $1, 'move', $2, $3, $4)`,
        [
          uid,
          JSON.stringify({ mystery_id: MYSTERY_ID, simulation: true }),
          p.tbSpent,
          solveTime,
        ]
      );
    }
  });

  afterAll(async () => {
    try {
      // Cleanup synthetic data
      for (const uid of createdUserIds) {
        await queryOLTP(`DELETE FROM public_profiles WHERE user_id = $1`, [uid]);
      }
      await queryOLTP(
        `DELETE FROM player_mysteries WHERE mystery_id = $1`,
        [MYSTERY_ID]
      );
      await queryOLTP(
        `DELETE FROM leaderboards WHERE mystery_id = $1`,
        [MYSTERY_ID]
      );
      await queryOLAP(
        `DELETE FROM player_events
         WHERE event_data->>'mystery_id' = $1
           AND event_data->>'simulation' = 'true'`,
        [MYSTERY_ID]
      );
      for (const uid of createdUserIds) {
        await queryOLTP(`DELETE FROM player_states WHERE user_id = $1`, [uid]);
      }
      await queryOLTP(
        `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        [createdUserIds]
      );
      await queryOLTP(
        `DELETE FROM mysteries WHERE id = $1`,
        [MYSTERY_ID]
      );
    } catch (err) {
      console.error('leaderboard.simulation cleanup error:', err);
    } finally {
      await closeConnections();
      await closeRedis();
    }
  });

  test('Leaderboard accurately ranks players by TB spent, then Delta Time', async () => {
    // 4. Force the Batch Worker to run
    await LeaderboardWorker.processExpiredMysteries();

    // 5. Assert Rankings from the OLTP Leaderboard table
    const { rows } = await queryOLTP<{
      username: string;
      rank: number;
      total_tb_spent: number;
      is_breakthrough: boolean;
    }>(
      `SELECT u.username, l.rank, l.total_tb_spent, l.is_breakthrough
       FROM leaderboards l
       JOIN users u ON l.user_id = u.id
       WHERE l.mystery_id = $1
       ORDER BY l.rank ASC`,
      [MYSTERY_ID]
    );

    expect(rows).toHaveLength(5);

    // Verify each player's rank and breakthrough status
    for (const p of PLAYERS) {
      const row = rows.find((r) => r.username === p.name.toLowerCase());
      expect(row).toBeDefined();
      expect(row!.rank).toBe(p.expectedRank);
      expect(row!.is_breakthrough).toBe(p.expectedBreakthrough);
    }

    // Spot-check the top 3 for clarity
    // PlayerC: 5 TB (lowest) → Rank 1, Breakthrough
    expect(rows[0].username).toBe('simplayerc');
    expect(rows[0].rank).toBe(1);
    expect(rows[0].is_breakthrough).toBe(true);

    // PlayerD: 10 TB, 200s → Rank 2 (tie-breaker: faster than A)
    expect(rows[1].username).toBe('simplayerd');
    expect(rows[1].rank).toBe(2);

    // PlayerA: 10 TB, 300s → Rank 3 (lost tie-breaker to D)
    expect(rows[2].username).toBe('simplayera');
    expect(rows[2].rank).toBe(3);

    // PlayerB: 15 TB → Rank 4
    expect(rows[3].username).toBe('simplayerb');
    expect(rows[3].rank).toBe(4);

    // PlayerE: 50 TB → Rank 5
    expect(rows[4].username).toBe('simplayere');
    expect(rows[4].rank).toBe(5);
  });

  test('Mystery is ARCHIVED after worker processes it', async () => {
    const { rows } = await queryOLTP<{ status: string }>(
      `SELECT status FROM mysteries WHERE id = $1`,
      [MYSTERY_ID]
    );
    expect(rows[0].status).toBe('ARCHIVED');
  });

  test('Idempotent: running worker again does not duplicate leaderboard entries', async () => {
    const beforeCount = await queryOLTP<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM leaderboards WHERE mystery_id = $1`,
      [MYSTERY_ID]
    );

    await LeaderboardWorker.processExpiredMysteries();

    const afterCount = await queryOLTP<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM leaderboards WHERE mystery_id = $1`,
      [MYSTERY_ID]
    );

    expect(parseInt(afterCount.rows[0].count, 10)).toBe(
      parseInt(beforeCount.rows[0].count, 10)
    );
  });
});
