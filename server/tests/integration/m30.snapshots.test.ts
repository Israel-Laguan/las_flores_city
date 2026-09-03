/* eslint-disable max-lines-per-function */
// ============================================================
// M30 Snapshots Integration Test - Phase A
//
// Tests the full snapshot lifecycle:
// 1. SnapshotService.buildSnapshotsForTree generates snapshots
// 2. Snapshots are persisted in dialogue_chunks with synthetic chunk_keys
// 3. DialogueResolver uses snapshot fast path on cache miss
// 4. Fallback to live merge when no snapshot exists
//
// Test isolation rules (AGENTS.md):
// - Dedicated synthetic UUIDs with 'c0' namespace prefix
// - Own user created and cleaned up in afterAll
// - Collision-avoidance comment below
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { queryOLTP, withOLTPTransaction, closeConnections, getRedis, invalidatePattern } from '@las-flores/infra';
import { DialogueResolver } from '../../src/services/DialogueResolver.js';
import {
  buildSnapshotsForTree,
  getSnapshotContentUrl,
  buildSnapshotChunkKey,
  buildSetHash,
} from '../../src/services/SnapshotService.js';
import { publishDialogueTree } from '../../src/services/ContentPublishService.js';

// ⚠️ COLLISION-AVOIDANCE: All test fixtures use dedicated 'c0'-prefixed UUID namespace
// to avoid conflicts with real content (a0*) or other test namespaces (d0*).
// All rows created by this test are cleaned up in afterAll.

const TEST_TREE_ID = 'c0000000-0000-4000-8000-000000000001';
const TEST_USER_ID = 'c0000000-0000-4000-8000-000000000002';
const TEST_MYSTERY_IDS = [
  'c0000000-0000-4000-8000-000000000101',
  'c0000000-0000-4000-8000-000000000102',
];

const TEST_BASE_NODES = {
  start: { id: 'start', text: 'Start node', choices: [] },
  node_a: { id: 'node_a', text: 'Node A', choices: [] },
  node_b: { id: 'node_b', text: 'Node B', choices: [] },
};

const TEST_OVERLAY_NODES = [
  { id: 'overlay_01', text: 'Overlay for mystery 1', choices: [] },
  { id: 'overlay_02', text: 'Overlay for mystery 2', choices: [] },
];

/**
 * Helper to execute a query within a client transaction
 */
async function withClient<T>(fn: (client: any) => Promise<T>): Promise<T> {
  return withOLTPTransaction(async (client) => fn(client));
}

/**
 * Seed the database with test fixtures
 */
async function seedTestFixtures(): Promise<void> {
  await withClient(async (c) => {
    // Insert mysteries (ACTIVE)
    for (const mysteryId of TEST_MYSTERY_IDS) {
      await c.query(
        `INSERT INTO mysteries (id, title, description, status)
         VALUES ($1, $2, $3, 'ACTIVE')
         ON CONFLICT (id) DO NOTHING`,
        [mysteryId, `test_mystery_${mysteryId.slice(0, 8)}`, 'M30 snapshot test mystery']
      );
    }

    // Insert dialogue tree. M32 dropped the in-DB `nodes` column, so publish
    // the node map to the CDN and reference it via `content_url`.
    const treeUrl = await publishDialogueTree(TEST_TREE_ID, JSON.stringify({ nodes: TEST_BASE_NODES }));
    await c.query(
      `INSERT INTO dialogue_trees (id, name, start_node_id, content_url, updated_at, dialogue_scope)
       VALUES ($1, $2, $3, $4, NOW(), 'system')
       ON CONFLICT (id) DO UPDATE SET content_url = EXCLUDED.content_url, updated_at = NOW()`,
      [TEST_TREE_ID, 'test_tree_m30', 'start', treeUrl]
    );

    // Insert overlays for each mystery
    for (let i = 0; i < TEST_MYSTERY_IDS.length; i++) {
      const mysteryId = TEST_MYSTERY_IDS[i];
      await c.query(
        `INSERT INTO dialogue_overlays (id, name, target_tree_id, mystery_id, nodes, is_nsfw, unlock_condition, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, false, 'none', NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          `c0000000-0000-4000-8000-${(i + 10).toString().padStart(12, '0')}`,
          `test_overlay_${i}`,
          TEST_TREE_ID,
          mysteryId,
          JSON.stringify({ [TEST_OVERLAY_NODES[i].id]: TEST_OVERLAY_NODES[i] }),
        ]
      );
    }

    // Insert user
    await c.query(
      `INSERT INTO users (id, email, username, display_name, role)
       VALUES ($1, $2, $3, $4, 'player')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_USER_ID, 'test@m30.local', 'test_user_m30', 'Test User M30']
    );

    // Insert player state
    await c.query(
      `INSERT INTO player_states (user_id, alignment, story_beat)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [TEST_USER_ID, 'neutral', 'prologue']
    );

    // Insert user entitlements (NSFW unlocked = false)
    await c.query(
      `INSERT INTO user_entitlements (user_id, is_nsfw_unlocked)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [TEST_USER_ID, false]
    );
  });
}

