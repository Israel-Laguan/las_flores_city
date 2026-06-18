import { queryOLTP, withOLTPTransaction, closeConnections } from '../../src/database/connection.js';
import { closeRedis, invalidatePattern } from '../../src/database/redis.js';
import { getDialogState } from '../../src/routes/dialogue-helpers.js';
import fs from 'fs';
import path from 'path';
import type { DialogueNode } from '@las-flores/shared';

// ============================================================
// Task 5.1: In-Flight Conversation Protection
//
// Verifies that a player who is mid-conversation inside a mystery
// overlay can continue making choices even after the mystery
// status transitions to ARCHIVED (as would happen when the
// LeaderboardWorker finalizes while they're talking).
//
// The mechanism: DialogueResolver.getActiveMysteryIds() keys on
// `player_mysteries.status = 'INVESTIGATING'`, NOT on
// `mysteries.status`. So the overlay stays merged for the
// investigator until they finish the conversation naturally.
// ============================================================

const TEST_USER_ID = 'c3000000-0000-4000-8000-000000000099';
const MYSTERY_ID = 'c3000000-e29b-41d4-a716-446655440099';
const BASE_TREE_ID = 'c3000000-e29b-41d4-a716-446655440001';
const OVERLAY_ID = 'c3000000-e29b-41d4-a716-446655440002';

const BASE_NODES: Record<string, DialogueNode> = {
  root: {
    id: 'root',
    type: 'dialogue',
    text: 'Base root.',
    choices: [
      { id: 'choice_1', text: 'Base choice', next_node_id: 'base_end' },
    ],
  },
  base_end: {
    id: 'base_end',
    type: 'dialogue',
    text: 'Base end.',
    is_end: true,
    choices: [],
  },
};

// Overlay replaces root with an investigation branch.
const OVERLAY_NODES: Record<string, DialogueNode> = {
  root: {
    id: 'root',
    type: 'dialogue',
    text: 'Overlaid root — investigation active.',
    choices: [
      { id: 'choice_overlay', text: 'Follow lead', next_node_id: 'overlay_mid' },
      { id: 'choice_1', text: 'Base choice', next_node_id: 'base_end' },
    ],
  },
  overlay_mid: {
    id: 'overlay_mid',
    type: 'dialogue',
    text: 'Overlay mid-node — a clue is revealed.',
    choices: [
      { id: 'choice_end', text: 'Wrap up', next_node_id: 'overlay_end' },
    ],
  },
  overlay_end: {
    id: 'overlay_end',
    type: 'dialogue',
    text: 'Overlay end — investigation complete.',
    is_end: true,
    choices: [],
  },
};

async function applyMigration(filename: string): Promise<void> {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'src/database/migrations', filename),
    'utf-8'
  );
  try {
    await queryOLTP(sql);
  } catch {
    // Column may already exist
  }
}

describe('Task 5.1: In-Flight Conversation Protection', () => {
  beforeAll(async () => {
    await applyMigration('001_initial_schema.sql');
    await applyMigration('005_dialogue_service.sql');
    await applyMigration('017_mystery_state.sql');

    // Seed test user.
    await queryOLTP(
      `INSERT INTO users (id, email, username, display_name, time_blocks)
       VALUES ($1, 'inflight@test.com', 'inflight_player', 'InFlight Player', 48)
       ON CONFLICT (id) DO NOTHING`,
      [TEST_USER_ID]
    );

    // Seed an ACTIVE mystery + make user an INVESTIGATOR.
    await queryOLTP(
      `INSERT INTO mysteries (id, title, description, status)
       VALUES ($1, 'InFlight Test Mystery', 'Test', 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE'`,
      [MYSTERY_ID]
    );
    await queryOLTP(
      `INSERT INTO player_mysteries (user_id, mystery_id, status)
       VALUES ($1, $2, 'INVESTIGATING')
       ON CONFLICT (user_id, mystery_id) DO UPDATE SET status = 'INVESTIGATING'`,
      [TEST_USER_ID, MYSTERY_ID]
    );

    // Seed base tree + overlay.
    await queryOLTP(
      `INSERT INTO dialogue_trees (id, name, description, start_node_id, nodes)
       VALUES ($1, 'InFlight Tree', 'Test', 'root', $2)
       ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes`,
      [BASE_TREE_ID, JSON.stringify(BASE_NODES)]
    );
    await queryOLTP(
      `INSERT INTO dialogue_overlays (id, name, description, target_tree_id, mystery_id, nodes)
       VALUES ($1, 'InFlight Overlay', 'Test', $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes`,
      [OVERLAY_ID, BASE_TREE_ID, MYSTERY_ID, JSON.stringify(OVERLAY_NODES)]
    );
  });

  afterAll(async () => {
    try {
      await queryOLTP(
        `UPDATE users SET current_node_id = NULL, active_dialogue_id = NULL WHERE id = $1`,
        [TEST_USER_ID]
      );
      await queryOLTP(
        `DELETE FROM player_dialogue_states WHERE user_id = $1`,
        [TEST_USER_ID]
      );
      await queryOLTP(
        `DELETE FROM player_mysteries WHERE user_id = $1`,
        [TEST_USER_ID]
      );
      await queryOLTP(`DELETE FROM dialogue_overlays WHERE id = $1`, [OVERLAY_ID]);
      await queryOLTP(`DELETE FROM dialogue_trees WHERE id = $1`, [BASE_TREE_ID]);
      await queryOLTP(`DELETE FROM mysteries WHERE id = $1`, [MYSTERY_ID]);
      await queryOLTP(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID]);
    } catch (err) {
      console.error('in-flight-protection cleanup error:', err);
    } finally {
      await closeConnections();
      await closeRedis();
    }
  });

  test('Investigator keeps overlay access after mystery is archived mid-conversation', async () => {
    // 1. Start conversation and advance into an overlay-only node.
    await withOLTPTransaction(async (client) => {
      await client.query(
        `UPDATE users SET current_node_id = 'overlay_mid', active_dialogue_id = $1
         WHERE id = $2`,
        [BASE_TREE_ID, TEST_USER_ID]
      );
      await client.query(
        `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, choices_made)
         VALUES ($1, $2, 'overlay_mid', '[]')
         ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET current_node_id = 'overlay_mid'`,
        [TEST_USER_ID, BASE_TREE_ID]
      );
    });

    // 2. Archive the mystery (simulating LeaderboardWorker).
    await queryOLTP(
      `UPDATE mysteries SET status = 'ARCHIVED' WHERE id = $1`,
      [MYSTERY_ID]
    );

    // 3. Invalidate the dialogue cache (simulating the worker's
    //    post-commit invalidation).
    await invalidatePattern('dialogue:resolved:*');

    // 4. Call getDialogState — the live resolver should still merge
    //    the overlay because player_mysteries.status='INVESTIGATING'.
    const state = await getDialogState(TEST_USER_ID, BASE_TREE_ID);

    // Should NOT be an error — the overlay node must still exist.
    expect('error' in state).toBe(false);

    if (!('error' in state)) {
      // The current node should be the overlay mid-node.
      expect(state.currentNodeId).toBe('overlay_mid');
      expect(state.currentNode.text).toBe('Overlay mid-node — a clue is revealed.');

      // The next node (overlay_end) should also exist in the
      // resolved tree, proving the overlay is still merged.
      expect(state.nodes['overlay_end']).toBeDefined();
      expect(state.nodes['overlay_end'].text).toBe('Overlay end — investigation complete.');
    }
  });
});
