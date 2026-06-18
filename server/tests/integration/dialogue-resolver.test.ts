import { createHash } from 'node:crypto';
import { queryOLTP, queryOLAP, withOLTPTransaction, closeConnections } from '../../src/database/connection.js';
import { getCache, invalidatePattern, closeRedis } from '../../src/database/redis.js';
import { deepMergeNodes, DialogueResolver } from '../../src/services/DialogueResolver.js';
import type { DialogueNode } from '@las-flores/shared';
import express from 'express';
import { dialogueRouter } from '../../src/routes/dialogue.js';
import { generateToken } from '../../src/middleware/auth.js';

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

function buildOverlayFingerprint(overlays: Array<{ nodes: Record<string, DialogueNode>; updated_at: Date }>): string {
  const fingerprints = overlays
    .map((overlay) => `${overlay.updated_at.toISOString()}:${JSON.stringify(overlay.nodes)}`)
    .sort();

  return createHash('sha1').update(fingerprints.join('|')).digest('hex').slice(0, 16);
}

async function buildExpectedCacheSuffix(
  userId: string,
  mysteryIdsForPlayer: string[]
): Promise<string> {
  const investigating = await queryOLTP<{ mystery_id: string }>(
    `SELECT mystery_id FROM player_mysteries
     WHERE user_id = $1 AND status = 'INVESTIGATING'`,
    [userId]
  );
  const active = await queryOLTP<{ id: string }>(
    `SELECT id FROM mysteries WHERE status = 'ACTIVE'`
  );
  const allIds = [
    ...new Set([
      ...investigating.rows.map((r) => r.mystery_id),
      ...active.rows.map((r) => r.id),
      ...mysteryIdsForPlayer,
    ]),
  ].sort();
  const overlays = await queryOLTP<{ nodes: Record<string, DialogueNode>; updated_at: Date }>(
    `SELECT nodes, updated_at
     FROM dialogue_overlays
     WHERE target_tree_id = $1
       AND mystery_id = ANY($2::uuid[])
       AND nodes IS NOT NULL
       AND nodes != '{}'::jsonb`,
    [TEST_TREE_ID, allIds]
  );
  const overlayFingerprint = overlays.rows.length > 0 ? buildOverlayFingerprint(overlays.rows) : baseUpdatedAt;
  return allIds.length > 0 ? `${allIds.join('_')}:${overlayFingerprint}` : `base:${overlayFingerprint}`;
}

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
      await invalidatePattern(`dialogue:resolved:${TEST_TREE_ID}:nsfw:*:mysteries:*`);
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
    await invalidatePattern(`dialogue:resolved:${TEST_TREE_ID}:mysteries:*`);
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

    it('preserves <important> tags in node text during merge', () => {
      const baseWithTags: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Base text with <important>important info</important>',
        },
      };
      const overlayWithTags: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Overlaid text with <important>new important</important> data',
        },
      };
      const merged = deepMergeNodes(baseWithTags, overlayWithTags);
      expect(merged.root.text).toBe('Overlaid text with <important>new important</important> data');
      expect(merged.root.text).toContain('<important>');
      expect(merged.root.text).toContain('</important>');
    });

    it('preserves <important> tags in choice text during merge', () => {
      const baseWithTagChoices: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Base text',
          choices: [
            { id: 'c1', text: 'Use <important>Protocol 7</important>', next_node_id: 'next' },
          ],
        },
      };
      const overlayWithTagChoices: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Overlaid text',
          choices: [
            { id: 'c1', text: 'Use <important>Protocol 7</important>', next_node_id: 'mystery' },
          ],
        },
      };
      const merged = deepMergeNodes(baseWithTagChoices, overlayWithTagChoices);
      expect(merged.root.choices![0].text).toBe('Use <important>Protocol 7</important>');
      expect(merged.root.choices![0].text).toContain('<important>');
      expect(merged.root.choices![0].text).toContain('</important>');
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

      const cacheSuffix = await buildExpectedCacheSuffix(TEST_USER_ID, [TEST_MYSTERY_ID]);
      const expectedKey = `dialogue:resolved:${TEST_TREE_ID}:nsfw:false:mysteries:${cacheSuffix}`;
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

    it('uses the resolver cache suffix when no player mysteries are active', async () => {
      const result = await DialogueResolver.resolveTreeForUser(
        TEST_USER_ID,
        TEST_TREE_ID
      );
      const cacheSuffix = await buildExpectedCacheSuffix(TEST_USER_ID, []);
      const expectedKey = `dialogue:resolved:${TEST_TREE_ID}:nsfw:false:mysteries:${cacheSuffix}`;
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

  describe('Dialogue choice OLAP telemetry', () => {
    const TB_TEST_USER_ID = 'e0000000-0000-4000-8000-000000000099';
    const TB_TEST_TREE_ID = 'f2222222-2222-4222-8222-bbbbbbbbbbbb';
    const TB_ROOT_NODE = 'tb_root';
    const TB_NEXT_NODE = 'tb_next';

    const tbNodes = {
      [TB_ROOT_NODE]: {
        id: TB_ROOT_NODE,
        type: 'narrator',
        text: 'Pay to proceed?',
        choices: [
          {
            id: 'c_paid',
            text: 'Spend time blocks',
            next_node_id: TB_NEXT_NODE,
            time_block_cost: { amount: 3 },
          },
        ],
      },
      [TB_NEXT_NODE]: {
        id: TB_NEXT_NODE,
        type: 'narrator',
        text: 'Done.',
        is_end: true,
      },
    };

    const olapApp = express();
    olapApp.use(express.json());
    olapApp.use('/dialogue', dialogueRouter);

    let olapServer: ReturnType<typeof express.Application.listen>;
    let olapPort: number;

    beforeAll(async () => {
      await queryOLTP(
        `INSERT INTO users (id, email, username, display_name, time_blocks, credits)
         VALUES ($1, 'tb-olap@test.com', 'tb_olap_test', 'TB OLAP Test', 48, 100)
         ON CONFLICT (id) DO UPDATE SET time_blocks = 48, credits = 100`,
        [TB_TEST_USER_ID]
      );
      await queryOLTP(
        `INSERT INTO player_states (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [TB_TEST_USER_ID]
      );
      await queryOLTP(
        `INSERT INTO dialogue_trees (id, name, start_node_id, nodes)
         VALUES ($1, 'TB OLAP Tree', $2, $3)
         ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes`,
        [TB_TEST_TREE_ID, TB_ROOT_NODE, JSON.stringify(tbNodes)]
      );
      await queryOLTP(
        `UPDATE users SET active_dialogue_id = $1, current_node_id = $2 WHERE id = $3`,
        [TB_TEST_TREE_ID, TB_ROOT_NODE, TB_TEST_USER_ID]
      );
      await queryOLTP(
        `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, choices_made)
         VALUES ($1, $2, $3, '[]')
         ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET current_node_id = EXCLUDED.current_node_id`,
        [TB_TEST_USER_ID, TB_TEST_TREE_ID, TB_ROOT_NODE]
      );

      olapServer = await new Promise<ReturnType<typeof express.Application.listen>>((resolve) => {
        const s = olapApp.listen(0, () => resolve(s));
      });
      olapPort = (olapServer.address() as { port: number }).port;
    });

    afterAll(async () => {
      await queryOLTP(`DELETE FROM player_dialogue_states WHERE dialogue_tree_id = $1`, [TB_TEST_TREE_ID]);
      await queryOLTP(`DELETE FROM dialogue_trees WHERE id = $1`, [TB_TEST_TREE_ID]);
      await queryOLTP(`DELETE FROM users WHERE id = $1`, [TB_TEST_USER_ID]);
      if (olapServer) {
        await new Promise<void>((resolve) => olapServer.close(() => resolve()));
      }
    });

    test('POST /dialogue/choose emits dialogue_choice OLAP event with time_blocks_cost', async () => {
      const res = await fetch(`http://localhost:${olapPort}/dialogue/${TB_TEST_TREE_ID}/choose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${generateToken(TB_TEST_USER_ID)}`,
        },
        body: JSON.stringify({ choiceIndex: 0 }),
      });
      expect(res.ok).toBe(true);

      await new Promise((r) => setTimeout(r, 250));

      const after = await queryOLAP<{
        event_type: string;
        time_blocks_cost: number;
        event_data: { dialogue_tree_id: string; choice_index: number };
      }>(
        `SELECT event_type, time_blocks_cost, event_data
         FROM player_events
         WHERE user_id = $1 AND event_type = 'dialogue_choice'
         ORDER BY created_at DESC LIMIT 1`,
        [TB_TEST_USER_ID]
      );

      expect(after.rows.length).toBe(1);
      expect(after.rows[0].event_type).toBe('dialogue_choice');
      expect(after.rows[0].time_blocks_cost).toBe(3);
      expect(after.rows[0].event_data.dialogue_tree_id).toBe(TB_TEST_TREE_ID);
      expect(after.rows[0].event_data.choice_index).toBe(0);
    });
  });
});
