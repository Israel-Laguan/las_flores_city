import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { queryOLTP, withOLTPTransaction, closeConnections, invalidatePattern, closeRedis } from '@las-flores/infra';

// ============================================================
// M23 Dialogue CDN Integration Tests
//
// Exercises the publish-first externalization ordering and the
// CDN-fetch + Redis-merge read path for DialogueResolver:
//  1. Compiling a dialogue tree publishes chunk + tree-node blobs
//     to "MinIO" and sets `content_url` references on the DB rows.
//  2. The resolver fetches base nodes from the CDN via `content_url`
//     and merges overlays in Redis-cached memory.
//  3. Re-publishing changed content bumps the content-addressed key
//     → the resolver's versioned cache key forces fresh resolution
//     (no stale CDN reads).
//  4. When `content_url` is NULL, the resolver falls back to the
//     in-DB JSONB.
//
// Uses an in-memory MinIO simulation (mocked StorageService) for a
// deterministic CDN without requiring a live MinIO during CI/Jest.
// Requires: running OLTP DB + Redis.
// ============================================================

// ---- In-memory "MinIO" simulation ---------------------------------
// Faithfully mirrors publish-first ordering: uploads are recorded by
// object key; fetches read back the same key as JSON.
const objectStore = new Map<string, string>();

