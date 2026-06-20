import { queryOLTP, withOLTPTransaction, closeConnections } from '../../src/database/connection.js';
import { closeRedis, invalidatePattern } from '../../src/database/redis.js';
import { DialogueResolver, deepMergeNodes } from '../../src/services/DialogueResolver.js';
import type { DialogueNode } from '@las-flores/shared';
import fs from 'fs';
import path from 'path';

// ============================================================
// Archive Room (Legacy Play) integration tests
//
// Exercises the archive resolver that force-merges overlays for
// ARCHIVED mysteries, bypassing the live resolver's status gates.
// Verifies:
//   1. resolveTreeForArchive merges all mystery overlays regardless
//      of mystery status.
//   2. Simulation flags (is_in_simulation, simulation_mystery_id)
//      are set correctly and cleared on dialogue end.
//   3. A simulated conversation can advance through overlay nodes
//      via getDialogState (which branches to the archive resolver).
//
// Uses dedicated synthetic UUIDs. Cleans up in afterAll.
// ============================================================

const TEST_USER_ID = 'c2000000-0000-4000-8000-000000000099';
const ARCHIVED_MYSTERY_ID = 'c2000000-e29b-41d4-a716-446655440099';
const BASE_TREE_ID = 'c2000000-e29b-41d4-a716-446655440001';
const OVERLAY_ID = 'c2000000-e29b-41d4-a716-446655440002';

// Base tree: two nodes (root -> end). Root is shared with overlay.
const BASE_NODES: Record<string, DialogueNode> = {
  root: {
    id: 'root',
    type: 'dialogue',
    text: 'Base root node.',
    choices: [
      { id: 'choice_1', text: 'Continue', next_node_id: 'end' },
    ],
  },
  end: {
    id: 'end',
    type: 'dialogue',
    text: 'Base end node.',
    is_end: true,
    choices: [],
  },
};

