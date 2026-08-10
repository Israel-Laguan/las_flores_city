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
import { queryOLTP } from '../../src/database/connection.js';
import { createMissionRewardFixture } from '../helpers/missionReward.js';
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

const fixture = createMissionRewardFixture({
  userId: TEST_USER_ID,
  treeId: TEST_TREE_ID,
  vaultItemId: VAULT_ITEM_ID,
  treeName: 'Anti-Double Test Tree',
  treeNodes: TREE_NODES,
  email: 'anti-double-test@test.example',
  username: 'anti_double_test',
  displayName: 'Anti-Double Test',
  vaultItemTitle: 'Anti-Double Item',
  vaultItemDescription: 'Test item',
});

let dialogueId = '';

beforeAll(async () => {
  await fixture.boot();
});

afterAll(async () => {
  await fixture.cleanup();
});

beforeEach(async () => {
  await fixture.resetState();
});

describe('Mission reward anti-double (integration)', () => {
  test('processing the same choice twice does not double-grant', async () => {
    const startRes = await fixture.post('/dialogue/start', {
      characterId: MOCK_CHARACTER_ID,
      sceneId: MOCK_SCENE_ID,
    });
    expect([200, 201]).toContain(startRes.status);
    const startData = await startRes.json();
    dialogueId = startData.data.dialogue_id;
    const chunkId = startData.data.current_chunk_id;

    const res1 = await fixture.post(`/dialogue/${dialogueId}/choose`, {
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

    const res2 = await fixture.post(`/dialogue/${dialogueId}/choose`, {
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

    const finalClaims = (await queryOLTP<{ claim_key: string }>(
      `SELECT claim_key FROM mission_reward_claims WHERE user_id = $1`,
      [TEST_USER_ID]
    )).rows.map(r => r.claim_key);
    const finalClaimsCount = String(finalClaims.length);

    expect(finalCredits).toBe(midCredits);
    expect(finalVaultCount).toBe(midVaultCount);
    expect(finalVaultCount).toBe('1');
    expect(finalClaimsCount).toBe(midClaimsCount);
    // Exactly two distinct claim keys: one `grant_boundary` credit key and one
    // `grant_boundary_item` key (the chunk-boundary IronGate path). The second
    // choice attempt must not add duplicate keys, so all keys are distinct and
    // exactly one item key is present.
    expect(new Set(finalClaims).size).toBe(finalClaims.length);
    expect(finalClaims.filter(k => k.includes('_item_')).length).toBe(1);
    expect(finalClaims.length).toBe(2);
  });
});
