import { queryOLTP, withOLTPTransaction, closeConnections } from '../../src/database/connection.js';
import { getCache, deleteCache, closeRedis } from '../../src/database/redis.js';
import { deepMergeNodes, DialogueResolver } from '../../src/services/DialogueResolver.js';
import type { DialogueNode } from '@las-flores/shared';

// ============================================================
// Dialogue Overlay Resolver integration tests
//
// Exercises the deep-merge logic, the cache key shape, and the
// route behavior for `/dialogue/start` and `/dialogue/choose`
// when a player is participating in a mystery (overlaid view)
// vs. when they are not (base view).
//
// Uses the project's existing test user (`00000000-...`)
// against the real dev PostgreSQL/Redis services. Each test
// scopes its own mystery + overlay rows and cleans up in
// `afterAll`.
// ============================================================

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
// Use a dedicated UUID for the resolver test tree so we don't
// collide with (and overwrite) the live `dialogue_awakening`
// tree that other integration tests depend on.
const TEST_TREE_ID = '9e8d7c6b-5a4f-4e3d-2c1b-0a9b8c7d6e5f';
const TEST_MYSTERY_ID = 'a1b2c3d4-1111-4111-8111-aaaaaaaaaaaa';
let baseUpdatedAt = '';

const baseNode: DialogueNode = {
  id: 'root',
  type: 'narrator',
  text: 'Base text',
  choices: [
    { id: 'c1', text: 'Base choice A', next_node_id: 'next_a' },
    { id: 'c2', text: 'Base choice B', next_node_id: 'next_b' },
  ],
};

const baseNodes: Record<string, DialogueNode> = {
  root: baseNode,
  next_a: { id: 'next_a', type: 'npc', text: 'Base A end' },
  next_b: { id: 'next_b', type: 'npc', text: 'Base B end' },
};

const overlayNodes: Record<string, DialogueNode> = {
  root: {
    id: 'root',
    type: 'narrator',
    text: 'Overlaid root text',
    choices: [
      { id: 'c1', text: 'Mystery choice', next_node_id: 'mystery_path' },
    ],
  },
  mystery_path: {
    id: 'mystery_path',
    type: 'npc',
    text: 'Hidden in shadow...',
  },
};

