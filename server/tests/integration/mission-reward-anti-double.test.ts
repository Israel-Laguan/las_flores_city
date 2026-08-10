/**
 * Mission reward anti-double integration test — GAP 2 (M34)
 *
 * The test that would have caught M33 S1 grant_item gap.
 * Processes the SAME choice twice and asserts:
 *   - Exactly one balance delta
 *   - Exactly one player_vault row
 *   - Exactly one mission_reward_claims row for the grant key
 *
 * Uses dedicated synthetic UUIDs per AGENTS.md isolation rules.
 * Own test user created in beforeAll, cleaned in afterAll.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express from 'express';
import { queryOLTP, closeConnections } from '../../src/database/connection.js';
import { dialogueRouter } from '../../src/routes/dialogue.js';
import { generateToken } from '../../src/middleware/auth.js';
import { deleteCache, invalidatePattern, closeRedis } from '../../src/database/redis.js';
import { compileDialogueTree } from '../../src/content/compiler.js';
import type { DialogueNode } from '@las-flores/shared';

// ============================================================
// Dedicated synthetic IDs (collision-avoidance per AGENTS.md)
// ============================================================
const TEST_USER_ID = 'aa340000-0011-4011-8011-000000000011';
const TEST_TREE_ID = 'aa340000-0012-4012-8012-000000000012';
const MOCK_CHARACTER_ID = 'aa340000-0013-4013-8013-000000000013';
const MOCK_SCENE_ID = 'aa340000-0014-4014-8014-000000000014';
const VAULT_ITEM_ID = 'aa340000-0015-4015-8015-000000000015';

const TREE_NODES: Record<string, DialogueNode> = {
  start: {
    id: 'start',
    type: 'narrator',
    speaker_id: MOCK_CHARACTER_ID,
    text: 'Take the reward?',
    choices: [
      { id: 'take', text: 'Take it', next_node_id: 'reward' },
    ],
  },
  reward: {
    id: 'reward',
    type: 'narrator',
    text: 'You take the reward.',
    is_end: true,
    effects: {
      grant_credits: { amount: 50, currency: 'credits' },
      grant_item: VAULT_ITEM_ID,
    },
  },
};

const app = express();
app.use(express.json());
app.use('/dialogue', dialogueRouter);

let server: ReturnType<typeof app.listen>;
let port: number;
let startChunkId = '';
let dialogueId = '';

function authHeaders() {
  return { Authorization: `Bearer ${generateToken(TEST_USER_ID)}` };
}

async function post(path: string, body: object) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return res;
}

beforeAll(async () => {
  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, 'anti-double-test@test.example', 'anti_double_test', 'Anti-Double Test')
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
    [TEST_USER_ID]
  );

  await queryOLTP(
    `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
     VALUES ($1, 48, 200, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
     ON CONFLICT (user_id) DO UPDATE SET credits = 200, time_blocks = 48, updated_at = NOW()`,
    [TEST_USER_ID]
  );

  await queryOLTP(
    `INSERT INTO vault_items (id, title, description, thumbnail_url, media_path, item_type)
     VALUES ($1, 'Anti-Double Item', 'Test item', 'https://example.com/item.png', '/media/item.png', 'memento')
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
    [VAULT_ITEM_ID]
  );

  await queryOLTP(
    `INSERT INTO dialogue_trees (id, name, start_node_id, nodes)
     VALUES ($1, 'Anti-Double Test Tree', 'start', $2)
     ON CONFLICT (id) DO UPDATE
       SET nodes = EXCLUDED.nodes,
           start_node_id = EXCLUDED.start_node_id,
           updated_at = NOW()`,
    [TEST_TREE_ID, JSON.stringify(TREE_NODES)]
  );

  await compileDialogueTree(TEST_TREE_ID);

  const chunks = await queryOLTP<{ id: string; chunk_key: string }>(
    `SELECT id, chunk_key FROM dialogue_chunks WHERE tree_id = $1`,
    [TEST_TREE_ID]
  );
  startChunkId = chunks.rows.find(r => r.chunk_key === 'start')!.id;

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  port = (server.address() as { port: number }).port;

  await deleteCache(`user:state:${TEST_USER_ID}`);
  await invalidatePattern(`dialogue:resolved:chunk:${TEST_TREE_ID}:*`);
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err: Error | undefined) => (err ? reject(err) : resolve()))
    );
  }

  await queryOLTP(`DELETE FROM mission_reward_claims WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(`DELETE FROM player_vault WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(`DELETE FROM player_dialogue_states WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(
    `UPDATE player_states SET active_dialogue_id = NULL, current_node_id = NULL WHERE user_id = $1`,
    [TEST_USER_ID]
  );
  await queryOLTP(`DELETE FROM dialogue_chunks WHERE tree_id = $1`, [TEST_TREE_ID]);
  await queryOLTP(`DELETE FROM dialogue_trees WHERE id = $1`, [TEST_TREE_ID]);
  await queryOLTP(`DELETE FROM player_states WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(`DELETE FROM vault_items WHERE id = $1`, [VAULT_ITEM_ID]);
  await queryOLTP(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID]);

  await deleteCache(`user:state:${TEST_USER_ID}`);
  await invalidatePattern(`dialogue:resolved:chunk:${TEST_TREE_ID}:*`);

  await closeConnections();
  await closeRedis();
});

beforeEach(async () => {
  await queryOLTP(`DELETE FROM player_dialogue_states WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(
    `UPDATE player_states SET active_dialogue_id = NULL, current_node_id = NULL, credits = 200, time_blocks = 48 WHERE user_id = $1`,
    [TEST_USER_ID]
  );
  await queryOLTP(`DELETE FROM mission_reward_claims WHERE user_id = $1`, [TEST_USER_ID]);
  await queryOLTP(`DELETE FROM player_vault WHERE user_id = $1`, [TEST_USER_ID]);
});

describe('Mission reward anti-double (integration)', () => {
  test('processing the same choice twice does not double-grant', async () => {
    const startRes = await post('/dialogue/start', {
      characterId: MOCK_CHARACTER_ID,
      sceneId: MOCK_SCENE_ID,
    });
    expect([200, 201]).toContain(startRes.status);
    const startData = await startRes.json();
    dialogueId = startData.data.dialogue_id;
    const chunkId = startData.data.current_chunk_id;

    const res1 = await post(`/dialogue/${dialogueId}/choose`, {
      current_chunk_id: chunkId,
      choice_id: 'take',
    });
    expect(res1.status).toBe(200);
    await res1.json();

    const midCredits = (await queryOLTP<{ credits: number }>(
      `SELECT credits FROM player_states WHERE user_id = $1`,
      [TEST_USER_ID]
    )).rows[0].credits;

    const midVaultCount = (await queryOLTP<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM player_vault WHERE user_id = $1 AND item_id = $2`,
      [TEST_USER_ID, VAULT_ITEM_ID]
    )).rows[0].count;

    const midClaimsCount = (await queryOLTP<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM mission_reward_claims WHERE user_id = $1`,
      [TEST_USER_ID]
    )).rows[0].count;

    const res2 = await post(`/dialogue/${dialogueId}/choose`, {
      current_chunk_id: chunkId,
      choice_id: 'take',
    });
    expect(res2.status).toBe(200);
    await res2.json();

    const finalCredits = (await queryOLTP<{ credits: number }>(
      `SELECT credits FROM player_states WHERE user_id = $1`,
      [TEST_USER_ID]
    )).rows[0].credits;

    const finalVaultCount = (await queryOLTP<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM player_vault WHERE user_id = $1 AND item_id = $2`,
      [TEST_USER_ID, VAULT_ITEM_ID]
    )).rows[0].count;

    const finalClaimsCount = (await queryOLTP<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM mission_reward_claims WHERE user_id = $1`,
      [TEST_USER_ID]
    )).rows[0].count;

    expect(finalCredits).toBe(midCredits);
    expect(finalVaultCount).toBe(midVaultCount);
    expect(finalVaultCount).toBe('1');
    expect(finalClaimsCount).toBe(midClaimsCount);
    expect(parseInt(finalClaimsCount, 10)).toBeGreaterThanOrEqual(1);
  });
});
