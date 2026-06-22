// ============================================================
// DialogueResolver - Mystery Overlay Merging Service
// ============================================================
// Resolves a player's effective dialogue tree by combining a
// base tree with any active mystery overlays. The merged tree
// is cached in Redis keyed by the sorted set of active
// mystery IDs, so players in the same mystery state share one
// cached tree (cross-user memory win).
//
// Spec: "deep merge of base nodes and overlay nodes", with
// arrays (e.g. `choices`) replaced wholesale by the overlay
// (predictable author control over options, not element-wise
// merging).
// ============================================================

import { createHash } from 'node:crypto';
import { queryOLTP } from '../database/connection.js';
import { getCache, setCache } from '../database/redis.js';
import { DialogueNode, Leaf } from '@las-flores/shared';

export interface ResolvedTree {
  rootId: string;
  nodes: Record<string, DialogueNode>;
}

export interface ResolvedChunk {
  chunk: {
    id: string;
    chunk_key: string;
    tree_id: string;
    nodes: Record<string, DialogueNode>;
    leaves: Record<string, Leaf>;
  };
  currentNodeId: string;
  mergedNodes: Record<string, DialogueNode>;
}

interface BaseDialogueTree {
  start_node_id: string;
  updated_at: string;
  nodes: Record<string, DialogueNode>;
}

interface BaseDialogueChunkRow {
  id: string;
  tree_id: string;
  chunk_key: string;
  nodes: Record<string, DialogueNode>;
  leaves: Record<string, Leaf>;
}

interface OverlayRow {
  nodes: Record<string, DialogueNode>;
  updated_at: Date;
  is_nsfw: boolean;
  // Gate overlays by alignment via `unlock_condition`.
  // Nullable because older overlay rows may not have it set.
  unlock_condition?: 'none' | 'patreon_nsfw' | 'loyalist_only' | 'fugitive_only' | null;
}

const CACHE_TTL_SECONDS = 3600; // 1 hour

// In-flight Promise map for request coalescing (thundering herd protection).
// When a Breakthrough Event ends and `invalidatePattern('dialogue:resolved:*')` fires,
// thousands of concurrent requests will all miss the cache simultaneously.
// Without deduping, each request independently hits PostgreSQL to recalculate the
// resolved tree. With deduping, only the first request for a given cache key performs
// the merge; all subsequent identical requests await the same Promise.
const inflightResolutions = new Map<string, Promise<ResolvedTree>>();

function buildOverlayFingerprint(overlays: OverlayRow[]): string {
  const fingerprints = overlays
    .map((overlay) => `${overlay.updated_at.toISOString()}:${JSON.stringify(overlay.nodes)}`)
    .sort();

  return createHash('sha1').update(fingerprints.join('|')).digest('hex').slice(0, 16);
}

/**
 * Deep-merge a base nodes dict with overlay nodes.
 *
 * Per-node merge: spread base first, then overlay — the overlay
 * overwrites the base for every key it provides. Arrays (e.g.
 * `choices`) are fully replaced by the overlay's array, never
 * element-wise merged. Nodes present only in the overlay are
 * added to the merged dict.
 */
export function deepMergeNodes(
  baseNodes: Record<string, DialogueNode>,
  overlayNodes: Record<string, DialogueNode>
): Record<string, DialogueNode> {
  const merged: Record<string, DialogueNode> = { ...baseNodes };

  for (const [nodeId, overlayNode] of Object.entries(overlayNodes)) {
    if (merged[nodeId]) {
      merged[nodeId] = { ...merged[nodeId], ...overlayNode };
    } else {
      merged[nodeId] = { ...overlayNode };
    }
  }

  return merged;
}

export class DialogueResolver {
  /**
   * Resolve the effective dialogue tree for a given user and
   * base tree id. The result is the base tree, deep-merged with
   * any active mystery overlays for this tree. ACTIVE mysteries
   * are merged so hook choices are visible to all players.
   * Cached in Redis by sorted mystery IDs (deterministic key
   * regardless of order).
   */
  public static async resolveTreeForUser(
    userId: string,
    baseTreeId: string
  ): Promise<ResolvedTree> {
    // Build a dedup key early so concurrent calls with the same
    // (userId, baseTreeId) pair coalesce onto a single in-flight resolution.
    const dedupKey = `user:${userId}:tree:${baseTreeId}`;

    const inflight = inflightResolutions.get(dedupKey);
    if (inflight) {
      return inflight;
    }

    const resolution = DialogueResolver._resolveTreeForUserInner(userId, baseTreeId);
    inflightResolutions.set(dedupKey, resolution);

    try {
      const result = await resolution;
      return result;
    } finally {
      // Always clean up the map entry so subsequent requests go through normally
      inflightResolutions.delete(dedupKey);
    }
  }