const mockUploadToMinio = jest.fn(async (buffer: Buffer, key: string) => {
  objectStore.set(key, buffer.toString('utf-8'));
  return `s3://las-flores/${key}`;
});
const mockFetchContentJson = jest.fn(async (url: string) => {
  const key = url.replace(/^s3:\/\/[^/]+\//, '');
  const raw = objectStore.get(key);
  if (raw === undefined) throw new Error(`Object not found: ${key}`);
  return JSON.parse(raw);
});

jest.doMock('../../src/services/StorageService.js', () => ({
  uploadToMinio: mockUploadToMinio,
  fetchContentJson: mockFetchContentJson,
}));

// Loaded dynamically inside beforeAll so the StorageService mock above is
// registered before these modules (which transitively import StorageService)
// are evaluated — mirrors the asset-promotion.test.ts pattern.
let compileDialogueTree: typeof import('../../src/content/compiler.js').compileDialogueTree;
let DialogueResolver: typeof import('../../src/services/DialogueResolver.js').DialogueResolver;
import type { DialogueNode } from '@las-flores/shared';

// Dedicated synthetic UUIDs + a read-only resolver user (no player rows
// are created — the resolver's player queries safely return empty).
const TEST_TREE_ID = 'e3000000-0000-4000-8000-000000000001';
const TEST_USER_ID = 'e3000000-0000-4000-8000-000000000002';

let treeContentUrl: string | null = null;
let chunkId = '';
let chunkKey = '';

function baseNodes(text = 'v1'): Record<string, DialogueNode> {
  return {
    start: {
      id: 'start',
      type: 'narrator',
      text,
      choices: [{ id: 'c1', text: 'Go', next_node_id: 'next' }],
    },
    next: { id: 'next', type: 'narrator', text: `end-${text}` },
  };
}

async function seedTree(nodes: Record<string, DialogueNode>): Promise<void> {
  await withOLTPTransaction(async (client) => {
    await client.query(
      `INSERT INTO dialogue_trees (id, name, start_node_id, nodes, content_url)
       VALUES ($1, 'M23 CDN Tree', 'start', $2, NULL)
       ON CONFLICT (id) DO UPDATE SET nodes = EXCLUDED.nodes, start_node_id = EXCLUDED.start_node_id, content_url = NULL, updated_at = NOW()`,
      [TEST_TREE_ID, JSON.stringify(nodes)]
    );
  });
}

async function loadChunkRow() {
  const result = await queryOLTP<{ id: string; chunk_key: string; content_url: string | null }>(
    `SELECT id, chunk_key, content_url FROM dialogue_chunks WHERE tree_id = $1 AND chunk_key = 'start' LIMIT 1`,
    [TEST_TREE_ID]
  );
  return result.rows[0];
}

beforeAll(async () => {
  // Dynamic import AFTER the StorageService doMock so the in-memory MinIO
  // simulation is used instead of the real implementation.
  const compilerMod = await import('../../src/content/compiler.js');
  compileDialogueTree = compilerMod.compileDialogueTree;
  const resolverMod = await import('../../src/services/DialogueResolver.js');
  DialogueResolver = resolverMod.DialogueResolver;

  await seedTree(baseNodes('v1'));
  await compileDialogueTree(TEST_TREE_ID);

  const row = await loadChunkRow();
  chunkId = row.id;
  chunkKey = row.chunk_key;

  const tree = await queryOLTP<{ content_url: string | null }>(
    'SELECT content_url FROM dialogue_trees WHERE id = $1',
    [TEST_TREE_ID]
  );
  treeContentUrl = tree.rows[0].content_url;
});

afterAll(async () => {
  try {
    await withOLTPTransaction(async (client) => {
      await client.query('DELETE FROM dialogue_chunks WHERE tree_id = $1', [TEST_TREE_ID]);
      await client.query('DELETE FROM dialogue_overlays WHERE target_tree_id = $1', [TEST_TREE_ID]);
      await client.query('DELETE FROM dialogue_trees WHERE id = $1', [TEST_TREE_ID]);
    });
    await invalidatePattern(`dialogue:resolved:chunk:${TEST_TREE_ID}:*`);
    await invalidatePattern(`dialogue:resolved:${TEST_TREE_ID}:*`);
  } finally {
    objectStore.clear();
    await closeConnections();
    await closeRedis();
  }
});

describe('M23 dialogue CDN externalization', () => {
  it('compiling publishes the tree + chunk blobs and sets content_url references', () => {
    // Uploaded objects are content-addressed (include a hash).
    const keys = [...objectStore.keys()];
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys.some((k) => k.startsWith('dialogues/'))).toBe(true);
    expect(keys.some((k) => k.startsWith('chunks/'))).toBe(true);
    keys.forEach((k) => expect(k).toMatch(/__[0-9a-f]{16}\.json$/));

    // DB pointers were set AFTER publish.
    expect(treeContentUrl).toMatch(/^s3:\/\/las-flores\/dialogues\//);
    expect(chunkId).toBeTruthy();
  });

  it('resolveChunkForUser fetches base nodes from CDN (not DB) when content_url is set', async () => {
    const resolved = await DialogueResolver.resolveChunkForUser(TEST_USER_ID, chunkId, chunkKey);

    // Base nodes served from the published blob:
    expect(resolved.mergedNodes.start.text).toBe('v1');
    expect(resolved.mergedNodes.next.text).toBe('end-v1');
    // Doc: the chunk.nodes in the result reflect the CDN-loaded base.
    expect(resolved.chunk.nodes.start.text).toBe('v1');

    // Second call returns the same result. (The base chunk row — including
    // `content_url` — is loaded before the Redis cache lookup, so a CDN fetch
    // still occurs on each resolve; the Redis cache short-circuits the overlay
    // merge, which is the expensive part. CDN GETs are the affordable hot-path
    // reads M23 wants — the win is removing the heavy JSONB/OLTP read.)
    const cached = await DialogueResolver.resolveChunkForUser(TEST_USER_ID, chunkId, chunkKey);
    expect(cached.mergedNodes.start.text).toBe('v1');
  });

  it('re-publishing changed content serves the new blob (publish-first invalidation ordering)', async () => {
    // Author changes the tree content, then re-compiles (republish).
    await seedTree(baseNodes('v2'));
    await compileDialogueTree(TEST_TREE_ID);

    const row = await loadChunkRow();
    chunkId = row.id;
    chunkKey = row.chunk_key;

    // A new content-addressed key was published (old blob no longer referenced).
    const newTree = await queryOLTP<{ content_url: string | null }>(
      'SELECT content_url FROM dialogue_trees WHERE id = $1',
      [TEST_TREE_ID]
    );
    expect(newTree.rows[0].content_url).not.toBe(treeContentUrl);
    treeContentUrl = newTree.rows[0].content_url;

    // Resolver now serves the new content (cache key changed → no stale).
    const resolved = await DialogueResolver.resolveChunkForUser(TEST_USER_ID, chunkId, chunkKey);
    expect(resolved.mergedNodes.start.text).toBe('v2');
    expect(resolved.mergedNodes.next.text).toBe('end-v2');
  });

  it('falls back to in-DB nodes when content_url is NULL', async () => {
    // Insert a chunk row with content_url NULL (no externalized blob).
    const fallbackId = await withOLTPTransaction(async (client) => {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO dialogue_chunks (tree_id, chunk_key, nodes, leaves, content_url)
         VALUES ($1, 'fallback_chunk', $2, '{}', NULL)
         RETURNING id`,
        [TEST_TREE_ID, JSON.stringify({ root: { id: 'root', type: 'narrator', text: 'from-db' } })]
      );
      return ins.rows[0].id;
    });

    // loadBaseChunk resolves by the chunk's UUID id, which has content_url NULL.
    const resolved = await DialogueResolver.resolveChunkForUser(TEST_USER_ID, fallbackId, 'fallback_chunk');
    expect(resolved.mergedNodes.root.text).toBe('from-db');
  });

  it('hydrates chunk.leaves from content_url when the DB leaves column holds no content', async () => {
    // Regression for M23 Phase 2: the resolver must read BOTH nodes and
    // leaves from the CDN blob, not the DB `leaves` column.
    // `dialogue_chunks.leaves` is `NOT NULL DEFAULT '{}'`, so the faithful
    // "DB has no leaves" signal we assert against is the empty `'{}'` value.
    // The resolver's `??` fallback treats NULL and empty identically, so this
    // covers the NULL case too (and the CDN fetch path is unchanged either way).
    const cdnNodes = { leaf: { id: 'leaf', type: 'narrator' as const, text: 'from-cdn-nodes' } };
    const cdnLeaves = {
      leaf_exit: { type: 'FREE' as const, target_chunk: 'next_chunk' },
      leaf_guard: {
        type: 'GUARDED' as const,
        target_chunk: 'guarded_chunk',
        reasons: ['time_block_cost'],
        tb_cost: 3,
      },
    };
    const leafKey = `chunks/${TEST_TREE_ID}/leaf_chunk__deadbeefdeadbeef.json`;
    objectStore.set(leafKey, JSON.stringify({ nodes: cdnNodes, leaves: cdnLeaves }));
    const leafUrl = `s3://las-flores/${leafKey}`;

    const leafChunkId = await withOLTPTransaction(async (client) => {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO dialogue_chunks (tree_id, chunk_key, nodes, leaves, content_url)
               VALUES ($1, 'leaf_chunk', $2, '{}', $3)
               RETURNING id`,
        [TEST_TREE_ID, JSON.stringify(cdnNodes), leafUrl]
      );
      return ins.rows[0].id;
    });

    const resolved = await DialogueResolver.resolveChunkForUser(TEST_USER_ID, leafChunkId, 'leaf_chunk');

    // leaves served from the published blob, NOT the in-DB '{}' column:
    expect(resolved.chunk.leaves).toEqual(cdnLeaves);
    expect(Object.keys(resolved.chunk.leaves).length).toBe(2);
    // nodes also come from the CDN blob:
    expect(resolved.chunk.nodes.leaf.text).toBe('from-cdn-nodes');
  });
});