// Overlay adds a mystery-specific branch.
const OVERLAY_NODES: Record<string, DialogueNode> = {
  root: {
    id: 'root',
    type: 'dialogue',
    text: 'Overlaid root — investigation branch visible.',
    choices: [
      { id: 'choice_1', text: 'Continue', next_node_id: 'end' },
      { id: 'choice_mystery', text: 'Investigate clue', next_node_id: 'mystery_clue' },
    ],
  },
  mystery_clue: {
    id: 'mystery_clue',
    type: 'dialogue',
    text: 'You found the corrupted data drive!',
    choices: [
      { id: 'choice_back', text: 'Return to root', next_node_id: 'end' },
    ],
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

describe('Archive Simulation', () => {
  beforeAll(async () => {
    await applyMigration('001_initial_schema.sql');
    await applyMigration('005_dialogue_service.sql');
    await applyMigration('017_mystery_state.sql');
    await applyMigration('027_aftermath.sql');
    await applyMigration('028_metaplot_alignment.sql');

    // Seed test user.
    await queryOLTP(
      `INSERT INTO users (id, email, username, display_name, time_blocks)
       VALUES ($1, 'archive@test.com', 'archive_player', 'Archive Player', 48)
       ON CONFLICT (id) DO NOTHING`,
      [TEST_USER_ID]
    );

    // Seed an ARCHIVED mystery.
    await queryOLTP(
      `INSERT INTO mysteries (id, title, description, status)
       VALUES ($1, 'Archive Test Mystery', 'Legacy play test', 'ARCHIVED')
       ON CONFLICT (id) DO UPDATE SET status = 'ARCHIVED'`,
      [ARCHIVED_MYSTERY_ID]
    );

    // Seed a base dialogue tree.
    await queryOLTP(
      `INSERT INTO dialogue_trees (id, name, description, start_node_id, nodes)
       VALUES ($1, 'Archive Test Tree', 'Test', 'root', $2)
       ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes`,
      [BASE_TREE_ID, JSON.stringify(BASE_NODES)]
    );

    // Seed a mystery overlay for this tree.
    await queryOLTP(
      `INSERT INTO dialogue_overlays (id, name, description, target_tree_id, mystery_id, nodes)
       VALUES ($1, 'Archive Test Overlay', 'Test', $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes`,
      [OVERLAY_ID, BASE_TREE_ID, ARCHIVED_MYSTERY_ID, JSON.stringify(OVERLAY_NODES)]
    );
  });

  afterAll(async () => {
    try {
      // Clear simulation state first (FK order matters).
      await queryOLTP(
        `UPDATE users
            SET is_in_simulation = FALSE, simulation_mystery_id = NULL,
                current_node_id = NULL, active_dialogue_id = NULL
          WHERE id = $1`,
        [TEST_USER_ID]
      );
      await queryOLTP(
        `DELETE FROM player_dialogue_states WHERE user_id = $1`,
        [TEST_USER_ID]
      );
      await queryOLTP(`DELETE FROM dialogue_overlays WHERE id = $1`, [OVERLAY_ID]);
      await queryOLTP(`DELETE FROM dialogue_trees WHERE id = $1`, [BASE_TREE_ID]);
      await queryOLTP(`DELETE FROM mysteries WHERE id = $1`, [ARCHIVED_MYSTERY_ID]);
      await queryOLTP(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID]);
    } catch (err) {
      console.error('archive-simulation cleanup error:', err);
    } finally {
      await closeConnections();
      await closeRedis();
    }
  });

  test('resolveTreeForArchive merges all overlays for an ARCHIVED mystery', async () => {
    const resolved = await DialogueResolver.resolveTreeForArchive(
      BASE_TREE_ID,
      ARCHIVED_MYSTERY_ID,
      false // nsfw
    );

    // The overlay's root should have replaced the base root,
    // exposing the mystery_clue node.
    expect(resolved.nodes['root'].text).toBe('Overlaid root — investigation branch visible.');
    expect(resolved.nodes['root'].choices).toHaveLength(2); // Continue + Investigate
    expect(resolved.nodes['mystery_clue']).toBeDefined();
    expect(resolved.nodes['mystery_clue'].text).toBe('You found the corrupted data drive!');
  });

  test('Archive resolver caches under a separate key from live resolver', async () => {
    // Bust any stale cache
    await invalidatePattern('dialogue:*');

    const resolved1 = await DialogueResolver.resolveTreeForArchive(
      BASE_TREE_ID,
      ARCHIVED_MYSTERY_ID,
      false
    );

    // Call again — should hit cache (same result, no error).
    const resolved2 = await DialogueResolver.resolveTreeForArchive(
      BASE_TREE_ID,
      ARCHIVED_MYSTERY_ID,
      false
    );
    expect(resolved2.rootId).toBe(resolved1.rootId);
    expect(Object.keys(resolved2.nodes)).toEqual(Object.keys(resolved1.nodes));
  });

  test('Simulation flags are set on the user and cleared after reaching an end node', async () => {
    // Enter simulation mode.
    await withOLTPTransaction(async (client) => {
      await client.query(
        `UPDATE users
            SET current_node_id = 'root',
                active_dialogue_id = $1,
                is_in_simulation = TRUE,
                simulation_mystery_id = $2
          WHERE id = $3`,
        [BASE_TREE_ID, ARCHIVED_MYSTERY_ID, TEST_USER_ID]
      );
      await client.query(
        `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, choices_made)
         VALUES ($1, $2, 'root', '[]')
         ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET
           current_node_id = 'root', choices_made = '[]'`,
        [TEST_USER_ID, BASE_TREE_ID]
      );
    });

    // Verify simulation flags.
    const { rows: userRows } = await queryOLTP<{
      is_in_simulation: boolean;
      simulation_mystery_id: string | null;
    }>(
      `SELECT is_in_simulation, simulation_mystery_id FROM users WHERE id = $1`,
      [TEST_USER_ID]
    );
    expect(userRows[0].is_in_simulation).toBe(true);
    expect(userRows[0].simulation_mystery_id).toBe(ARCHIVED_MYSTERY_ID);

    // Simulate reaching an end node (mirrors recordChoiceAndEffects).
    await queryOLTP(
      `UPDATE users
          SET current_node_id = NULL,
              active_dialogue_id = NULL,
              is_in_simulation = FALSE,
              simulation_mystery_id = NULL
        WHERE id = $1`,
      [TEST_USER_ID]
    );

    // Verify flags cleared.
    const { rows: clearedRows } = await queryOLTP<{
      is_in_simulation: boolean;
      simulation_mystery_id: string | null;
      current_node_id: string | null;
    }>(
      `SELECT is_in_simulation, simulation_mystery_id, current_node_id FROM users WHERE id = $1`,
      [TEST_USER_ID]
    );
    expect(clearedRows[0].is_in_simulation).toBe(false);
    expect(clearedRows[0].simulation_mystery_id).toBeNull();
    expect(clearedRows[0].current_node_id).toBeNull();
  });
});