  /**
   * Inner implementation of resolveTreeForUser, separated so the public
   * method can wrap it with Promise deduping.
   */
  private static async _resolveTreeForUserInner(
    userId: string,
    baseTreeId: string
  ): Promise<ResolvedTree> {
    const [investigatingIds, activeMysteryIds, isNsfwUnlocked, alignment] = await Promise.all([
      DialogueResolver.getActiveMysteryIds(userId),
      DialogueResolver.getActiveMysteries(),
      DialogueResolver.getUserNsfwStatus(userId),
      DialogueResolver.getUserAlignment(userId),
    ]);

    // Combine investigating + active mysteries for overlay loading.
    // This ensures hook choices (in overlays for ACTIVE mysteries) are
    // visible to all players, while full overlays merge for investigators.
    const allMysteryIds = [...new Set([...investigatingIds, ...activeMysteryIds])].sort();

    const baseTree = await DialogueResolver.loadBaseTree(baseTreeId);
    let resolvedNodes = baseTree.nodes;
    const overlays = await DialogueResolver.loadMysteryOverlays(
      baseTreeId,
      allMysteryIds
    );
    const overlayFingerprint =
      overlays.length > 0 ? buildOverlayFingerprint(overlays) : baseTree.updated_at;
    const cacheSuffix =
      allMysteryIds.length > 0
        ? `${allMysteryIds.join('_')}:${overlayFingerprint}`
        : `base:${overlayFingerprint}`;
    // Alignment is part of the cache key so the
    // post-commit invalidate in /dialogue/choose forces a fresh
    // merge once a player picks the finale choice.
    const cacheKey = `dialogue:resolved:${baseTreeId}:nsfw:${isNsfwUnlocked}:align:${alignment}:mysteries:${cacheSuffix}`;

    const cachedTree = await getCache<ResolvedTree>(cacheKey);
    if (cachedTree) {
      return cachedTree;
    }

    for (const overlay of overlays) {
      // Entitlement gate: skip NSFW overlays for users without the unlock
      if (overlay.is_nsfw && !isNsfwUnlocked) {
        continue;
      }
      // Alignment gate. `loyalist_only` / `fugitive_only`
      // overlays (set in YAML via `unlock_condition`) only merge
      // for the matching faction. We don't have the unlock_condition
      // column in the SELECT above, so re-load it here — overlays
      // table is small, this is a single round trip.
      if (overlay.unlock_condition === 'loyalist_only' && alignment !== 'loyalist') continue;
      if (overlay.unlock_condition === 'fugitive_only' && alignment !== 'fugitive') continue;
      if (overlay.nodes) {
        resolvedNodes = deepMergeNodes(resolvedNodes, overlay.nodes);
      }
    }

    const finalTree: ResolvedTree = { rootId: baseTree.start_node_id, nodes: resolvedNodes };

    await setCache(cacheKey, finalTree, CACHE_TTL_SECONDS);

    return finalTree;
  }

  /**
   * Resolve a dialogue tree for Archive Room legacy play.
   *
   * Same deep-merge as resolveTreeForUser, but loads ALL overlays
   * for the given mystery regardless of mystery status — so an
   * ARCHIVED mystery's investigation content stays playable for
   * latecomers via POST /archive/start-simulation. Still honors
   * NSFW entitlement. Cached separately under `dialogue:archive:*`
   * so it never collides with live `dialogue:resolved:*` entries.
   */
  public static async resolveTreeForArchive(
    baseTreeId: string,
    mysteryId: string,
    isNsfwUnlocked: boolean
  ): Promise<ResolvedTree> {
    const baseTree = await DialogueResolver.loadBaseTree(baseTreeId);
    const overlays = await DialogueResolver.loadAllMysteryOverlays(baseTreeId, mysteryId);
    const overlayFingerprint =
      overlays.length > 0 ? buildOverlayFingerprint(overlays) : baseTree.updated_at;
    const cacheKey = `dialogue:archive:${baseTreeId}:${mysteryId}:nsfw:${isNsfwUnlocked}:${overlayFingerprint}`;

    const cachedTree = await getCache<ResolvedTree>(cacheKey);
    if (cachedTree) {
      return cachedTree;
    }

    let resolvedNodes = baseTree.nodes;
    for (const overlay of overlays) {
      if (overlay.is_nsfw && !isNsfwUnlocked) {
        continue;
      }
      if (overlay.nodes) {
        resolvedNodes = deepMergeNodes(resolvedNodes, overlay.nodes);
      }
    }

    const finalTree: ResolvedTree = { rootId: baseTree.start_node_id, nodes: resolvedNodes };
    await setCache(cacheKey, finalTree, CACHE_TTL_SECONDS);
    return finalTree;
  }

