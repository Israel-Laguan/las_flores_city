// ============================================================
// DialogueResolver - Mystery Overlay Merging Service (Task 3.1)
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

import { queryOLTP } from '../database/connection.js';
import { getCache, setCache } from '../database/redis.js';
import { DialogueNode } from '@las-flores/shared';

export interface ResolvedTree {
  rootId: string;
  nodes: Record<string, DialogueNode>;
}

interface BaseDialogueTree {
  start_node_id: string;
  updated_at: string;
  nodes: Record<string, DialogueNode>;
}

const CACHE_TTL_SECONDS = 3600; // 1 hour

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
    const [investigatingIds, activeMysteryIds] = await Promise.all([
      DialogueResolver.getActiveMysteryIds(userId),
      DialogueResolver.getActiveMysteries(),
    ]);

    // Combine investigating + active mysteries for overlay loading.
    // This ensures hook choices (in overlays for ACTIVE mysteries) are
    // visible to all players, while full overlays merge for investigators.
    const allMysteryIds = [...new Set([...investigatingIds, ...activeMysteryIds])].sort();

    const baseTree = await DialogueResolver.loadBaseTree(baseTreeId);
    let resolvedNodes = baseTree.nodes;
    const cacheSuffix =
      allMysteryIds.length > 0
        ? `${allMysteryIds.join('_')}:${baseTree.updated_at}`
        : `base:${baseTree.updated_at}`;
    const cacheKey = `dialogue:resolved:${baseTreeId}:mysteries:${cacheSuffix}`;

    const cachedTree = await getCache<ResolvedTree>(cacheKey);
    if (cachedTree) {
      return cachedTree;
    }

    const overlays = await DialogueResolver.loadMysteryOverlays(
      baseTreeId,
      allMysteryIds
    );
    for (const overlay of overlays) {
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
  ): Promise<Array<{ nodes: Record<string, DialogueNode> }>> {
    const result = await queryOLTP<{
      nodes: Record<string, DialogueNode>;
    }>(
      `SELECT nodes 
       FROM dialogue_overlays 
       WHERE target_tree_id = $1 
         AND mystery_id = ANY($2::uuid[])
         AND nodes IS NOT NULL 
         AND nodes != '{}'::jsonb`,
      [baseTreeId, mysteryIds]
    );
    return result.rows;
  }
}
