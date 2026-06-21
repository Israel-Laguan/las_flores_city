import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import { queryOLTP, queryOLAP, withOLTPTransaction, closeConnections } from '../../src/database/connection.js';
import { closeRedis } from '../../src/database/redis.js';
import { dialogueRouter } from '../../src/routes/dialogue.js';
import { generateToken } from '../../src/middleware/auth.js';
import { processBreakthroughSolve } from '../../src/routes/dialogue-breakthrough-helpers.js';

// ============================================================
// Breakthrough Concurrency Test (50 simultaneous requests)
//
// Primary gate: 50 concurrent POST /dialogue/:id/choose at the
// mystery_solve node. Exactly one response has isBreakthrough.
// Helper-level sub-test keeps the atomic lock regression fast.
// ============================================================

const TEST_MYSTERY_ID = 'c0000000-d000-4000-8000-000000000001';
const TEST_TREE_ID = 'f1111111-1111-4111-8111-aaaaaaaaaaaa';
const SOLVE_NODE_ID = 'solve_node';
const END_NODE_ID = 'end_node';
const NUM_CONCURRENT = 50;

const solveNodes = {
  [SOLVE_NODE_ID]: {
    id: SOLVE_NODE_ID,
    type: 'narrator',
    text: 'Submit your solution?',
    choices: [
      {
        id: 'c_solve',
        text: 'Submit solution',
        next_node_id: END_NODE_ID,
        mystery_solve: TEST_MYSTERY_ID,
      },
    ],
  },
  [END_NODE_ID]: {
    id: END_NODE_ID,
    type: 'narrator',
    text: 'Case filed.',
    is_end: true,
  },
};

const app = express();
app.use(express.json());
app.use('/dialogue', dialogueRouter);

let server: ReturnType<typeof express.Application.listen>;
let port: number;

const generateTestUserIds = (): string[] => {
  const users: string[] = [];
  for (let i = 0; i < NUM_CONCURRENT; i++) {
    const hex = (i + 1).toString(16).padStart(12, '0');
    users.push(`e0000000-0000-4000-8000-${hex}`);
  }
  return users;
};

async function seedDialogueTree(): Promise<void> {
  await queryOLTP(
    `INSERT INTO dialogue_trees (id, name, start_node_id, nodes)
     VALUES ($1, 'Concurrency Solve Tree', $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       start_node_id = EXCLUDED.start_node_id,
       nodes = EXCLUDED.nodes`,
    [TEST_TREE_ID, SOLVE_NODE_ID, JSON.stringify(solveNodes)]
  );
}

async function positionUserForSolve(userId: string): Promise<void> {
  await queryOLTP(
    `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, choices_made)
     VALUES ($1, $2, $3, '[]')
     ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET
       current_node_id = EXCLUDED.current_node_id`,
    [userId, TEST_TREE_ID, SOLVE_NODE_ID]
  );
}

async function setupTestFixtures(): Promise<string[]> {
  const userIds = generateTestUserIds();

  // Apply migrations needed for mystery status constraint
  const fs = await import('fs');
  const path = await import('path');
  const applyMigration = async (filename: string) => {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), 'src/database/migrations', filename),
      'utf-8'
    );
    try {
      await queryOLTP(sql);
    } catch {
      // Column may already exist
    }
  };
  await applyMigration('017_mystery_state.sql');
  await applyMigration('021_leaderboards.sql');

  await seedDialogueTree();

  for (const userId of userIds) {
    await queryOLTP(
      `INSERT INTO users (id, email, username, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, username = EXCLUDED.username`,
      [
        userId,
        `${userId}@test.com`,
        `concurrency_test_${userIds.indexOf(userId)}`,
        `Concurrency Test ${userIds.indexOf(userId)}`,
      ]
    );
    await queryOLTP(
      `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
       VALUES ($1, 48, 100, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
       ON CONFLICT (user_id) DO UPDATE SET time_blocks = 48, credits = 100`,
      [userId]
    );
  }

  await queryOLTP(
    `INSERT INTO mysteries (id, title, description, status)
     VALUES ($1, 'Concurrency Test Mystery', '50-way race condition test', 'ACTIVE')
     ON CONFLICT (id) DO UPDATE SET
       status = 'ACTIVE',
       expires_at = NULL`,
    [TEST_MYSTERY_ID]
  );

  for (const userId of userIds) {
    await queryOLTP(
      `INSERT INTO player_mysteries (user_id, mystery_id, status)
       VALUES ($1, $2, 'INVESTIGATING')
       ON CONFLICT (user_id, mystery_id) DO UPDATE SET
         status = 'INVESTIGATING',
         solved_at = NULL`,
      [userId, TEST_MYSTERY_ID]
    );
    await positionUserForSolve(userId);
  }

  return userIds;
}