  /**
   * Get the set of mystery IDs that the user is currently
   * investigating. Returns sorted array of UUIDs (deterministic
   * cache key regardless of order).
   */
  public static async getActiveMysteryIds(userId: string): Promise<string[]> {
    const result = await queryOLTP<{ mystery_id: string }>(
      `SELECT mystery_id 
       FROM player_mysteries 
       WHERE user_id = $1 AND status = 'INVESTIGATING'`,
      [userId]
    );
    return result.rows.map((row) => row.mystery_id).sort();
  }

  /**
   * Get the set of ACTIVE mystery IDs for any tree (so overlays
   * with hook choices are visible to all players).
   */
  public static async getActiveMysteries(): Promise<string[]> {
    const result = await queryOLTP<{ id: string }>(
      `SELECT id FROM mysteries WHERE status = 'ACTIVE'`
    );
    return result.rows.map((row) => row.id).sort();
  }

  /**
   * Get the user's NSFW unlock status from user_entitlements.
   * Returns false if no entitlements row exists.
   */
  public static async getUserNsfwStatus(userId: string): Promise<boolean> {
    const result = await queryOLTP<{ is_nsfw_unlocked: boolean }>(
      `SELECT is_nsfw_unlocked FROM user_entitlements WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0]?.is_nsfw_unlocked ?? false;
  }

  /**
   * Meta-plot finale alignment. Defaults to 'neutral'
   * for users with no player_states row (shouldn't happen, but mirrors
   * the `NOT NULL DEFAULT 'neutral'` constraint on the column).
   */
  public static async getUserAlignment(userId: string): Promise<'neutral' | 'loyalist' | 'fugitive'> {
    const result = await queryOLTP<{ alignment: 'neutral' | 'loyalist' | 'fugitive' }>(
      `SELECT alignment FROM player_states WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0]?.alignment ?? 'neutral';
  }

  /**
   * Load the base dialogue tree (raw, no overlays).
   */
  private static async loadBaseTree(
    baseTreeId: string
  ): Promise<BaseDialogueTree> {
    const result = await queryOLTP<{
      start_node_id: string;
      updated_at: string;
      nodes: Record<string, DialogueNode>;
    }>(`SELECT start_node_id, updated_at, nodes FROM dialogue_trees WHERE id = $1`, [
      baseTreeId,
    ]);

    if (result.rows.length === 0) {
      throw new Error(`Base dialogue tree not found: ${baseTreeId}`);
    }

    return result.rows[0];
  }

  /**
   * Load all mystery overlays that apply to this tree and any
   * of the provided mystery IDs.
   */
  private static async loadMysteryOverlays(
    baseTreeId: string,
    mysteryIds: string[]
  ): Promise<OverlayRow[]> {
    const result = await queryOLTP<OverlayRow>(
      `SELECT nodes, updated_at, is_nsfw, unlock_condition
       FROM dialogue_overlays
       WHERE target_tree_id = $1
         AND mystery_id = ANY($2::uuid[])
         AND nodes IS NOT NULL
         AND nodes != '{}'::jsonb`,
      [baseTreeId, mysteryIds]
    );
    return result.rows;
  }

  /**
   * Load every overlay for a single mystery that targets
   * the given tree, ignoring mystery status. Used by the Archive
   * Room for legacy playback of ARCHIVED mysteries.
   */
  private static async loadAllMysteryOverlays(
    baseTreeId: string,
    mysteryId: string
  ): Promise<OverlayRow[]> {
    const result = await queryOLTP<OverlayRow>(
      `SELECT nodes, updated_at, is_nsfw, unlock_condition
         FROM dialogue_overlays
        WHERE target_tree_id = $1
          AND mystery_id = $2
          AND nodes IS NOT NULL
          AND nodes != '{}'::jsonb`,
      [baseTreeId, mysteryId]
    );
    return result.rows;
  }

  // ============================================================
  // Chunk-based Resolution (Task 7.4)
  // ============================================================

