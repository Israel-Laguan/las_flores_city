// ============================================================
// AOT Dialogue Chunk Compiler
//
// Splits raw dialogue trees into ≤15-node safe sub-graphs
// ("chunks") at migration time. Each chunk's boundaries are
// determined by the 8 Iron Rules (see spec §5).
//
// The pure compileTree() function is separated from the DB-write
// wrapper so it's testable without Postgres.
// ============================================================

import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import {
  ChunkSchema,
  evaluateBoundary,
  type Chunk,
  type Leaf,
} from '@las-flores/shared';
import type { DialogueNode } from '@las-flores/shared';

// ---- constants ----

const MAX_CHUNK_SIZE = 15;

// ---- types ----

export interface CompiledChunk {
  tree_id: string;
  chunk_key: string;
  nodes: Record<string, DialogueNode>;
  leaves: Record<string, Leaf>;
}

// ---- leaf id generation ----

function leafId(fromNodeId: string, choiceId: string): string {
  return `__leaf__:${fromNodeId}:${choiceId}`;
}

/**
 * Structured clone a node *shallowly* but with a fresh `choices`
 * array, so we can rewrite choice.next_node_id without mutating
 * the source tree. Choice objects themselves are copied too.
 */
function copyNodeWithRewritableChoices(node: DialogueNode): DialogueNode {
  if (!node.choices) return { ...node };
  return {
    ...node,
    choices: node.choices.map((c) => ({ ...c })),
  };
}

// ---- pure compile algorithm ----

/**
 * Compile a single dialogue tree into chunks.
 *
 * Pure function — no DB, no side effects. Takes the tree's node
 * map and the gate set (union of overlay.nodes keys) and returns
 * an array of CompiledChunk objects.
 *
 * @throws Error if startNodeId is not found in nodes.
 */
export function compileTree(
  treeId: string,
  startNodeId: string,
  nodes: Record<string, DialogueNode>,
  gateSet: Set<string>
): CompiledChunk[] {
  if (!nodes[startNodeId]) {
    throw new Error(`Start node "${startNodeId}" not found in tree ${treeId}`);
  }

  const chunks: CompiledChunk[] = [];
  const compiledKeys = new Set<string>();
  const workQueue: string[] = [startNodeId];

  while (workQueue.length > 0) {
    const entryId = workQueue.shift()!;

    if (compiledKeys.has(entryId)) continue;
    if (!nodes[entryId]) {
      console.warn(`[compiler] Skipping dangling entry node "${entryId}" in tree ${treeId}`);
      continue;
    }
    compiledKeys.add(entryId);

    // Build one chunk via BFS from entryId
    const chunkNodes: Record<string, DialogueNode> = {};
    const chunkLeaves: Record<string, Leaf> = {};
    const localQueue: string[] = [entryId];
    const localVisited = new Set<string>();

    while (localQueue.length > 0) {
      const nodeId = localQueue.shift()!;
      if (localVisited.has(nodeId)) continue;
      if (!nodes[nodeId]) {
        console.warn(`[compiler] Skipping dangling node "${nodeId}" in tree ${treeId}`);
        continue;
      }
      localVisited.add(nodeId);

      // Add a COPY of this node to the chunk so rewriting
      // choice.next_node_id never mutates the source tree.
      const nodeCopy = copyNodeWithRewritableChoices(nodes[nodeId]);
      chunkNodes[nodeId] = nodeCopy;

      const choices = nodeCopy.choices || [];
      for (const choice of choices) {
        const target = choice.next_node_id;
        const targetNode = nodes[target] ?? null;

        // Evaluate Rules 1–7 (GUARDED)
        const boundary = evaluateBoundary(choice, targetNode, gateSet, target);

        if (boundary.isCut && boundary.type === 'GUARDED') {
          // Create a GUARDED leaf
          const id = leafId(nodeId, choice.id);
          chunkLeaves[id] = {
            type: 'GUARDED',
            target_chunk: target,
            reasons: boundary.reasons,
            tb_cost: boundary.tbCost,
            effects: boundary.effects,
          };
          // Rewrite the choice in the chunk's copy (safe — it's our copy)
          choice.next_node_id = id;
          // Enqueue target into the outer work queue
          workQueue.push(target);
        } else {
          // Check Rule 8 (size limit)
          if (Object.keys(chunkNodes).length + 1 > MAX_CHUNK_SIZE) {
            // Adding this target would exceed 15 → FREE leaf
            const id = leafId(nodeId, choice.id);
            chunkLeaves[id] = {
              type: 'FREE',
              target_chunk: target,
            };
            choice.next_node_id = id;
            // Enqueue target into outer queue (it starts its own chunk)
            workQueue.push(target);
          } else if (!localVisited.has(target)) {
            // Free interior edge, room available → add to this chunk
            localQueue.push(target);
          }
          // else: target already visited in this chunk, skip (cycle guard)
        }
      }
    }

    // Validate against ChunkSchema
    const validated = ChunkSchema.parse({
      tree_id: treeId,
      chunk_key: entryId,
      nodes: chunkNodes,
      leaves: chunkLeaves,
    });

    chunks.push({
      tree_id: validated.tree_id,
      chunk_key: validated.chunk_key,
      nodes: validated.nodes,
      leaves: validated.leaves,
    });
  }

  return chunks;
}

