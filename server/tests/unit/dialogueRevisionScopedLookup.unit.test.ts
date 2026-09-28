/**
 * D1 · Revision-scoped chunk lookup (R12)
 *
 * Regression: the old dialogue path resolved chunks with
 *   WHERE chunk_key = $1 LIMIT 1
 * so a client could load a chunk belonging to a different tree or an
 * older revision than the one their session is pinned to.
 *
 * These tests lock the post-fix contract:
 *   - resolveNextChunk always queries (chunk_key, tree_id, revision)
 *   - bare / partial scope is rejected
 *   - a scoped miss (wrong tree or stale revision) surfaces as not-found
 */
import { describe, it, expect, jest as jestGlobals, beforeEach } from '@jest/globals';

jestGlobals.mock('@las-flores/infra', () => ({
  queryOLTP: jestGlobals.fn(),
  queryContent: jestGlobals.fn(),
  withOLTPTransaction: jestGlobals.fn(
    async (cb: (client: unknown) => Promise<unknown>) => cb({}),
  ),
  getCache: jestGlobals.fn(async () => null),
  setCache: jestGlobals.fn(async () => undefined),
  closeRedis: jestGlobals.fn(async () => undefined),
  invalidatePattern: jestGlobals.fn(async () => undefined),
}));

jestGlobals.mock('../../src/services/contentFetch.js', () => ({
  fetchNodesFromContentUrl: jestGlobals.fn(),
  fetchChunkFromContentUrl: jestGlobals.fn(async () => ({
    nodes: { start: { id: 'start', text: 'hi', choices: [] } },
    leaves: {},
  })),
}));

jestGlobals.mock('../../src/services/SnapshotService.js', () => ({
  getSnapshotContentUrl: jestGlobals.fn(async () => null),
  buildSnapshotChunkKey: jestGlobals.fn(),
  buildSetHash: jestGlobals.fn(() => 'hash'),
  parseSnapshotChunkKey: jestGlobals.fn(() => null),
  getSnapshotContentUrlByChunkKey: jestGlobals.fn(async () => null),
}));

jestGlobals.mock('../../src/services/StorageService.js', () => ({
  fetchContentJson: jestGlobals.fn(),
  uploadToMinio: jestGlobals.fn(),
  deleteFromMinio: jestGlobals.fn(),
  isMinioUrl: jestGlobals.fn(() => false),
  signMinioUrl: jestGlobals.fn(async () => 'url'),
  fetchContentString: jestGlobals.fn(async () => '{}'),
  fetchCdnMedia: jestGlobals.fn(),
  createCdnProxyUrl: jestGlobals.fn(() => 'url'),
  verifyCdnProxySignature: jestGlobals.fn(() => true),
  resolveMediaUrl: jestGlobals.fn(async () => 'url'),
}));

import { DialogueResolver } from '../../src/services/DialogueResolver.js';
import { queryOLTP } from '@las-flores/infra';

const USER = 'u0000000-0000-4000-8000-0000000000d1';
const TREE_A = 't0000000-0000-4000-8000-0000000000a1';
const TREE_B = 't0000000-0000-4000-8000-0000000000b2';
const SHARED_KEY = 'shared_entry';

beforeEach(() => {
  (queryOLTP as jest.Mock).mockReset();
});

describe('D1 revision-scoped chunk lookup', () => {
  it('queries dialogue_chunks by (chunk_key, tree_id, revision) — never bare chunk_key', async () => {
    (queryOLTP as jest.Mock).mockResolvedValue({ rows: [] });

    await expect(
      DialogueResolver.resolveNextChunk(USER, SHARED_KEY, TREE_A, 3),
    ).rejects.toThrow(/not found/);

    expect(queryOLTP).toHaveBeenCalled();
    const [sql, params] = (queryOLTP as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/chunk_key = \$1 AND tree_id = \$2 AND revision = \$3/);
    expect(sql).not.toMatch(/WHERE chunk_key = \$1\s+LIMIT 1/);
    expect(sql).not.toMatch(/ORDER BY revision DESC/);
    expect(params).toEqual([SHARED_KEY, TREE_A, 3]);
  });

  it('rejects a client load scoped to a different tree (scoped miss)', async () => {
    // Simulate: row exists only under TREE_B; lookup for TREE_A returns nothing.
    (queryOLTP as jest.Mock).mockImplementation(async (_sql: string, params?: unknown[]) => {
      if (Array.isArray(params) && params[1] === TREE_B && params[2] === 1) {
        return {
          rows: [
            {
              id: 'chunk-b',
              tree_id: TREE_B,
              chunk_key: SHARED_KEY,
              content_url: 's3://bucket/b.json',
              revision: 1,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      DialogueResolver.resolveNextChunk(USER, SHARED_KEY, TREE_A, 1),
    ).rejects.toThrow(
      `Dialogue chunk not found for chunk_key = ${SHARED_KEY} (tree_id=${TREE_A}, revision=1)`,
    );
  });

  it('rejects a stale revision even when tree_id and chunk_key match', async () => {
    (queryOLTP as jest.Mock).mockImplementation(async (_sql: string, params?: unknown[]) => {
      if (Array.isArray(params) && params[1] === TREE_A && params[2] === 5) {
        return {
          rows: [
            {
              id: 'chunk-a-r5',
              tree_id: TREE_A,
              chunk_key: SHARED_KEY,
              content_url: 's3://bucket/a5.json',
              revision: 5,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      DialogueResolver.resolveNextChunk(USER, SHARED_KEY, TREE_A, 2),
    ).rejects.toThrow(
      `Dialogue chunk not found for chunk_key = ${SHARED_KEY} (tree_id=${TREE_A}, revision=2)`,
    );
  });

  it('refuses resolveNextChunk without a treeId (closes unscoped sentinel)', async () => {
    await expect(
      DialogueResolver.resolveNextChunk(USER, SHARED_KEY, undefined as unknown as string, 0),
    ).rejects.toThrow(/requires treeId and revision/);
    expect(queryOLTP).not.toHaveBeenCalled();
  });
});