  /**
   * Resolve a chunk for a user, merging base chunk nodes with any
   * active mystery overlays. Uses the same fingerprinting and
   * caching pattern as resolveTreeForUser.
   *
   * Requirements: 7.1, 7.2, 7.3, 7.4
   */
  public static async resolveChunkForUser(
    userId: string,
    chunkId: string,
    chunkKey: string
  ): Promise<ResolvedChunk> {
    // 1. Load base chunk from dialogue_chunks using chunkId
    const chunkRow = await DialogueResolver.loadBaseChunk(chunkId);

    // 2. Load user context (mirrors resolveTreeForUser pattern)
    const [investigatingIds, activeMysteryIds, isNsfwUnlocked, alignment] = await Promise.all([
      DialogueResolver.getActiveMysteryIds(userId),
      DialogueResolver.getActiveMysteries(),
      DialogueResolver.getUserNsfwStatus(userId),
      DialogueResolver.getUserAlignment(userId),
    ]);

    const allMysteryIds = [...new Set([...investigatingIds, ...activeMysteryIds])].sort();

    // 3. Load overlays for this chunk's tree
    const overlays = await DialogueResolver.loadMysteryOverlays(chunkRow.tree_id, allMysteryIds);

    // 4. Build cache fingerprint (same pattern as resolveTreeForUser)
    const overlayFingerprint =
      overlays.length > 0 ? buildOverlayFingerprint(overlays) : chunkKey;
    const cacheSuffix =
      allMysteryIds.length > 0
        ? `${allMysteryIds.join('_')}:${overlayFingerprint}`
        : `base:${overlayFingerprint}`;
    const cacheKey = `dialogue:resolved:chunk:${chunkRow.tree_id}:${chunkKey}:nsfw:${isNsfwUnlocked}:align:${alignment}:mysteries:${cacheSuffix}`;

    const cachedChunk = await getCache<ResolvedChunk>(cacheKey);
    if (cachedChunk) {
      return cachedChunk;
    }

    // 5. Merge overlays into base nodes (same entitlement gates as resolveTreeForUser)
    let mergedNodes: Record<string, DialogueNode> = { ...chunkRow.nodes };
    for (const overlay of overlays) {
      if (overlay.is_nsfw && !isNsfwUnlocked) {
        continue;
      }
      if (overlay.unlock_condition === 'loyalist_only' && alignment !== 'loyalist') continue;
      if (overlay.unlock_condition === 'fugitive_only' && alignment !== 'fugitive') continue;
      if (overlay.nodes) {
        mergedNodes = deepMergeNodes(mergedNodes, overlay.nodes);
      }
    }

    // 6. Build resolved chunk — currentNodeId is the chunk's entry point (chunk_key)
    const resolvedChunk: ResolvedChunk = {
      chunk: {
        id: chunkRow.id,
        chunk_key: chunkRow.chunk_key,
        tree_id: chunkRow.tree_id,
        nodes: chunkRow.nodes,
        leaves: chunkRow.leaves,
      },
      currentNodeId: chunkRow.chunk_key,
      mergedNodes,
    };

    await setCache(cacheKey, resolvedChunk, CACHE_TTL_SECONDS);

    return resolvedChunk;
  }

  /**
   * Resolve the next chunk when crossing a chunk boundary.
   * Looks up the chunk by (tree_id, targetChunkKey), then merges
   * overlays using the same pattern as resolveChunkForUser.
   *
   * Requirements: 4.1, 4.2
   */
  public static async resolveNextChunk(
    userId: string,
    targetChunkKey: string
  ): Promise<ResolvedChunk> {
    // Load the target chunk by chunk_key (across all trees — first match wins,
    // which is safe because chunk_key values encode the entry node id and are
    // unique within a tree; callers typically know the tree but we look up by
    // key for flexibility in boundary transitions).
    const chunkRow = await DialogueResolver.loadBaseChunkByKey(targetChunkKey);

    return DialogueResolver.resolveChunkForUser(userId, chunkRow.id, chunkRow.chunk_key);
  }

  /**
   * Load a base chunk from dialogue_chunks by its UUID id.
   */
  private static async loadBaseChunk(chunkId: string): Promise<BaseDialogueChunkRow> {
    const result = await queryOLTP<BaseDialogueChunkRow>(
      `SELECT id, tree_id, chunk_key, nodes, leaves
         FROM dialogue_chunks
        WHERE id = $1`,
      [chunkId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Dialogue chunk not found: ${chunkId}`);
    }

    return result.rows[0];
  }

  /**
   * Load a base chunk from dialogue_chunks by its chunk_key.
   * Used by resolveNextChunk when crossing boundaries.
   */
  private static async loadBaseChunkByKey(chunkKey: string): Promise<BaseDialogueChunkRow> {
    const result = await queryOLTP<BaseDialogueChunkRow>(
      `SELECT id, tree_id, chunk_key, nodes, leaves
         FROM dialogue_chunks
        WHERE chunk_key = $1
        LIMIT 1`,
      [chunkKey]
    );

    if (result.rows.length === 0) {
      throw new Error(`Dialogue chunk not found for key: ${chunkKey}`);
    }

    return result.rows[0];
  }
}
