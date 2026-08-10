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
import { queryOLTP } from '../../src/database/connection.js';
import { createMissionRewardFixture } from '../helpers/missionReward.js';
import type { DialogueNode } from '@las-flores/shared';

// ============================================================
// Dedicated synthetic IDs (collision-avoidance per AGENTS.md)
// ============================================================
const TEST_USER_ID = 'aa340000-0001-4001-8001-000000000001';
const TEST_TREE_ID = 'aa340000-0002-4002-8002-000000000002';
const MOCK_CHARACTER_ID = 'aa340000-0003-4003-8003-000000000003';
const MOCK_SCENE_ID = 'aa340000-0004-4004-8004-000000000004';
const VAULT_ITEM_ID = 'aa340000-0005-4005-8005-000000000005';

// Minimal three-chunk tree with reward effects on destination node:
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

const fixture = createMissionRewardFixture({
  userId: TEST_USER_ID,
  treeId: TEST_TREE_ID,
  characterId: MOCK_CHARACTER_ID,
  sceneId: MOCK_SCENE_ID,
  vaultItemId: VAULT_ITEM_ID,
  treeName: 'Mission Reward Test Tree',
  treeNodes: TREE_NODES,
  email: 'mission-reward-test@test.example',
  username: 'mission_reward_test',
  displayName: 'Mission Reward Test',
  vaultItemTitle: 'Test Vault Item',
  vaultItemDescription: 'Test vault item',
});

let startChunkId = '';

beforeAll(async () => {
  const booted = await fixture.boot();
  startChunkId = booted.startChunkId;
});

afterAll(async () => {
  await fixture.cleanup();
});

beforeEach(async () => {
  await fixture.resetState();
});

describe('Mission reward grants (integration)', () => {
  test('POST /dialogue/start returns the start chunk', async () => {
    const res = await fixture.post('/dialogue/start', {
      characterId: MOCK_CHARACTER_ID,
      sceneId: MOCK_SCENE_ID,
    });
    expect([200, 201]).toContain(res.status);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.current_chunk_id).toBe(startChunkId);
  });

  test('POST /dialogue/:id/choose — accept path grants credits + vault item', async () => {
    const startRes = await fixture.post('/dialogue/start', {
      characterId: MOCK_CHARACTER_ID,
      sceneId: MOCK_SCENE_ID,
    });
    const startData = await startRes.json();
    const dialogueId = startData.data.dialogue_id;
    const chunkId = startData.data.current_chunk_id;

    const chooseRes = await fixture.post(`/dialogue/${dialogueId}/choose`, {
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
    // Chunk-boundary path (IronGateValidator) writes exactly two distinct claim
    // rows for this accept — one covering the credit grant and one the item
    // grant. Assert the observable contract (two distinct rows, not three, no
    // duplicates) rather than the internal claim-key format, so a rename of the
    // key scheme can't break the test while the reward behavior is preserved.
    expect(claimKeys.length).toBe(2);
    expect(new Set(claimKeys).size).toBe(2);
  });
});