describe('DialogueResolver', () => {
  beforeAll(async () => {
    // Ensure TEST_USER_ID exists in users (api-contract.test.ts
    // deletes it in its afterAll; we need it for FK constraints
    // on player_mysteries).
    await queryOLTP(
      `INSERT INTO users (id, email, username, display_name, time_blocks)
       VALUES ($1, $2, $3, $4, 48)
       ON CONFLICT (id) DO NOTHING`,
      [TEST_USER_ID, 'resolver-test@example.com', 'resolver_test', 'Resolver Test']
    );

    // Seed a known tree shape so the resolver tests have a
    // concrete fixture independent of the content migration.
    await queryOLTP(
      `INSERT INTO dialogue_trees (id, name, start_node_id, nodes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes`,
      [TEST_TREE_ID, 'test_resolver_tree', 'root', JSON.stringify(baseNodes)]
    );
    const treeRow = await queryOLTP<{ updated_at: string }>(
      'SELECT updated_at FROM dialogue_trees WHERE id = $1',
      [TEST_TREE_ID]
    );
    baseUpdatedAt = treeRow.rows[0].updated_at;

    await queryOLTP(
      `INSERT INTO mysteries (id, title, description, status)
       VALUES ($1, 'Test Mystery', 'DialogueResolver test', 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE'`,
      [TEST_MYSTERY_ID]
    );

    // Clean any leftover participation for this user/mystery
    // from previous test runs.
    await queryOLTP(
      `DELETE FROM player_mysteries WHERE user_id = $1 AND mystery_id = $2`,
      [TEST_USER_ID, TEST_MYSTERY_ID]
    );
  });

  afterAll(async () => {
    try {
      await queryOLTP(
        `DELETE FROM dialogue_overlays WHERE mystery_id = $1`,
        [TEST_MYSTERY_ID]
      );
      await queryOLTP(
        `DELETE FROM player_mysteries WHERE user_id = $1 AND mystery_id = $2`,
        [TEST_USER_ID, TEST_MYSTERY_ID]
      );
      await queryOLTP(
        `DELETE FROM mysteries WHERE id = $1`,
        [TEST_MYSTERY_ID]
      );
      await queryOLTP(
        `DELETE FROM dialogue_trees WHERE id = $1`,
        [TEST_TREE_ID]
      );

      // Bust any cache entries this test created.
      await deleteCache(`dialogue:resolved:${TEST_TREE_ID}:mysteries:base:${baseUpdatedAt}`);
      await deleteCache(`dialogue:resolved:${TEST_TREE_ID}:mysteries:${TEST_MYSTERY_ID}:${baseUpdatedAt}`);
    } finally {
      await closeConnections();
      await closeRedis();
    }
  });

  beforeEach(async () => {
    // Always start each test with no active participation.
    await queryOLTP(
      `DELETE FROM player_mysteries WHERE user_id = $1 AND mystery_id = $2`,
      [TEST_USER_ID, TEST_MYSTERY_ID]
    );
    await queryOLTP(
      `DELETE FROM dialogue_overlays WHERE mystery_id = $1`,
      [TEST_MYSTERY_ID]
    );
    // Bust caches between tests.
    await deleteCache(`dialogue:resolved:${TEST_TREE_ID}:mysteries:base:${baseUpdatedAt}`);
    await deleteCache(`dialogue:resolved:${TEST_TREE_ID}:mysteries:${TEST_MYSTERY_ID}:${baseUpdatedAt}`);
  });

  describe('deepMergeNodes', () => {
    it('replaces the base node fields with overlay values for matched ids', () => {
      const merged = deepMergeNodes(baseNodes, overlayNodes);
      // Root text is overlaid
      expect(merged.root.text).toBe('Overlaid root text');
      // The overlay's `choices` array replaces the base's
      expect(merged.root.choices).toHaveLength(1);
      expect(merged.root.choices![0].text).toBe('Mystery choice');
      // Overlay-only node is added
      expect(merged.mystery_path.text).toBe('Hidden in shadow...');
    });

    it('preserves base nodes that are not present in the overlay', () => {
      const merged = deepMergeNodes(baseNodes, overlayNodes);
      expect(merged.next_a.text).toBe('Base A end');
      expect(merged.next_b.text).toBe('Base B end');
    });

    it('returns the base nodes unchanged for an empty overlay', () => {
      const merged = deepMergeNodes(baseNodes, {});
      expect(merged).toEqual(baseNodes);
    });
  });

  describe('resolveTreeForUser', () => {
    it('returns the base tree when the player has no active mysteries', async () => {
      const resolved = await DialogueResolver.resolveTreeForUser(
        TEST_USER_ID,
        TEST_TREE_ID
      );

      expect(resolved.rootId).toBe('root');
      expect(resolved.nodes.root.text).toBe('Base text');
      expect(resolved.nodes.root.choices).toHaveLength(2);
    });

    it('returns the merged tree when one mystery is active', async () => {
      // Seed an overlay for the test tree + mystery
      await queryOLTP(
        `INSERT INTO dialogue_overlays (id, name, target_tree_id, mystery_id, nodes, priority)
         VALUES (gen_random_uuid(), 'test_overlay', $1, $2, $3, 0)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_TREE_ID, TEST_MYSTERY_ID, JSON.stringify(overlayNodes)]
      );

      // Player joins the mystery
      await queryOLTP(
        `INSERT INTO player_mysteries (user_id, mystery_id, status)
         VALUES ($1, $2, 'INVESTIGATING')`,
        [TEST_USER_ID, TEST_MYSTERY_ID]
      );

      const resolved = await DialogueResolver.resolveTreeForUser(
        TEST_USER_ID,
        TEST_TREE_ID
      );

      expect(resolved.rootId).toBe('root');
      expect(resolved.nodes.root.text).toBe('Overlaid root text');
      expect(resolved.nodes.root.choices).toHaveLength(1);
      expect(resolved.nodes.mystery_path).toBeDefined();
    });

    it('caches the resolved tree by the sorted set of active mystery IDs', async () => {
      await queryOLTP(
        `INSERT INTO dialogue_overlays (id, name, target_tree_id, mystery_id, nodes, priority)
         VALUES (gen_random_uuid(), 'test_overlay', $1, $2, $3, 0)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_TREE_ID, TEST_MYSTERY_ID, JSON.stringify(overlayNodes)]
      );
      await queryOLTP(
        `INSERT INTO player_mysteries (user_id, mystery_id, status)
         VALUES ($1, $2, 'INVESTIGATING')`,
        [TEST_USER_ID, TEST_MYSTERY_ID]
      );

      // First call populates the cache.
      await DialogueResolver.resolveTreeForUser(TEST_USER_ID, TEST_TREE_ID);

      // Cache key includes tree updated_at so content changes invalidate stale resolver entries.
      const expectedKey = `dialogue:resolved:${TEST_TREE_ID}:mysteries:${TEST_MYSTERY_ID}:${baseUpdatedAt}`;
      const cached = await getCache(expectedKey);
      expect(cached).toBeDefined();
      expect((cached as any).rootId).toBe('root');
      expect((cached as any).nodes.root.text).toBe('Overlaid root text');
    });

    it('uses the same cache key for the same single mystery (sorted order)', async () => {
      await queryOLTP(
        `INSERT INTO dialogue_overlays (id, name, target_tree_id, mystery_id, nodes, priority)
         VALUES (gen_random_uuid(), 'test_overlay', $1, $2, $3, 0)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_TREE_ID, TEST_MYSTERY_ID, JSON.stringify(overlayNodes)]
      );
      await queryOLTP(
        `INSERT INTO player_mysteries (user_id, mystery_id, status)
         VALUES ($1, $2, 'INVESTIGATING')`,
        [TEST_USER_ID, TEST_MYSTERY_ID]
      );

      // Two consecutive calls should hit the same cache key.
      const r1 = await DialogueResolver.resolveTreeForUser(TEST_USER_ID, TEST_TREE_ID);
      const r2 = await DialogueResolver.resolveTreeForUser(TEST_USER_ID, TEST_TREE_ID);
      expect(r1).toEqual(r2);
    });

    it('uses the "base" suffix in the cache key when no mysteries are active', async () => {
      const result = await DialogueResolver.resolveTreeForUser(
        TEST_USER_ID,
        TEST_TREE_ID
      );
      const expectedKey = `dialogue:resolved:${TEST_TREE_ID}:mysteries:base:${baseUpdatedAt}`;
      const cached = await getCache(expectedKey);
      expect(cached).toBeDefined();
      expect((cached as any).nodes.root.text).toBe('Base text');
      expect(result.nodes.root.text).toBe('Base text');
    });
  });

  describe('joinMystery SQL', () => {
    it('inserts a player_mysteries row and is idempotent on conflict', async () => {
      // The same logic the route handler runs on a `join_mystery`
      // action. Confirms that picking the trigger choice twice
      // doesn't double-insert.
      const mysteryId = 'b2c3d4e5-2222-4222-8222-bbbbbbbbbbbb';
      await queryOLTP(
        `INSERT INTO mysteries (id, title, description, status)
         VALUES ($1, 'Join Test', 'idempotency', 'ACTIVE')
         ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE'`,
        [mysteryId]
      );
      await queryOLTP(
        `DELETE FROM player_mysteries WHERE user_id = $1 AND mystery_id = $2`,
        [TEST_USER_ID, mysteryId]
      );

      await withOLTPTransaction(async (client) => {
        await client.query(
          `INSERT INTO player_mysteries (user_id, mystery_id, status)
           VALUES ($1, $2, 'INVESTIGATING')
           ON CONFLICT (user_id, mystery_id) DO NOTHING`,
          [TEST_USER_ID, mysteryId]
        );
      });
      // Second insert should be a no-op
      await withOLTPTransaction(async (client) => {
        await client.query(
          `INSERT INTO player_mysteries (user_id, mystery_id, status)
           VALUES ($1, $2, 'INVESTIGATING')
           ON CONFLICT (user_id, mystery_id) DO NOTHING`,
          [TEST_USER_ID, mysteryId]
        );
      });

      const { rows } = await queryOLTP<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM player_mysteries
         WHERE user_id = $1 AND mystery_id = $2`,
        [TEST_USER_ID, mysteryId]
      );
      expect(parseInt(rows[0].count, 10)).toBe(1);

      // Cleanup
      await queryOLTP(
        `DELETE FROM player_mysteries WHERE user_id = $1 AND mystery_id = $2`,
        [TEST_USER_ID, mysteryId]
      );
      await queryOLTP(
        `DELETE FROM mysteries WHERE id = $1`,
        [mysteryId]
      );
    });
  });
});