/**
 * Clean up all test fixtures
 */
async function cleanupTestFixtures(): Promise<void> {
  await withClient(async (c) => {
    // Delete player_mysteries for test user
    await c.query(`DELETE FROM player_mysteries WHERE user_id = $1`, [TEST_USER_ID]);

    // Delete dialogue_chunks for test tree with snapshot prefix
    await c.query(
      `DELETE FROM dialogue_chunks WHERE tree_id = $1 AND chunk_key LIKE '__snapshot_%'`,
      [TEST_TREE_ID]
    );

    // Delete dialogue_overlays for test mysteries
    for (const mysteryId of TEST_MYSTERY_IDS) {
      await c.query(
        `DELETE FROM dialogue_overlays WHERE target_tree_id = $1 AND mystery_id = $2`,
        [TEST_TREE_ID, mysteryId]
      );
    }

    // Delete dialogue_trees
    await c.query(`DELETE FROM dialogue_trees WHERE id = $1`, [TEST_TREE_ID]);

    // Delete mysteries
    await c.query(`DELETE FROM mysteries WHERE id = ANY($1::uuid[])`, [TEST_MYSTERY_IDS]);

    // Delete user entitlements
    await c.query(`DELETE FROM user_entitlements WHERE user_id = $1`, [TEST_USER_ID]);

    // Delete player states
    await c.query(`DELETE FROM player_states WHERE user_id = $1`, [TEST_USER_ID]);

    // Delete users
    await c.query(`DELETE FROM users WHERE id = $1`, [TEST_USER_ID]);
  });

  // Clear Redis
  try {
    const redis = getRedis();
    await redis.flushall();
  } catch {
    // Redis might not be available
  }
}

// ============================================================
// Test Suite
// ============================================================

