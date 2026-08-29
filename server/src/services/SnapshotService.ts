/* eslint-disable max-lines */
// ============================================================
// SnapshotService - M30 Phase A: Pre-Resolved Per-State Overlay Snapshots
//
// At migration time, pre-computes the merged dialogue tree for every reachable
// (tree_id, sorted-mystery-set, nsfw, alignment) state and publishes each as a
// content-addressed MinIO blob. At runtime, the resolver's cold miss becomes a
// lookup of the snapshot pointer + a single MinIO GET + JSON.parse.
//
// This eliminates the per-miss multi-read + deepMergeNodes + Redis setCache
// amplification that causes the S4 distinct-key herd tail (p99 ~0.55-0.63 s at
// 500 concurrent after a Breakthrough invalidation).
// ============================================================

import { createHash } from 'node:crypto';
import { queryOLTP, queryContent } from '@las-flores/infra';
import type { DialogueNode } from '@las-flores/shared';
import { publishDialogueSnapshot } from './ContentPublishService.js';
import { deepMergeNodes } from './dialogueResolverUtils.js';
import { fetchNodesFromContentUrl } from './contentFetch.js';

// Re-export for use by DialogueResolver (shared pure helper)
export { deepMergeNodes };

// ---- types ----

/**
 * A snapshot state uniquely identifies a pre-resolved tree variant.
 * The set_hash is a stable digest of the sorted mystery ID set.
 */
export interface SnapshotState {
  treeId: string;
  setHash: string;
  nsfw: boolean;
  alignment: 'neutral' | 'loyalist' | 'fugitive';
}

/**
 * Result of building snapshots for a single tree.
 */
export interface SnapshotBuildResult {
  treeId: string;
  statesGenerated: SnapshotState[];
  chunksCreated: number;
  errors: string[];
}

// ---- constants ----

const ALIGNMENTS: ReadonlyArray<'neutral' | 'loyalist' | 'fugitive'> = [
  'neutral',
  'loyalist',
  'fugitive',
] as const;

const NSFW_VALUES: ReadonlyArray<boolean> = [false, true] as const;

/**
 * Prefix for synthetic chunk_keys that mark a row as a pre-resolved snapshot.
 * Format: `__snapshot__{setHash}_{nsfw}_{alignment}`
 */
const SNAPSHOT_CHUNK_PREFIX = '__snapshot_';
const MAX_SNAPSHOT_STATES_PER_TREE = 1024;

// ---- pure helpers ----

/**
 * Build a stable hash of a sorted array of mystery IDs.
 * Uses SHA-256 truncated to 16 hex chars (same as buildOverlayFingerprint's
 * output length) for consistency with existing fingerprint patterns.
 */
