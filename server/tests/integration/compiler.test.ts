import { queryOLTP, withOLTPTransaction, closeConnections } from '../../src/database/connection.js';
import { compileDialogueTree } from '../../src/content/compiler.js';
import type { DialogueNode } from '@las-flores/shared';

// ============================================================
// Compiler Integration Tests
//
// Tests the DB write path: compileDialogueTree writes correct
// rows to dialogue_chunks, is idempotent, and cleans up stale
// chunks. Uses a dedicated test tree UUID.
//
// Requires: running OLTP database (docker compose up).
//
// Collision-avoidance: dedicated UUIDs below; all rows created
// here are cleaned up in afterAll.
// ============================================================

const TEST_TREE_ID = 'cccc7777-0000-0000-0000-000000000001';
const OVERLAY_ID = 'cccc7777-0000-0000-0000-000000000002';

// Minimal tree: start -> n2 -> n3 (cost). n2 is targeted by an
// overlay, so it becomes an overlay_gate boundary.
const TEST_NODES: Record<string, DialogueNode> = {
  start: {
    id: 'start',
    type: 'narrator',
    text: 'Hello',
    choices: [{ id: 'c1', text: 'Go', next_node_id: 'n2' }],
  },
  n2: {
    id: 'n2',
    type: 'narrator',
    text: 'Mid',
    choices: [{ id: 'c2', text: 'Buy [-1 TB]', next_node_id: 'n3', time_block_cost: { amount: 1, description: 'Buy' } }],
  },
  n3: {
    id: 'n3',
    type: 'narrator',
    text: 'Paid',
    is_end: true,
  },
};

beforeAll(async () => {
  // Seed the test tree + overlay. Overlay targets n2 so the
  // compiler produces an overlay_gate boundary on start->n2.
  await withOLTPTransaction(async (client) => {
    await client.query(
      `INSERT INTO dialogue_trees (id, name, start_node_id, nodes)
       VALUES ($1, 'Compiler Test Tree', 'start', $2)
       ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes, start_node_id = EXCLUDED.start_node_id, updated_at = NOW()`,
      [TEST_TREE_ID, JSON.stringify(TEST_NODES)]
    );
    await client.query(
      `INSERT INTO dialogue_overlays (id, name, target_tree_id, nodes)
       VALUES ($1, 'Compiler Test Overlay', $2, '{"n2": {"id": "n2", "type": "narrator", "text": "Overlaid mid"}}')
       ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes, target_tree_id = EXCLUDED.target_tree_id, updated_at = NOW()`,
      [OVERLAY_ID, TEST_TREE_ID]
    );
  });
});

afterAll(async () => {
  // Cleanup all rows we created.
  await withOLTPTransaction(async (client) => {
    await client.query('DELETE FROM dialogue_chunks WHERE tree_id = $1', [TEST_TREE_ID]);
    await client.query('DELETE FROM dialogue_overlays WHERE id = $1', [OVERLAY_ID]);
    await client.query('DELETE FROM dialogue_trees WHERE id = $1', [TEST_TREE_ID]);
  });
  await closeConnections();
});

describe('Compiler Integration Tests', () => {
  it('writes correct chunks to dialogue_chunks', async () => {
    const chunks = await compileDialogueTree(TEST_TREE_ID);

    // The tree has an overlay gate at n2 and a TB cost at n2->n3,
    // so the compile produces multiple chunks.
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    const rows = await queryOLTP<{ chunk_key: string }>(
      'SELECT chunk_key FROM dialogue_chunks WHERE tree_id = $1 ORDER BY chunk_key',
      [TEST_TREE_ID]
    );
    expect(rows.rows.length).toBeGreaterThanOrEqual(2);
  });

  it('is idempotent — second call leaves row count unchanged', async () => {
    const first = await queryOLTP<{ count: string }>(
      `SELECT count(*)::text AS count FROM dialogue_chunks WHERE tree_id = $1`,
      [TEST_TREE_ID]
    );
    const firstCount = parseInt(first.rows[0].count, 10);

    await compileDialogueTree(TEST_TREE_ID);

    const second = await queryOLTP<{ count: string }>(
      `SELECT count(*)::text AS count FROM dialogue_chunks WHERE tree_id = $1`,
      [TEST_TREE_ID]
    );
    const secondCount = parseInt(second.rows[0].count, 10);

    expect(secondCount).toBe(firstCount);
  });

  it('cleans up stale chunks on recompile', async () => {
    // Insert a fake stale chunk that a previous (buggy) compile
    // might have left behind.
    await withOLTPTransaction(async (client) => {
      await client.query(
        `INSERT INTO dialogue_chunks (tree_id, chunk_key, nodes, leaves)
         VALUES ($1, 'stale_chunk', '{}', '{}')`,
        [TEST_TREE_ID]
      );
    });

    // Verify it exists
    const before = await queryOLTP<{ chunk_key: string }>(
      "SELECT chunk_key FROM dialogue_chunks WHERE tree_id = $1 AND chunk_key = 'stale_chunk'",
      [TEST_TREE_ID]
    );
    expect(before.rows).toHaveLength(1);

    // Recompile — stale should be gone (DELETE+INSERT strategy)
    await compileDialogueTree(TEST_TREE_ID);

    const after = await queryOLTP<{ chunk_key: string }>(
      "SELECT chunk_key FROM dialogue_chunks WHERE tree_id = $1 AND chunk_key = 'stale_chunk'",
      [TEST_TREE_ID]
    );
    expect(after.rows).toHaveLength(0);
  });
});