// ---- DB write wrapper ----

/**
 * Compile a single dialogue tree and write chunks to the database.
 * Uses DELETE+INSERT per tree for stale-free idempotency.
 */
export async function compileDialogueTree(treeId: string): Promise<CompiledChunk[]> {
  const result = await queryOLTP<{
    start_node_id: string;
    nodes: Record<string, DialogueNode>;
  }>('SELECT start_node_id, nodes FROM dialogue_trees WHERE id = $1', [treeId]);

  if (result.rows.length === 0) {
    throw new Error(`Dialogue tree not found: ${treeId}`);
  }

  const { start_node_id, nodes } = result.rows[0];

  // Load gate set: union of overlay.nodes keys for this tree
  const overlayResult = await queryOLTP<{ nodes: Record<string, DialogueNode> }>(
    `SELECT nodes FROM dialogue_overlays WHERE target_tree_id = $1 AND nodes IS NOT NULL AND nodes != '{}'::jsonb`,
    [treeId]
  );

  const gateSet = new Set<string>();
  for (const row of overlayResult.rows) {
    for (const key of Object.keys(row.nodes)) {
      gateSet.add(key);
    }
  }

  // Pure compile
  const chunks = compileTree(treeId, start_node_id, nodes, gateSet);

  // DB write: delete stale + insert fresh, in one transaction
  await withOLTPTransaction(async (client) => {
    await client.query('DELETE FROM dialogue_chunks WHERE tree_id = $1', [treeId]);

    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO dialogue_chunks (tree_id, chunk_key, nodes, leaves)
         VALUES ($1, $2, $3, $4)`,
        [chunk.tree_id, chunk.chunk_key, JSON.stringify(chunk.nodes), JSON.stringify(chunk.leaves)]
      );
    }
  });

  return chunks;
}

/**
 * Compile all dialogue trees. Tolerates per-tree failure (logs
 * error, increments failed count, does not abort the run).
 */
export async function compileAllDialogueTrees(): Promise<{
  trees: number;
  chunks: number;
  failed: number;
}> {
  const result = await queryOLTP<{ id: string }>('SELECT id FROM dialogue_trees');
  const treeIds = result.rows.map((r) => r.id);

  let totalChunks = 0;
  let failed = 0;

  for (const treeId of treeIds) {
    try {
      const chunks = await compileDialogueTree(treeId);
      totalChunks += chunks.length;
    } catch (error: any) {
      console.error(`[compiler] Failed to compile tree ${treeId}: ${error.message}`);
      failed++;
    }
  }

  console.log(
    `[compiler] Compiled ${treeIds.length} trees → ${totalChunks} chunks (${failed} failed)`
  );
  return { trees: treeIds.length, chunks: totalChunks, failed };
}