export function buildSetHash(mysteryIds: string[]): string {
  const sorted = [...mysteryIds].sort();
  const key = sorted.join('|');
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Build the synthetic chunk_key for a snapshot state.
 * Encodes: __snapshot__{setHash}_{nsfw}_{alignment}
 * This is deterministic and content-addressed: same inputs → same key.
 */
export function buildSnapshotChunkKey(state: SnapshotState): string {
  const nsfwFlag = state.nsfw ? 't' : 'f';
  return `${SNAPSHOT_CHUNK_PREFIX}${state.setHash}_${nsfwFlag}_${state.alignment}`;
}

/**
 * Parse a synthetic chunk_key back into its SnapshotState components.
 * Returns null if the key is not a snapshot key.
 */
export function parseSnapshotChunkKey(
  treeId: string,
  chunkKey: string
): SnapshotState | null {
  if (!chunkKey.startsWith(SNAPSHOT_CHUNK_PREFIX)) {
    return null;
  }

  // chunkKey = __snapshot_{setHash}_{nsfw}_{alignment}
  const rest = chunkKey.slice(SNAPSHOT_CHUNK_PREFIX.length);
  const parts = rest.split('_');

  // Need exactly 3 parts after prefix: setHash, nsfw flag, alignment
  if (parts.length !== 3) {
    return null;
  }

  const [setHash, nsfwFlag, alignment] = parts;

  // Validate alignment
  if (!ALIGNMENTS.includes(alignment as typeof ALIGNMENTS[number])) {
    return null;
  }

  if (nsfwFlag !== 't' && nsfwFlag !== 'f') {
    return null;
  }

  const nsfw = nsfwFlag === 't';

  return {
    treeId,
    setHash,
    nsfw,
    alignment: alignment as 'neutral' | 'loyalist' | 'fugitive',
  };
}

// ---- overlay loading (mirrors DialogueResolver private helpers) ----

interface BaseDialogueTreeRow {
  id: string;
  start_node_id: string;
  nodes: Record<string, DialogueNode>;
  updated_at: Date;
  content_url: string | null;
}

interface OverlayRow {
  id: string;
  target_tree_id: string;
  mystery_id: string;
  nodes: Record<string, DialogueNode>;
  updated_at: Date;
  is_nsfw: boolean;
  unlock_condition: 'none' | 'patreon_nsfw' | 'loyalist_only' | 'fugitive_only' | null;
}

/**
 * Load the base dialogue tree for a given tree ID.
 * Mirrors DialogueResolver.loadBaseTree but returns the raw row.
 */
async function loadBaseTreeRow(treeId: string): Promise<BaseDialogueTreeRow | null> {
  const result = await queryContent<BaseDialogueTreeRow & { content_url: string | null }>(
    `SELECT id, start_node_id, updated_at, content_url FROM dialogue_trees WHERE id = $1`,
    [treeId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (!row.content_url) {
    throw new Error(`Dialogue tree ${treeId} has no content_url (M23 externalization required before nodes column drop)`);
  }
  const nodes = await fetchNodesFromContentUrl(row.content_url, {});
  if (!nodes || Object.keys(nodes).length === 0) {
    throw new Error(`Dialogue tree ${treeId} content_url ${row.content_url} resolved to empty nodes`);
  }
  return { ...row, nodes };
}

/**
 * Load all overlays for a given tree.
 * Returns overlays grouped by mystery_id — preserving ALL rows per mystery
 * (a tree may have multiple overlays for one mystery, e.g. different
 * unlock_condition gating). This mirrors DialogueResolver's pattern of
 * returning an array and flattening before the deterministic merge.
 */
async function loadAllOverlaysForTree(treeId: string): Promise<Map<string, OverlayRow[]>> {
  const result = await queryContent<OverlayRow>(
    `SELECT id, target_tree_id, mystery_id, nodes, updated_at, is_nsfw, unlock_condition
     FROM dialogue_overlays
     WHERE target_tree_id = $1
       AND nodes IS NOT NULL
       AND nodes != '{}'::jsonb
     ORDER BY mystery_id, id`,
    [treeId]
  );

  const byMystery = new Map<string, OverlayRow[]>();
  for (const row of result.rows) {
    const existing = byMystery.get(row.mystery_id) ?? [];
    existing.push(row);
    byMystery.set(row.mystery_id, existing);
  }
  return byMystery;
}

/**
 * Get all ACTIVE mystery IDs (global state).
 * Mirrors DialogueResolver.getActiveMysteries.
 */
async function getActiveMysteryIds(): Promise<string[]> {
  const result = await queryContent<{ id: string }>(
    `SELECT id FROM mysteries WHERE status = 'ACTIVE'`
  );
  return result.rows.map((row) => row.id).sort();
}

/**
 * Generate all reachable mystery sets.
 * A reachable set is any combination of ACTIVE mysteries (global) plus
 * any subset of investigating mysteries. However, for snapshot pre-computation,
 * we consider ALL mystery sets that can be formed from:
 * - The global ACTIVE set (always included for hook visibility)
 * - Plus any mystery that has overlays for this tree
 *
 * For practicality, we limit to:
 * - The empty investigating set (base tree only)
 * - Each single mystery as investigating (most common case)
 * - The full set of ACTIVE mysteries
 * - All pairwise combinations of ACTIVE mysteries
 *
 * But the plan says: "Only sets that actually occur need artifacts; the resolver
 * falls back to the live path for any state without a snapshot." So we generate
 * snapshots only for combinations involving mysteries that have overlays on
 * this specific tree.
 */
async function generateReachableSets(
  treeId: string,
  activeMysteryIds: string[]
): Promise<string[][]> {
  // Get all mysteries that have overlays for this tree
  const overlayResult = await queryContent<{ mystery_id: string }>(
    `SELECT DISTINCT mystery_id FROM dialogue_overlays WHERE target_tree_id = $1`,
    [treeId]
  );
    const treeMysteryIds = overlayResult.rows
    .map((row) => row.mystery_id)
    .filter((id): id is string => Boolean(id))
    .sort();

  // Reachable sets = all subsets of (activeMysteryIds + treeMysteryIds)
  // But we must include at minimum the active mysteries (for hook visibility)
  // and can add any investigating mysteries
  //
  // For bounded combinatorics: with 3 ACTIVE mysteries, subsets = 2^3 = 8
  // × 2 nsfw × 3 alignment = 48 variants per tree — well within reason.
  //
  // We generate all subsets of the combined set of mysteries that have overlays
  // on this tree OR are ACTIVE (since ACTIVE overlays are always merged).
    const relevantMysteryIds = [...new Set([...activeMysteryIds, ...treeMysteryIds])].sort();

  if (relevantMysteryIds.length === 0) {
    // No overlays at all for this tree → only the base tree (empty set)
    return [[]];
  }

  // Cap the subset space to avoid 2^n explosion. A 32-bit shift breaks
  // enumeration at n >= 31, and even n=20 yields over 1M subsets
  // (× 6 variants = 6M snapshots per tree). Cap at a safe limit and leave
  // excess states on the live resolver path — the resolver falls back to
  // on-demand merge for any state without a pre-resolved snapshot.
  const MAX_RELEVANT_MYSTERIES = 12;
  const MAX_SUBSETS = 4096;

  if (relevantMysteryIds.length > MAX_RELEVANT_MYSTERIES) {
    console.warn(
      `[SnapshotService] Tree ${treeId} has ${relevantMysteryIds.length} relevant mysteries — ` +
      `capping to ${MAX_RELEVANT_MYSTERIES} for snapshot pre-computation. ` +
      `Excess states will be resolved live at runtime.`
    );
    relevantMysteryIds.splice(MAX_RELEVANT_MYSTERIES);
  }

  // Generate all subsets of relevantMysteryIds
  const allSubsets: string[][] = [];
  const n = relevantMysteryIds.length;
  const subsetLimit = Math.min(1 << n, MAX_SUBSETS);

  for (let mask = 0; mask < subsetLimit; mask++) {
    const subset: string[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        subset.push(relevantMysteryIds[i]);
      }
    }
    allSubsets.push(subset.sort());
  }

  return allSubsets;
}

// ---- snapshot building ----

/**
 * Apply the same gate logic as DialogueResolver._resolveTreeForUserInner.
 * Returns the merged nodes for a given base tree and set of overlays,
 * with NSFW and alignment gates applied.
 */
function applyGateAndMerge(
  baseNodes: Record<string, DialogueNode>,
  overlays: OverlayRow[],
  isNsfw: boolean,
  alignment: 'neutral' | 'loyalist' | 'fugitive'
): Record<string, DialogueNode> {
  let mergedNodes = { ...baseNodes };

  // Sort overlays by mystery_id for deterministic merging order
  const sortedOverlays = [...overlays].sort((a, b) =>
    a.mystery_id.localeCompare(b.mystery_id)
  );

  for (const overlay of sortedOverlays) {
    // NSFW gate
    if (overlay.is_nsfw && !isNsfw) {
      continue;
    }

    // Alignment gate
    if (overlay.unlock_condition === 'loyalist_only' && alignment !== 'loyalist') {
      continue;
    }
    if (overlay.unlock_condition === 'fugitive_only' && alignment !== 'fugitive') {
      continue;
    }

    if (overlay.nodes) {
      mergedNodes = deepMergeNodes(mergedNodes, overlay.nodes);
    }
  }

  return mergedNodes;
}

/**
 * Build a single snapshot for a specific state.
 * Loads the relevant overlays, applies gates, merges, and publishes.
 */
async function buildSingleSnapshot(
  treeId: string,
  baseTree: BaseDialogueTreeRow,
  allOverlays: Map<string, OverlayRow[]>,
  mysterySet: string[],
  nsfw: boolean,
  alignment: 'neutral' | 'loyalist' | 'fugitive'
): Promise<{ contentUrl: string | null; setHash: string; mergedNodes: Record<string, DialogueNode> } | null> {
  // Collect overlays that match the mystery set
  const setMysteryIds = new Set(mysterySet);
  const relevantOverlays: OverlayRow[] = [];

  for (const [mysteryId, overlays] of allOverlays) {
    if (setMysteryIds.has(mysteryId)) {
      relevantOverlays.push(...overlays.slice().sort((a, b) =>
        String(a.id).localeCompare(String(b.id)),
      ));
    }
  }

  // Apply gates and merge
  const mergedNodes = applyGateAndMerge(
    baseTree.nodes,
    relevantOverlays,
    nsfw,
    alignment
  );

  // Build snapshot payload
  const snapshotPayload = {
    nodes: mergedNodes,
    // Include tree metadata for versioning
    _meta: {
      treeId: baseTree.id,
      startNodeId: baseTree.start_node_id,
      setHash: buildSetHash(mysterySet),
      nsfw,
      alignment,
    },
  };

  const payloadString = JSON.stringify(snapshotPayload);

  // Publish to MinIO
  const setHash = buildSetHash(mysterySet);

  try {
    const contentUrl = await publishDialogueSnapshot(
      treeId,
      setHash,
      nsfw,
      alignment,
      payloadString
    );

    return {
      contentUrl,
      setHash,
      mergedNodes,
    };
  } catch (error: any) {
    console.warn(
      `[SnapshotService] Failed to publish snapshot for tree ${treeId}, set ${setHash}, nsfw=${nsfw}, alignment=${alignment}: ${error?.message}`
    );
    return null;
  }
}

/**
 * Upsert a snapshot row into dialogue_chunks.
 * Reuses the dialogue_chunks table (4.1a) with synthetic chunk_key.
 */
async function upsertSnapshotChunk(
  treeId: string,
  setHash: string,
  nsfw: boolean,
  alignment: 'neutral' | 'loyalist' | 'fugitive',
  mergedNodes: Record<string, DialogueNode>,
  contentUrl: string | null
): Promise<void> {
  const chunkKey = buildSnapshotChunkKey({ treeId, setHash, nsfw, alignment });

  // Generate a deterministic synthetic ID for the chunk row
  // Use hash of the chunk_key + tree_id to ensure uniqueness
  const idHash = createHash('sha256')
    .update(`${treeId}|${chunkKey}`)
    .digest('hex')
    .slice(0, 32);

  await queryOLTP(
    `INSERT INTO dialogue_chunks (id, tree_id, chunk_key, content_url, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (tree_id, chunk_key) DO UPDATE
       SET content_url = EXCLUDED.content_url,
           created_at = NOW()`,
    [idHash, treeId, chunkKey, contentUrl]
  );
}

/**
 * Delete stale snapshot chunks for a tree.
 * Called before rebuilding to ensure consistency.
 */
async function deleteStaleSnapshots(treeId: string): Promise<number> {
  const result = await queryOLTP<{ count: number }>(
    `DELETE FROM dialogue_chunks 
     WHERE tree_id = $1
       AND chunk_key LIKE '\\_\\_snapshot\\_%'
     RETURNING 1`,
    [treeId]
  );
  return result.rowCount ?? 0;
}

// ---- main entry point ----

/**
 * Build pre-resolved snapshots for a single dialogue tree.
 *
 * For each reachable (mystery-set, nsfw, alignment) combination:
 * 1. Load base tree + relevant overlays
 * 2. Apply NSFW and alignment gates (same logic as DialogueResolver)
 * 3. Deep-merge nodes
 * 4. Publish content-addressed MinIO snapshot
 * 5. Persist pointer in dialogue_chunks with synthetic chunk_key
 *
 * Runs under the content_migration advisory lock (caller's responsibility).
 * Versioned on the same checksum the base tree uses — only re-runs when
 * inputs change (migration handles this via checksum comparison).
 */
export async function buildSnapshotsForTree(treeId: string): Promise<SnapshotBuildResult> {
  const result: SnapshotBuildResult = {
    treeId,
    statesGenerated: [],
    chunksCreated: 0,
    errors: [],
  };

  // Load base tree
  const baseTree = await loadBaseTreeRow(treeId);
  if (!baseTree) {
    result.errors.push(`Base tree not found: ${treeId}`);
    return result;
  }

  // Load all overlays for this tree
  const allOverlays = await loadAllOverlaysForTree(treeId);

  // Get ACTIVE mysteries (global)
  const activeMysteryIds = await getActiveMysteryIds();

  // Generate all reachable mystery sets
  const reachableSets = await generateReachableSets(treeId, activeMysteryIds);

  if (reachableSets.length === 0) {
    // No overlays → only the base tree with empty set
    reachableSets.push([]);
  }

  // Delete stale snapshots for this tree
  const deletedCount = await deleteStaleSnapshots(treeId);
  if (deletedCount > 0) {
    console.log(
      `[SnapshotService] Deleted ${deletedCount} stale snapshot chunks for tree ${treeId}`
    );
  }

  // Build snapshots for each combination
  buildLoop:
  for (const mysterySet of reachableSets) {
    for (const nsfw of NSFW_VALUES) {
      for (const alignment of ALIGNMENTS) {
        if (result.statesGenerated.length >= MAX_SNAPSHOT_STATES_PER_TREE) {
          result.errors.push(`Snapshot state cap (${MAX_SNAPSHOT_STATES_PER_TREE}) reached for tree ${treeId}; remaining states deferred to live resolver`);
          break buildLoop;
        }
        const setHash = buildSetHash(mysterySet);

        const buildResult = await buildSingleSnapshot(
          treeId,
          baseTree,
          allOverlays,
          mysterySet,
          nsfw,
          alignment
        );

        if (buildResult === null) {
          result.errors.push(
            `Failed to build snapshot for tree ${treeId}, set ${setHash}, nsfw=${nsfw}, alignment=${alignment}`
          );
          continue;
        }

        // Upsert the snapshot row
        try {
          await upsertSnapshotChunk(
            treeId,
            buildResult.setHash,
            nsfw,
            alignment,
            buildResult.mergedNodes,
            buildResult.contentUrl
          );
          result.chunksCreated++;
          result.statesGenerated.push({
            treeId,
            setHash: buildResult.setHash,
            nsfw,
            alignment,
          });
        } catch (error: any) {
          result.errors.push(
            `Failed to upsert snapshot chunk for tree ${treeId}, set ${buildResult.setHash}, nsfw=${nsfw}, alignment=${alignment}: ${error?.message}`
          );
        }
      }
    }
  }

  console.log(
    `[SnapshotService] Built ${result.chunksCreated} snapshots for tree ${treeId} (${result.statesGenerated.length} states)`
  );

  return result;
}

/**
 * Build snapshots for all dialogue trees.
 * Called from migrate.ts after the per-entity content migration.
 */
export async function buildSnapshotsForAllTrees(): Promise<{
  totalTrees: number;
  totalSnapshots: number;
  errors: string[];
}> {
  const result = {
    totalTrees: 0,
    totalSnapshots: 0,
    errors: [] as string[],
  };

  // Get all dialogue tree IDs
  const treeResult = await queryContent<{ id: string }>('SELECT id FROM dialogue_trees');
  const treeIds = treeResult.rows.map((row) => row.id);

  result.totalTrees = treeIds.length;

  for (const treeId of treeIds) {
    try {
      const buildResult = await buildSnapshotsForTree(treeId);
      result.totalSnapshots += buildResult.chunksCreated;
      result.errors.push(...buildResult.errors);
    } catch (error: any) {
      result.errors.push(`Failed to build snapshots for tree ${treeId}: ${error?.message}`);
    }
  }

  console.log(
    `[SnapshotService] Built ${result.totalSnapshots} snapshots across ${result.totalTrees} trees`
  );

  return result;
}

/**
 * Lookup a snapshot's content_url by state.
 * Returns the content_url if a snapshot exists, null otherwise.
 * Used by DialogueResolver for the fast path.
 */
export async function getSnapshotContentUrl(
  treeId: string,
  setHash: string,
  nsfw: boolean,
  alignment: 'neutral' | 'loyalist' | 'fugitive'
): Promise<string | null> {
  const chunkKey = buildSnapshotChunkKey({ treeId, setHash, nsfw, alignment });

  const result = await queryContent<{ content_url: string | null }>(
    `SELECT content_url FROM dialogue_chunks WHERE tree_id = $1 AND chunk_key = $2`,
    [treeId, chunkKey]
  );

  return result.rows.length > 0 ? result.rows[0].content_url : null;
}

/**
 * Lookup snapshot by parsing a chunk_key.
 * Returns the content_url if the chunk_key is a snapshot key and exists.
 */
export async function getSnapshotContentUrlByChunkKey(
  treeId: string,
  chunkKey: string
): Promise<string | null> {
  const state = parseSnapshotChunkKey(treeId, chunkKey);
  if (!state) {
    return null;
  }

  return getSnapshotContentUrl(treeId, state.setHash, state.nsfw, state.alignment);
}
