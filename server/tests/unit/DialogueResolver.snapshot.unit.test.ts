// ============================================================
// DialogueResolver Snapshot Fast Path Unit Tests - M30 Phase A
//
// Tests the snapshot fast path in _resolveTreeForUserInner:
// - Redis cache hit (unchanged)
// - On miss: try snapshot → MinIO GET → JSON.parse → setCache → return
// - Fallback to existing live merge path
//
// Mocking strategy (per AGENTS.md):
//   - queryOLTP / queryContent mocked for DB-free tests
//   - getCache / setCache mocked (Redis is never touched directly)
//   - fetchContentJson mocked (MinIO is never touched directly) — this is
//     the SNAPSHOT blob fetch made directly by DialogueResolver
//   - fetchNodesFromContentUrl mocked — M32 dropped dialogue_trees.nodes,
//     so the BASE tree node map is hydrated from the CDN via `content_url`.
//     Stubbing it separately from fetchContentJson keeps the assertions
//     about the snapshot fetch unambiguous.
//   - SnapshotService.getSnapshotContentUrl mocked
// ============================================================

import { describe, it, expect, jest as jestGlobals, beforeEach, afterEach } from '@jest/globals';

// ── Module mocks ──────────────────────────────────────────────

// Mock the infra module (Redis + DB)
jestGlobals.mock('@las-flores/infra', () => ({
  queryOLTP: jestGlobals.fn(),
  queryContent: jestGlobals.fn(),
  withOLTPTransaction: jestGlobals.fn(
    async (cb: (client: unknown) => Promise<unknown>) => cb({}),
  ),
  getCache: jestGlobals.fn(async () => null),   // always cache-miss by default
  setCache: jestGlobals.fn(async () => undefined),
  closeRedis: jestGlobals.fn(async () => undefined),
  invalidatePattern: jestGlobals.fn(async () => undefined),
}));

// Mock StorageService.fetchContentJson (MinIO fetch)
jestGlobals.mock('../../src/services/StorageService.js', () => ({
  fetchContentJson: jestGlobals.fn(),
  uploadToMinio: jestGlobals.fn(async () => 's3://bucket/key.json'),
  deleteFromMinio: jestGlobals.fn(async () => undefined),
  // Re-export other functions that might be imported
  isMinioUrl: jestGlobals.fn(() => false),
  signMinioUrl: jestGlobals.fn(async () => 'url'),
  fetchContentString: jestGlobals.fn(async () => '{}'),
  fetchCdnMedia: jestGlobals.fn(async () => ({ buffer: Buffer.from('{}'), contentType: 'application/json' })),
  createCdnProxyUrl: jestGlobals.fn(() => 'url'),
  verifyCdnProxySignature: jestGlobals.fn(() => true),
  resolveMediaUrl: jestGlobals.fn(async () => 'url'),
}));

// M32/M23: the base tree's node map is externalized to the CDN behind
// `content_url` (the `nodes` JSONB column is dropped), so stub the tree
// hydration helper. Keeping this separate from `fetchContentJson` means the
// snapshot-fetch assertions below observe only the snapshot path.
jestGlobals.mock('../../src/services/contentFetch.js', () => ({
  fetchNodesFromContentUrl: jestGlobals.fn(),
  fetchChunkFromContentUrl: jestGlobals.fn(),
}));

// Mock SnapshotService
jestGlobals.mock('../../src/services/SnapshotService.js', () => ({
  getSnapshotContentUrl: jestGlobals.fn(async () => null),
  buildSnapshotChunkKey: jestGlobals.fn((state: any) => `__snapshot_${state.setHash}_${state.nsfw ? 't' : 'f'}_${state.alignment}`),
  buildSetHash: jestGlobals.fn((ids: string[]) => {
    // Simple deterministic hash for testing
    return ids.slice(0, 16).join('_') || 'empty';
  }),
  parseSnapshotChunkKey: jestGlobals.fn(() => null),
  getSnapshotContentUrlByChunkKey: jestGlobals.fn(async () => null),
}));

// ── Imports (after mocks) ─────────────────────────────────────