async function cleanupTestFixtures(userIds: string[]): Promise<void> {
  await queryOLTP(
    `DELETE FROM player_dialogue_states WHERE dialogue_tree_id = $1`,
    [TEST_TREE_ID]
  );
  await queryOLTP(
    `DELETE FROM player_mysteries WHERE mystery_id = $1`,
    [TEST_MYSTERY_ID]
  );
  await queryOLTP(
    `DELETE FROM mysteries WHERE id = $1`,
    [TEST_MYSTERY_ID]
  );
  await queryOLTP(
    `DELETE FROM dialogue_trees WHERE id = $1`,
    [TEST_TREE_ID]
  );
  await queryOLTP(
    `DELETE FROM users WHERE id = ANY($1::uuid[])`,
    [userIds]
  );
}

async function postChoose(userId: string): Promise<{
  ok: boolean;
  isBreakthrough: boolean;
  kind?: string;
}> {
  const res = await fetch(`http://localhost:${port}/dialogue/${TEST_TREE_ID}/choose`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(userId)}`,
    },
    body: JSON.stringify({ choiceIndex: 0 }),
  });

  const body = (await res.json()) as {
    success: boolean;
    data?: { mystery_solve_status?: { isBreakthrough: boolean; kind: string } };
  };

  return {
    ok: res.ok && body.success,
    isBreakthrough: body.data?.mystery_solve_status?.isBreakthrough === true,
    kind: body.data?.mystery_solve_status?.kind,
  };
}

describe('Breakthrough Concurrency Test - 50 Simultaneous Requests', () => {
  let userIds: string[] = [];

  beforeAll(async () => {
    userIds = await setupTestFixtures();
    server = await new Promise<ReturnType<typeof express.Application.listen>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    try {
      await cleanupTestFixtures(userIds);
    } catch (err) {
      console.error('breakthrough.concurrency.test.ts cleanup error:', err);
    } finally {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      await closeConnections();
      await closeRedis();
    }
  });

  test('Exactly 1 of 50 concurrent POST /dialogue/choose requests is breakthrough', async () => {
    await queryOLTP(
      `UPDATE mysteries SET status = 'ACTIVE', expires_at = NULL WHERE id = $1`,
      [TEST_MYSTERY_ID]
    );
    await queryOLTP(
      `UPDATE player_mysteries SET status = 'INVESTIGATING', solved_at = NULL WHERE mystery_id = $1`,
      [TEST_MYSTERY_ID]
    );
    for (const userId of userIds) {
      await positionUserForSolve(userId);
    }

    const results = await Promise.all(userIds.map((userId) => postChoose(userId)));

    expect(results.every((r) => r.ok)).toBe(true);

    const breakthroughs = results.filter((r) => r.isBreakthrough);
    const solvers = results.filter((r) => r.kind === 'solver');

    expect(breakthroughs.length).toBe(1);
    expect(solvers.length).toBe(NUM_CONCURRENT - 1);

    const mysteryResult = await queryOLTP<{ status: string }>(
      `SELECT status FROM mysteries WHERE id = $1`,
      [TEST_MYSTERY_ID]
    );
    expect(mysteryResult.rows[0].status).toBe('RESOLVING');

    const playerResult = await queryOLTP<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM player_mysteries
       WHERE mystery_id = $1 AND status = 'SOLVED'`,
      [TEST_MYSTERY_ID]
    );
    expect(parseInt(playerResult.rows[0].count, 10)).toBe(NUM_CONCURRENT);
  }, 30000);

  test('When mystery is RESOLVING, concurrent chooses yield 0 breakthroughs', async () => {
    await queryOLTP(
      `UPDATE mysteries SET status = 'RESOLVING', expires_at = NOW() + INTERVAL '24 hours' WHERE id = $1`,
      [TEST_MYSTERY_ID]
    );
    await queryOLTP(
      `UPDATE player_mysteries SET status = 'INVESTIGATING', solved_at = NULL WHERE mystery_id = $1`,
      [TEST_MYSTERY_ID]
    );
    for (const userId of userIds) {
      await positionUserForSolve(userId);
    }

    const results = await Promise.all(userIds.map((userId) => postChoose(userId)));

    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.isBreakthrough).length).toBe(0);
    expect(results.filter((r) => r.kind === 'solver').length).toBe(NUM_CONCURRENT);
  }, 30000);

  test('Helper-level: atomic processBreakthroughSolve prevents multiple winners', async () => {
    await queryOLTP(
      `UPDATE mysteries SET status = 'ACTIVE', expires_at = NULL WHERE id = $1`,
      [TEST_MYSTERY_ID]
    );
    await queryOLTP(
      `UPDATE player_mysteries SET status = 'INVESTIGATING', solved_at = NULL WHERE mystery_id = $1`,
      [TEST_MYSTERY_ID]
    );

    const promises = userIds.map((userId) =>
      withOLTPTransaction(async (client) =>
        processBreakthroughSolve(client, userId, TEST_MYSTERY_ID)
      )
    );

    const results = await Promise.all(promises);
    const winners = results.filter((r) => r.result.kind === 'winner');
    const solvers = results.filter((r) => r.result.kind === 'solver');

    expect(winners.length).toBe(1);
    expect(solvers.length).toBe(NUM_CONCURRENT - 1);
  }, 30000);
});