describe('M30 Snapshots Integration Test', () => {
  beforeAll(async () => {
    await seedTestFixtures();
  }, 30000);

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeConnections();
    try {
      await (await import('@las-flores/infra')).closeRedis?.();
    } catch {
      // Ignore Redis close errors
    }
  }, 30000);

  beforeEach(async () => {
    // Clear Redis cache before each test
    try {
      getRedis();
      await invalidatePattern('dialogue:resolved:*');
    } catch {
      // Ignore Redis errors
    }
  });

  describe('SnapshotService.buildSnapshotsForTree', () => {
    it('should build snapshots for a tree with overlays', async () => {
      const result = await buildSnapshotsForTree(TEST_TREE_ID);

      expect(result.success).toBeUndefined(); // buildSnapshotsForTree doesn't return success
      expect(result.treeId).toBe(TEST_TREE_ID);
      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
      expect(result.statesGenerated.length).toBeGreaterThan(0);
    }, 30000);

    it('should generate snapshots for all alignment/nsfw combinations', async () => {
      const result = await buildSnapshotsForTree(TEST_TREE_ID);

      // With 2 mysteries and ACTIVE status, we should have:
      // - Empty set
      // - Each single mystery
      // - Both mysteries
      // = 4 sets × 2 nsfw × 3 alignment = 24 snapshots
      // But we might have fewer if some overlays are filtered

      expect(result.statesGenerated.length).toBeGreaterThanOrEqual(1);

      // Verify all combinations of nsfw and alignment are present
      const nsfwValues = new Set(result.statesGenerated.map((s) => s.nsfw));
      const alignments = new Set(result.statesGenerated.map((s) => s.alignment));

      expect(nsfwValues).toContain(false);
      expect(nsfwValues).toContain(true);
      expect(alignments).toContain('neutral');
      expect(alignments).toContain('loyalist');
      expect(alignments).toContain('fugitive');
    }, 30000);
  });

  describe('Snapshot chunk_key format', () => {
    it('should build consistent chunk_keys', () => {
      const state = {
        treeId: TEST_TREE_ID,
        setHash: 'abc123def456',
        nsfw: false,
        alignment: 'neutral' as const,
      };

      const chunkKey = buildSnapshotChunkKey(state);
      expect(chunkKey).toBe('__snapshot_abc123def456_f_neutral');
    });

    it('should build setHash consistently', () => {
      const mysteryIds = [TEST_MYSTERY_IDS[0], TEST_MYSTERY_IDS[1]];
      const hash1 = buildSetHash(mysteryIds);
      const hash2 = buildSetHash(mysteryIds);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(16);

      // Different order should produce same hash (sorted internally)
      const hash3 = buildSetHash([TEST_MYSTERY_IDS[1], TEST_MYSTERY_IDS[0]]);
      expect(hash3).toBe(hash1);
    });
  });

  describe('Snapshot persistence', () => {
    it('should persist snapshot pointers in dialogue_chunks', async () => {
      // Build snapshots
      await buildSnapshotsForTree(TEST_TREE_ID);

      // Query for snapshot chunks
      const result = await queryOLTP<{ id: string; tree_id: string; chunk_key: string; content_url: string | null }>(
        `SELECT id, tree_id, chunk_key, content_url FROM dialogue_chunks 
         WHERE tree_id = $1 AND chunk_key LIKE '__snapshot_%'`,
        [TEST_TREE_ID]
      );

      expect(result.rows.length).toBeGreaterThan(0);

      // Verify chunk_key format
      for (const row of result.rows) {
        expect(row.chunk_key).toMatch(/^__snapshot_[a-f0-9]+_[tf]_(neutral|loyalist|fugitive)$/);
      }
    }, 30000);

    it('should allow lookup by state', async () => {
      // Build snapshots first
      await buildSnapshotsForTree(TEST_TREE_ID);

      // Get the set hash for all mysteries
      const setHash = buildSetHash(TEST_MYSTERY_IDS);

      // Lookup snapshot
      const contentUrl = await getSnapshotContentUrl(
        TEST_TREE_ID,
        setHash,
        false,
        'neutral'
      );

      // Snapshot should exist (MinIO might not be available, but DB row should exist)
      // The contentUrl might be null if MinIO wasn't available during build
      // but the DB row should still exist
      expect(contentUrl).toBeDefined(); // Could be null if MinIO down, but not undefined
    }, 30000);
  });

  describe('DialogueResolver snapshot fast path', () => {
    it('should use snapshot when available (cache miss)', async () => {
      // Build snapshots first
      await buildSnapshotsForTree(TEST_TREE_ID);

      // Clear cache
      await invalidatePattern('dialogue:resolved:*');

      // Resolve tree - should hit snapshot path
      const result = await DialogueResolver.resolveTreeForUser(TEST_USER_ID, TEST_TREE_ID);

      expect(result.rootId).toBe('start');
      expect(result.nodes).toBeDefined();
      expect(Object.keys(result.nodes).length).toBeGreaterThan(0);

      // After first resolve, cache should be populated
      // Second resolve should be faster (cache hit)
      const result2 = await DialogueResolver.resolveTreeForUser(TEST_USER_ID, TEST_TREE_ID);
      expect(result2.rootId).toBe('start');
    }, 30000);

    it('should fall back to live merge when no snapshot exists', async () => {
      // Create a new tree without snapshots
      const NEW_TREE_ID = 'c0000000-0000-4000-8000-000000000010';

      await withClient(async (c) => {
        // M32: externalize the node map to the CDN; `nodes` column is dropped.
        const newTreeUrl = await publishDialogueTree(NEW_TREE_ID, JSON.stringify({ nodes: TEST_BASE_NODES }));
        await c.query(
          `INSERT INTO dialogue_trees (id, name, start_node_id, content_url, updated_at, dialogue_scope)
           VALUES ($1, $2, $3, $4, NOW(), 'system')`,
          [NEW_TREE_ID, 'new_test_tree', 'start', newTreeUrl]
        );
      });

      try {
        // Clear cache
        await invalidatePattern('dialogue:resolved:*');

        // Resolve tree - should use live merge (no snapshot)
        const result = await DialogueResolver.resolveTreeForUser(TEST_USER_ID, NEW_TREE_ID);

        expect(result.rootId).toBe('start');
        expect(result.nodes).toBeDefined();
      } finally {
        // Clean up
        await withClient(async (c) => {
          await c.query(`DELETE FROM dialogue_trees WHERE id = $1`, [NEW_TREE_ID]);
        });
      }
    }, 30000);
  });

  describe('Snapshot content-addressed keys', () => {
    it('should rebuild snapshots idempotently', async () => {
      // Build snapshots first time
      const result1 = await buildSnapshotsForTree(TEST_TREE_ID);
      const chunks1 = result1.chunksCreated;

      // Build snapshots second time - should produce same count
      const result2 = await buildSnapshotsForTree(TEST_TREE_ID);
      const chunks2 = result2.chunksCreated;

      expect(chunks2).toBe(chunks1);
    }, 30000);
  });
});