import { DialogueResolver } from '../../src/services/DialogueResolver.js';
import { queryOLTP, queryContent, getCache, setCache } from '@las-flores/infra';
import { fetchContentJson } from '../../src/services/StorageService.js';
import { fetchNodesFromContentUrl } from '../../src/services/contentFetch.js';
import { getSnapshotContentUrl } from '../../src/services/SnapshotService.js';

// ── Test fixtures ───────────────────────────────────────────────

const MOCK_TREE_ID = 'c0000000-0000-4000-8000-000000000001';
const MOCK_USER_ID = 'u0000000-0000-4000-8000-000000000001';
const MOCK_TREE_CONTENT_URL = 's3://bucket/trees/base.json';

const MOCK_BASE_TREE_NODES = {
  node_001: { id: 'node_001', text: 'Hello', choices: [] },
  node_002: { id: 'node_002', text: 'World', choices: [] },
};

// M32: the tree row carries only a CDN pointer (the `nodes` JSONB column is
// dropped). `MOCK_BASE_TREE_NODES` above is the payload served from that
// pointer — it is returned by `fetchNodesFromContentUrl`, NOT by the DB row.
const MOCK_BASE_TREE = {
  id: MOCK_TREE_ID,
  start_node_id: 'node_001',
  updated_at: new Date('2024-01-01'),
  content_url: MOCK_TREE_CONTENT_URL,
};

const MOCK_OVERLAY = {
  mystery_id: 'c0000000-0000-4000-8000-000000000100',
  nodes: {
    node_001: { id: 'node_001', text: 'Modified Hello', choices: [] },
  },
  updated_at: new Date('2024-01-01'),
  is_nsfw: false,
  unlock_condition: null as const,
};

const MOCK_MERGED_TREE = {
  rootId: 'node_001',
  nodes: {
    node_001: { id: 'node_001', text: 'Modified Hello', choices: [] },
    node_002: { id: 'node_002', text: 'World', choices: [] },
  },
};

// ── Test suite ─────────────────────────────────────────────────

