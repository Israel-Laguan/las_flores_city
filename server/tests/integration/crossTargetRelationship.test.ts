import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { queryOLTP, withOLTPTransaction, closeConnections, closeRedis } from '@las-flores/infra';
import { applyRelationshipEffect } from '../../src/routes/dialogue-helpers.js';

// ============================================================
// M48 Phase 6 — cross-target relationship_effect integration.
//
// Wen-speakered choices mutate Layla's canonical user_relationships
// row via effects.relationship_effect.target_character_id
// (Layla/Wen arc conversion). Verifies:
//   1. default target = speaking character when no override present
//   2. explicit target_character_id overrides the speaker
//
// Dedicated synthetic user; cleaned up in afterAll.
// ============================================================

const TEST_USER_ID = 'e4800000-0000-4000-8000-000000048002'; // private to this file
const WEN_CHARACTER_ID = 'd1fc0275-af55-4fe0-8fc2-a36c42c264ae'; // real content UUID (Wen Zhao)
const LAYLA_CHARACTER_ID = 'd9927cf6-cc6c-42d3-b39c-023e6252b453'; // real content UUID (Layla)

async function getTrust(characterId: string): Promise<number | null> {
  const result = await queryOLTP<{ trust: number }>(
    `SELECT trust FROM user_relationships WHERE user_id = $1 AND character_id = $2`,
    [TEST_USER_ID, characterId]
  );
  return result.rows[0]?.trust ?? null;
}

beforeAll(async () => {
  await queryOLTP(
    `INSERT INTO users (id, username, email, password_hash, display_name)
     VALUES ($1::uuid, 'm48-cross-target', 'm48-cross-target@test.local', 'x', 'M48 Cross Target')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID]
  );
  // player_states row is required by applyRelationshipDelta's FOR UPDATE read
  await queryOLTP(
    `INSERT INTO player_states (user_id, current_day, time_blocks)
     VALUES ($1, 1, 24) ON CONFLICT (user_id) DO NOTHING`,
    [TEST_USER_ID]
  );
});

afterAll(async () => {
  await queryOLTP('DELETE FROM user_relationships WHERE user_id = $1', [TEST_USER_ID]);
  await queryOLTP('DELETE FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
  await queryOLTP('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await closeConnections();
  await closeRedis();
});

describe('applyRelationshipEffect cross-target override', () => {
  test('defaults to the speaking character when no override is present', async () => {
    await withOLTPTransaction(async (client) => {
      await applyRelationshipEffect(client, TEST_USER_ID, WEN_CHARACTER_ID, {
        axes: { trust: 6 },
      });
    });
    expect(await getTrust(WEN_CHARACTER_ID)).toBe(6);
    expect(await getTrust(LAYLA_CHARACTER_ID)).toBeNull();
  });

  test('explicit target_character_id overrides the speaking character', async () => {
    // Wen speaks; the delta targets Layla (wen_intermediary pattern).
    await withOLTPTransaction(async (client) => {
      await applyRelationshipEffect(client, TEST_USER_ID, WEN_CHARACTER_ID, {
        target_character_id: LAYLA_CHARACTER_ID,
        axes: { trust: 8 },
      });
    });
    // Layla's row moved; Wen's is unchanged from the previous test.
    expect(await getTrust(LAYLA_CHARACTER_ID)).toBe(8);
    expect(await getTrust(WEN_CHARACTER_ID)).toBe(6);
  });
});
