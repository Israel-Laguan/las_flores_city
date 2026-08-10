/**
 * Mission reward integration tests — GAP 1 & 2 (M34)
 *
 * Seeds a dialogue tree with reward-bearing nodes and exercises the
 * full HTTP route path (start -> choose) to verify:
 *   - grant_credits modifies player_states.credits
 *   - grant_item inserts into player_vault
 *   - mission_reward_claims rows are written
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
const TEST_USER_ID = 'aa340000-0001-4001-8001-000000000001';
const TEST_TREE_ID = 'aa340000-0002-4002-8002-000000000002';
const MOCK_CHARACTER_ID = 'aa340000-0003-4003-8003-000000000003';
const MOCK_SCENE_ID = 'aa340000-0004-4004-8004-000000000004';
const VAULT_ITEM_ID = 'aa340000-0005-4005-8005-000000000005';

// Minimal two-chunk tree with reward effects on destination node:
//   Chunk 1 (key = 'start'):
//     start -> accept  [FREE leaf -> reward node]
//     start -> decline [FREE leaf -> decline_end]
//   Chunk 2 (key = 'reward'):
//     reward (is_end: true, effects: grant_credits + grant_item)
//   Chunk 3 (key = 'decline_end'):
//     decline_end (is_end: true)
const TREE_NODES: Record<string, DialogueNode> = {
  start: {
    id: 'start',
    type: 'narrator',
    speaker_id: MOCK_CHARACTER_ID,
    text: 'Do you accept the mission?',
    choices: [
      { id: 'accept', text: 'Accept', next_node_id: 'reward' },
      { id: 'decline', text: 'Decline', next_node_id: 'decline_end' },
    ],
  },
  reward: {
    id: 'reward',
    type: 'narrator',
    text: 'Here is your reward.',
    is_end: true,
    effects: {
      grant_credits: { amount: 100, currency: 'credits' },
      grant_item: VAULT_ITEM_ID,
    },
  },
  decline_end: {
    id: 'decline_end',
    type: 'narrator',
    text: 'Maybe later.',
    is_end: true,
  },
};

// Express app
const app = express();
app.use(express.json());
app.use('/dialogue', dialogueRouter);

let server: ReturnType<typeof app.listen>;
let port: number;
let startChunkId = '';
let rewardChunkId = '';
let acceptLeafId = '';

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
     VALUES ($1, 'mission-reward-test@test.example', 'mission_reward_test', 'Mission Reward Test')
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
     VALUES ($1, 'Test Vault Item', 'Test vault item', 'https://example.com/item.png', '/media/item.png', 'memento')
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
    [VAULT_ITEM_ID]
  );

  await queryOLTP(
    `INSERT INTO dialogue_trees (id, name, start_node_id, nodes)
     VALUES ($1, 'Mission Reward Test Tree', 'start', $2)
     ON CONFLICT (id) DO UPDATE
       SET nodes = EXCLUDED.nodes,
           start_node_id = EXCLUDED.start_node_id,
           updated_at = NOW()`,
    [TEST_TREE_ID, JSON.stringify(TREE_NODES)]
  );

  await compileDialogueTree(TEST_TREE_ID);

  const chunks = await queryOLTP<{ id: string; chunk_key: string; leaves: Record<string, any> }>(
    `SELECT id, chunk_key, leaves FROM dialogue_chunks WHERE tree_id = $1`,
    [TEST_TREE_ID]
  );

  for (const row of chunks.rows) {
    if (row.chunk_key === 'start') {
      startChunkId = row.id;
      for (const [leafId, leaf] of Object.entries(row.leaves)) {
        if ((leaf as any).next_node_id === 'reward') {
          acceptLeafId = leafId;
        }
      }
    } else if (row.chunk_key === 'reward') {
      rewardChunkId = row.id;
    }
  }

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

describe('Mission reward grants (integration)', () => {
  test('POST /dialogue/start returns the start chunk', async () => {
    const res = await post('/dialogue/start', {
      characterId: MOCK_CHARACTER_ID,
      sceneId: MOCK_SCENE_ID,
    });
    expect([200, 201]).toContain(res.status);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.current_chunk_id).toBe(startChunkId);
  });

  test('POST /dialogue/:id/choose — accept path grants credits + vault item', async () => {
    const startRes = await post('/dialogue/start', {
      characterId: MOCK_CHARACTER_ID,
      sceneId: MOCK_SCENE_ID,
    });
    const startData = await startRes.json();
    const dialogueId = startData.data.dialogue_id;
    const chunkId = startData.data.current_chunk_id;

    const chooseRes = await post(`/dialogue/${dialogueId}/choose`, {
      current_chunk_id: chunkId,
      choice_id: 'accept',
    });
    const chooseText = await chooseRes.text().catch(() => 'no body');
    const chooseBody = chooseRes.headers.get('content-type')?.includes('json')
      ? JSON.parse(chooseText)
      : { raw: chooseText };
    if (chooseRes.status !== 200) {
      console.log('CHOOSE FAILED', chooseRes.status, JSON.stringify(chooseBody));
    }
    expect(chooseRes.status).toBe(200);
    expect(chooseBody.success).toBe(true);

    const stateRes = await queryOLTP<{ credits: number }>(
      `SELECT credits FROM player_states WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    expect(stateRes.rows[0].credits).toBe(300);

    const vaultRes = await queryOLTP<{ item_id: string }>(
      `SELECT item_id FROM player_vault WHERE user_id = $1 AND item_id = $2`,
      [TEST_USER_ID, VAULT_ITEM_ID]
    );
    expect(vaultRes.rows.length).toBe(1);
    expect(vaultRes.rows[0].item_id).toBe(VAULT_ITEM_ID);

    const claimsRes = await queryOLTP<{ claim_key: string }>(
      `SELECT claim_key FROM mission_reward_claims WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    const claimKeys = claimsRes.rows.map(r => r.claim_key);
    // Chunk-boundary path: IronGateValidator writes distinct claim keys
    // for credits (`grant_boundary_...`) and item (`grant_boundary_item_...`).
    const creditClaim = claimKeys.find(k => k.includes('_accept') && !k.includes('_item_'));
    const itemClaim = claimKeys.find(k => k.includes('_item_') && k.includes('_accept'));
    expect(creditClaim).toBeDefined();
    expect(itemClaim).toBeDefined();
  });
});
