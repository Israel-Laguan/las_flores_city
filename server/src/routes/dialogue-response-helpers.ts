import type { DialogueNode, DialogueChoice, Leaf } from '@las-flores/shared';

// ============================================================
// stripGuardedTargetChunks — Payload Stripping (Requirement 9)
//
// Removes the `target_chunk` field from every GUARDED leaf in a
// leaves record before the record is included in an API response.
// FREE leaves are returned unchanged (clients need target_chunk
// for cache-key lookups in the Radar Prefetcher).
//
// This is a pure helper: it accepts a record of leaves and returns
// a new record — the input is never mutated.
//
// Requirements: 9.1, 9.2, 9.3, 9.4, 9.5; 8.5
// ============================================================

export function stripGuardedTargetChunks(
  leaves: Record<string, Leaf>,
): Record<string, Leaf> {
  const result: Record<string, Leaf> = {};
  for (const [key, leaf] of Object.entries(leaves)) {
    if (leaf.type === 'GUARDED') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { target_chunk: _stripped, ...rest } = leaf as Leaf & { target_chunk: string };
      result[key] = rest as Leaf;
    } else {
      result[key] = leaf;
    }
  }
  return result;
}

// ============================================================
// ChunkPayload — the shape of the `chunk` field in API responses
//
// This is a subset of ResolvedChunk.chunk, stripped of tree_id
// which is an internal implementation detail. The client only
// needs id, chunk_key, nodes, and leaves to render the chunk
// and resolve next-chunk transitions.
// ============================================================

export interface ChunkPayload {
  id: string;
  chunk_key: string;
  nodes: Record<string, DialogueNode>;
  leaves: Record<string, Leaf>;
}

// ============================================================
// buildDialogueResponse — POST /dialogue/start & GET /dialogue/active
//
// Accepts the resolved chunk for the current position and returns
// the new chunk-based response envelope.
//
// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
// ============================================================

export function buildDialogueResponse(
  chunk: ChunkPayload,
  currentChunkId: string,
  currentNodeId: string,
  choices: DialogueChoice[],
  isEnd: boolean,
  timeBlocksSpent: number,
  timeBlocksRemaining: number,
  dialogueId?: string
) {
  return {
    success: true,
    data: {
      chunk: {
        id: chunk.id,
        chunk_key: chunk.chunk_key,
        nodes: chunk.nodes,
        leaves: stripGuardedTargetChunks(chunk.leaves),
      },
      current_chunk_id: currentChunkId,
      current_node_id: currentNodeId,
      ...(dialogueId != null && { dialogue_id: dialogueId }),
      available_choices: choices,
      is_end: isEnd,
      time_blocks_spent: timeBlocksSpent,
      time_blocks_remaining: timeBlocksRemaining,
    },
    timestamp: new Date().toISOString(),
  };
}

// ============================================================
// buildChoiceTelemetryEventData — pure helper for OLAP telemetry
//
// Constructs the `event_data` JSON payload inserted into
// player_events for a 'dialogue_choice' event. Extracted as a
// pure function so the event_data contract can be verified by
// property-based tests without hitting the database.
//
// Requirements: 9.1, 9.3, 9.4
// ============================================================

export interface ChoiceTelemetryEventData {
  dialogue_tree_id: string;
  choice_id: string;
  chunk_id: string;
  is_chunk_boundary_crossing: boolean;
  leaf_type: 'FREE' | 'GUARDED';
}

/**
 * Build the event_data payload for a dialogue_choice OLAP event.
 *
 * @param dialogueTreeId     - UUID of the dialogue tree
 * @param choiceId           - ID of the choice made
 * @param chunkId            - UUID of the chunk where the choice occurred
 * @param isChunkBoundaryCrossing - true when the choice crosses into a new chunk
 * @param leafType           - 'FREE' or 'GUARDED' depending on the leaf type validated
 */
export function buildChoiceTelemetryEventData(
  dialogueTreeId: string,
  choiceId: string,
  chunkId: string,
  isChunkBoundaryCrossing: boolean,
  leafType: 'FREE' | 'GUARDED'
): ChoiceTelemetryEventData {
  return {
    dialogue_tree_id: dialogueTreeId,
    choice_id: choiceId,
    chunk_id: chunkId,
    is_chunk_boundary_crossing: isChunkBoundaryCrossing,
    leaf_type: leafType,
  };
}

// ============================================================
// buildChooseResponse — POST /dialogue/:id/choose
//
// Accepts the next resolved chunk after a boundary crossing and
// returns the new chunk-based choose response envelope.
//
// - receipt: TB expenditure receipt string (present when TB was spent)
// - unlockedVaultItem: vault item unlocked by this choice (if any)
// - mysterySolveStatus: mystery breakthrough result (if any)
// - alignmentChange: alignment faction locked by this choice (if any)
// - isChunkBoundaryCrossing: true when the choice crossed a chunk boundary
//
// Requirements: 6.2, 6.3, 6.4, 6.5
// ============================================================

export function buildChooseResponse(
  dialogueId: string,
  choiceId: string,
  nextChunk: ChunkPayload,
  currentChunkId: string,
  currentNodeId: string,
  choices: DialogueChoice[],
  isEnd: boolean,
  timeBlocksSpent: number,
  timeBlocksRemaining: number,
  receipt?: string | null,
  unlockedVaultItem?: { id: string; title: string } | null,
  mysterySolveStatus?: {
    mysteryId: string;
    isBreakthrough: boolean;
    kind: 'winner' | 'solver' | 'late';
  } | null,
  alignmentChange?: 'loyalist' | 'fugitive' | null,
  isChunkBoundaryCrossing: boolean = false
) {
  return {
    success: true,
    data: {
      dialogue_id: dialogueId,
      choice_id: choiceId,
      next_chunk: {
        id: nextChunk.id,
        chunk_key: nextChunk.chunk_key,
        nodes: nextChunk.nodes,
        leaves: stripGuardedTargetChunks(nextChunk.leaves),
      },
      current_chunk_id: currentChunkId,
      current_node_id: currentNodeId,
      available_choices: choices,
      is_end: isEnd,
      time_blocks_spent: timeBlocksSpent,
      time_blocks_remaining: timeBlocksRemaining,
      ...(receipt != null && { receipt }),
      ...(unlockedVaultItem != null && { unlocked_vault_item: unlockedVaultItem }),
      ...(mysterySolveStatus != null && { mystery_solve_status: mysterySolveStatus }),
      ...(alignmentChange != null && { alignment_change: alignmentChange }),
      is_chunk_boundary_crossing: isChunkBoundaryCrossing,
    },
    timestamp: new Date().toISOString(),
  };
}
