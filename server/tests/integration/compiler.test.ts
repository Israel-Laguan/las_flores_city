import { queryOLTP, withOLTPTransaction, closeConnections } from '@las-flores/infra';
import { compileDialogueTree } from '../../src/content/compiler.js';
import { publishDialogueTree } from '../../src/services/ContentPublishService.js';
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
  // M32: the tree node map is externalized to the CDN; the in-DB
  // `nodes` JSONB column is dropped, so we publish and store `content_url`.
  const treeContentUrl = await publishDialogueTree(TEST_TREE_ID, JSON.stringify({ nodes: TEST_NODES }));
  await withOLTPTransaction(async (client) => {
    await client.query(
      `INSERT INTO dialogue_trees (id, name, start_node_id, content_url)
       VALUES ($1, 'Compiler Test Tree', 'start', $2)
       ON CONFLICT (id) DO UPDATE SET content_url = EXCLUDED.content_url, start_node_id = EXCLUDED.start_node_id, updated_at = NOW()`,
      [TEST_TREE_ID, treeContentUrl]
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

  it('recompile advances revision and retains prior revision rows (no delete of history)', async () => {
    // Self-contained baseline: don't rely on row counts left behind by
    // earlier tests in this describe block — there's no per-test DB
    // reset, only beforeAll/afterAll. Instead, measure how many chunk
    // rows ONE compile adds (whatever pre-existing state there is), then
    // assert a second compile adds exactly that many more.
    const countChunks = async () => {
      const result = await queryOLTP<{ count: string }>(
        `SELECT count(*)::text AS count FROM dialogue_chunks WHERE tree_id = $1`,
        [TEST_TREE_ID]
      );
      return parseInt(result.rows[0].count, 10);
    };

    const beforeFirst = await countChunks();
    await compileDialogueTree(TEST_TREE_ID);
    const afterFirst = await countChunks();
    const chunksPerCompile = afterFirst - beforeFirst;
    expect(chunksPerCompile).toBeGreaterThan(0);

    await compileDialogueTree(TEST_TREE_ID);
    const afterSecond = await countChunks();

    // Each compile bumps rev and inserts a fresh set for the new rev;
    // priors are kept, so the second compile should add exactly one more
    // chunk set on top of what the first (in-test) compile produced.
    expect(afterSecond - afterFirst).toBe(chunksPerCompile);
  });

  it('retains prior-revision chunks on recompile (history preserved for pinned players)', async () => {
    // Insert a fake chunk for a prior revision (simulates legacy or pinned snapshot).
    // Recompile must NOT delete it.
    await withOLTPTransaction(async (client) => {
      await client.query(
        `INSERT INTO dialogue_chunks (tree_id, chunk_key, revision)
         VALUES ($1, 'stale_chunk', 0)`,
        [TEST_TREE_ID]
      );
    });

    // Verify it exists (prior rev)
    const before = await queryOLTP<{ chunk_key: string }>(
      "SELECT chunk_key FROM dialogue_chunks WHERE tree_id = $1 AND chunk_key = 'stale_chunk'",
      [TEST_TREE_ID]
    );
    expect(before.rows).toHaveLength(1);

    // Recompile — prior-rev chunk must still be present (we no longer DELETE across revs)
    await compileDialogueTree(TEST_TREE_ID);

    const after = await queryOLTP<{ chunk_key: string }>(
      "SELECT chunk_key FROM dialogue_chunks WHERE tree_id = $1 AND chunk_key = 'stale_chunk'",
      [TEST_TREE_ID]
    );
    expect(after.rows).toHaveLength(1);
  });
});