describe('DialogueResolver - Snapshot Fast Path (M30 Phase A)', () => {
  beforeEach(() => {
    jestGlobals.clearAllMocks();
    // M32: every path through _resolveTreeForUserInner loads the base tree
    // (it feeds the versioned cache key), and the node map now comes from the
    // CDN. Default it here so each test is self-contained rather than relying
    // on a previous test's leftover mockImplementation.
    (fetchNodesFromContentUrl as jest.Mock).mockResolvedValue(MOCK_BASE_TREE_NODES);
    (queryContent as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes('dialogue_trees')) return { rows: [MOCK_BASE_TREE] };
      if (sql.includes('dialogue_overlays')) return { rows: [MOCK_OVERLAY] };
      return { rows: [] };
    });
    (queryOLTP as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes('user_entitlements')) return { rows: [{ is_nsfw_unlocked: false }] };
      if (sql.includes('player_states')) {
        return { rows: [{ alignment: 'neutral', story_beat: 'prologue' }] };
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    jestGlobals.restoreAllMocks();
  });

  describe('buildSetHash export', () => {
    it('should export buildSetHash from SnapshotService', async () => {
      // This test verifies the import is available
      const { buildSetHash } = await import('../../src/services/SnapshotService.js');
      expect(buildSetHash).toBeDefined();
      expect(typeof buildSetHash).toBe('function');

      const hash = buildSetHash(['m1', 'm2']);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('snapshot fast path', () => {
    it('should try snapshot path when Redis cache misses', async () => {
      // Setup: mock DB queries
      (queryOLTP as jest.Mock).mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('player_mysteries') && sql.includes('INVESTIGATING')) {
          return { rows: [] };
        }
        if (sql.includes('mysteries') && sql.includes('status = \'ACTIVE\'')) {
          return { rows: [] };
        }
        if (sql.includes('user_entitlements')) {
          return { rows: [{ is_nsfw_unlocked: false }] };
        }
        if (sql.includes('player_states')) {
          return { rows: [{ alignment: 'neutral', story_beat: 'prologue' }] };
        }
        return { rows: [] };
      });

      (queryContent as jest.Mock).mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('dialogue_trees')) {
          return { rows: [MOCK_BASE_TREE] };
        }
        if (sql.includes('dialogue_overlays')) {
          return { rows: [MOCK_OVERLAY] };
        }
        return { rows: [] };
      });

      // Mock snapshot lookup to return a URL
      (getSnapshotContentUrl as jest.Mock).mockResolvedValue('s3://bucket/snapshot.json');

      // Mock MinIO fetch to return snapshot data
      (fetchContentJson as jest.Mock).mockResolvedValue({
        nodes: MOCK_MERGED_TREE.nodes,
        _meta: { startNodeId: 'node_001' },
      });

      // Mock cache miss
      (getCache as jest.Mock).mockResolvedValue(null);

      // Execute
      const result = await DialogueResolver.resolveTreeForUser(MOCK_USER_ID, MOCK_TREE_ID);

      // Verify snapshot path was attempted
      expect(getSnapshotContentUrl).toHaveBeenCalled();
      expect(fetchContentJson).toHaveBeenCalledWith('s3://bucket/snapshot.json');

      // Verify cache was set with snapshot data
      expect(setCache).toHaveBeenCalledWith(
        expect.stringContaining('dialogue:resolved:'),
        expect.objectContaining({
          rootId: 'node_001',
          nodes: MOCK_MERGED_TREE.nodes,
        }),
        expect.any(Number)
      );

      // Verify result matches snapshot
      expect(result.rootId).toBe('node_001');
      expect(result.nodes).toEqual(MOCK_MERGED_TREE.nodes);
    });

    it('should fall back to live merge when no snapshot exists', async () => {
      // Setup: mock DB queries
      (queryOLTP as jest.Mock).mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('player_mysteries') && sql.includes('INVESTIGATING')) {
          return { rows: [] };
        }
        if (sql.includes('mysteries') && sql.includes('status = \'ACTIVE\'')) {
          return { rows: [] };
        }
        if (sql.includes('user_entitlements')) {
          return { rows: [{ is_nsfw_unlocked: false }] };
        }
        if (sql.includes('player_states')) {
          return { rows: [{ alignment: 'neutral', story_beat: 'prologue' }] };
        }
        return { rows: [] };
      });

      (queryContent as jest.Mock).mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('dialogue_trees')) {
          return { rows: [MOCK_BASE_TREE] };
        }
        if (sql.includes('dialogue_overlays')) {
          return { rows: [MOCK_OVERLAY] };
        }
        return { rows: [] };
      });

      // Mock snapshot lookup to return null (no snapshot)
      (getSnapshotContentUrl as jest.Mock).mockResolvedValue(null);

      // Mock cache miss
      (getCache as jest.Mock).mockResolvedValue(null);

      // Execute
      const result = await DialogueResolver.resolveTreeForUser(MOCK_USER_ID, MOCK_TREE_ID);

      // Verify snapshot path was attempted but returned null
      expect(getSnapshotContentUrl).toHaveBeenCalled();
      expect(fetchContentJson).not.toHaveBeenCalled();

      // Verify live merge was executed (cache was set)
      expect(setCache).toHaveBeenCalled();

      // Verify result is from live merge
      expect(result.rootId).toBe(MOCK_BASE_TREE.start_node_id);
    });

    it('should fall back to live merge when snapshot fetch fails', async () => {
      // Setup: mock DB queries
      (queryOLTP as jest.Mock).mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('player_mysteries') && sql.includes('INVESTIGATING')) {
          return { rows: [] };
        }
        if (sql.includes('mysteries') && sql.includes('status = \'ACTIVE\'')) {
          return { rows: [] };
        }
        if (sql.includes('user_entitlements')) {
          return { rows: [{ is_nsfw_unlocked: false }] };
        }
        if (sql.includes('player_states')) {
          return { rows: [{ alignment: 'neutral', story_beat: 'prologue' }] };
        }
        return { rows: [] };
      });

      (queryContent as jest.Mock).mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('dialogue_trees')) {
          return { rows: [MOCK_BASE_TREE] };
        }
        if (sql.includes('dialogue_overlays')) {
          return { rows: [MOCK_OVERLAY] };
        }
        return { rows: [] };
      });

      // Mock snapshot lookup to return a URL
      (getSnapshotContentUrl as jest.Mock).mockResolvedValue('s3://bucket/snapshot.json');

      // Mock MinIO fetch to throw an error
      (fetchContentJson as jest.Mock).mockRejectedValue(new Error('MinIO fetch failed'));

      // Mock cache miss
      (getCache as jest.Mock).mockResolvedValue(null);

      // Execute - should not throw
      const result = await DialogueResolver.resolveTreeForUser(MOCK_USER_ID, MOCK_TREE_ID);

      // Verify snapshot fetch was attempted
      expect(fetchContentJson).toHaveBeenCalledWith('s3://bucket/snapshot.json');

      // Verify live merge was executed as fallback
      expect(setCache).toHaveBeenCalled();

      // Verify result is from live merge
      expect(result.rootId).toBe(MOCK_BASE_TREE.start_node_id);
    });

    it('should use Redis cache hit and skip snapshot path', async () => {
      // Mock cache hit
      (getCache as jest.Mock).mockResolvedValue(MOCK_MERGED_TREE);

      // Execute
      const result = await DialogueResolver.resolveTreeForUser(MOCK_USER_ID, MOCK_TREE_ID);

      // Verify snapshot path was NOT attempted (cache hit)
      expect(getSnapshotContentUrl).not.toHaveBeenCalled();
      expect(fetchContentJson).not.toHaveBeenCalled();

      // Verify result is from cache
      expect(result).toEqual(MOCK_MERGED_TREE);
    });

    it('should handle empty mystery set correctly', async () => {
      // Setup: mock DB queries with no overlays
      (queryOLTP as jest.Mock).mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('player_mysteries') && sql.includes('INVESTIGATING')) {
          return { rows: [] };
        }
        if (sql.includes('mysteries') && sql.includes('status = \'ACTIVE\'')) {
          return { rows: [] };
        }
        if (sql.includes('user_entitlements')) {
          return { rows: [{ is_nsfw_unlocked: false }] };
        }
        if (sql.includes('player_states')) {
          return { rows: [{ alignment: 'neutral', story_beat: 'prologue' }] };
        }
        return { rows: [] };
      });

      (queryContent as jest.Mock).mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('dialogue_trees')) {
          return { rows: [MOCK_BASE_TREE] };
        }
        if (sql.includes('dialogue_overlays')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      // Mock snapshot lookup with empty set hash
      (getSnapshotContentUrl as jest.Mock).mockImplementation(async (
        treeId: string,
        setHash: string,
        nsfw: boolean,
        alignment: string
      ) => {
        // With empty set, setHash should be 'empty'
        if (setHash === 'empty') {
          return 's3://bucket/snapshot_empty.json';
        }
        return null;
      });

      // Mock MinIO fetch to return base tree nodes
      (fetchContentJson as jest.Mock).mockResolvedValue({
        nodes: MOCK_BASE_TREE_NODES,
        _meta: { startNodeId: MOCK_BASE_TREE.start_node_id },
      });

      // Mock cache miss
      (getCache as jest.Mock).mockResolvedValue(null);

      // Execute
      const result = await DialogueResolver.resolveTreeForUser(MOCK_USER_ID, MOCK_TREE_ID);

      // Verify snapshot path was attempted with empty set
      expect(getSnapshotContentUrl).toHaveBeenCalledWith(
        MOCK_TREE_ID,
        'empty',
        false,
        'neutral'
      );

      // Verify result has base tree nodes
      expect(result.rootId).toBe(MOCK_BASE_TREE.start_node_id);
    });
  });

  describe('buildSnapshotChunkKey', () => {
    it('should build deterministic chunk keys', async () => {
      const { buildSnapshotChunkKey } = await import('../../src/services/SnapshotService.js');

      const state1 = {
        treeId: 'tree1',
        setHash: 'abc123',
        nsfw: false,
        alignment: 'neutral' as const,
      };

      const key1 = buildSnapshotChunkKey(state1);
      expect(key1).toBe('__snapshot_abc123_f_neutral');

      const state2 = {
        treeId: 'tree1',
        setHash: 'abc123',
        nsfw: true,
        alignment: 'loyalist' as const,
      };

      const key2 = buildSnapshotChunkKey(state2);
      expect(key2).toBe('__snapshot_abc123_t_loyalist');
    });
  });
});
