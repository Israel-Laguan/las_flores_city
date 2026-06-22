import express from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { handleStartDialogue } from './dialogue-start.js';
import { handleChoose } from './dialogue-choose.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { withOLTPTransaction, queryOLTP } from '../database/connection.js';
import { DialogueResolver } from '../services/DialogueResolver.js';
import { buildDialogueResponse, type ChunkPayload } from './dialogue-response-helpers.js';
import { filterChoices, initializeDialogueState } from './dialogue-helpers.js';

export const dialogueRouter = express.Router();

// ============================================================
// POST /dialogue/start - Start a conversation
// Body: { characterId, sceneId }
//
// Task 6.1: Returns chunk format instead of tree format.
// Loads the start chunk via resolveChunkForUser, records
// initial chunk_id in player_dialogue_states.
//
// Requirements: 1.1, 1.2, 1.3, 1.4, 8.2
// ============================================================
dialogueRouter.post('/start', authMiddleware, async (req: AuthRequest, res) => {
  return handleStartDialogue(req, res);
});

// ============================================================
// POST /dialogue/:id/choose - Make a choice
//
// Task 6.2: Accept { current_chunk_id, choice_id } instead of
// { choiceIndex }. Calls IronGateValidator.validateChoice for
// chunk boundary validation. Handles FREE and GUARDED leaves.
// Loads next chunk when crossing boundary. Appends TB receipt.
// Updates both current_chunk_id and current_node_id.
//
// Task 6.4: Error handling for invalid choices.
//
// Requirements: 3.1, 3.2, 4.1, 4.4, 5.4, 5.5, 8.3, 3.10
// ============================================================
dialogueRouter.post('/:id/choose', authMiddleware, async (req: AuthRequest, res) => {
  return handleChoose(req, res);
});

// ============================================================
// GET /dialogue/active - Get current active dialogue (for refresh recovery)
//
// Task 6.3: Return chunk format with merged overlays.
// Include current_chunk_id in response.
//
// Requirements: 8.4
// ============================================================
dialogueRouter.get('/active', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const cursor = await PlayerStateRepository.getDialogueCursor(userId);

    if (!cursor?.active_dialogue_id || !cursor?.current_node_id) {
      return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    }

    const { active_dialogue_id, current_node_id } = cursor;

    const dialogueResult = await queryOLTP(
      'SELECT id, name, description, start_node_id, metadata FROM dialogue_trees WHERE id = $1',
      [active_dialogue_id]
    );

    if (dialogueResult.rows.length === 0) {
      return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    }

    // current_chunk_id is now returned by getDialogueCursor via
    // the LEFT JOIN on player_dialogue_states — no extra query needed.
    const currentChunkId = cursor.current_chunk_id;

    // If we have a chunk ID, use chunk-based resolution (new path)
    if (currentChunkId) {
      // Load the chunk to get its chunk_key
      const chunkResult = await queryOLTP(
        `SELECT id, chunk_key FROM dialogue_chunks WHERE id = $1`,
        [currentChunkId]
      );

      if (chunkResult.rows.length > 0) {
        const { id: chunkId, chunk_key: chunkKey } = chunkResult.rows[0];

        let resolvedChunk;
        try {
          resolvedChunk = await DialogueResolver.resolveChunkForUser(userId, chunkId, chunkKey);
        } catch (err) {
          console.error('[dialogue/active] Failed to resolve chunk:', err);
          return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
        }

        const currentNode = resolvedChunk.mergedNodes[current_node_id];

        if (!currentNode) {
          return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
        }

        const availableChoices = await filterChoices(currentNode.choices || [], userId);
        const isEnd = currentNode.is_end === true || (!currentNode.choices || currentNode.choices.length === 0);

        const chunkPayload: ChunkPayload = {
          id: resolvedChunk.chunk.id,
          chunk_key: resolvedChunk.chunk.chunk_key,
          nodes: resolvedChunk.mergedNodes,
          leaves: resolvedChunk.chunk.leaves,
        };

        return res.json(
          buildDialogueResponse(
            chunkPayload,
            resolvedChunk.chunk.id,
            current_node_id,
            availableChoices,
            isEnd,
            0,
            cursor.time_blocks ?? 0
          )
        );
      }
    }

    // Fallback: no chunk tracked yet — use tree resolver for backward compatibility
    const resolved = await DialogueResolver.resolveTreeForUser(userId, active_dialogue_id);
    const currentNode = resolved.nodes[current_node_id];

    if (!currentNode) {
      return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    }

    const availableChoices = await filterChoices(currentNode.choices || [], userId);
    const isEnd = currentNode.is_end === true || (!currentNode.choices || currentNode.choices.length === 0);

    const chunkPayload: ChunkPayload = {
      id: dialogueResult.rows[0].id,
      chunk_key: current_node_id,
      nodes: resolved.nodes,
      leaves: {},
    };

    return res.json(
      buildDialogueResponse(chunkPayload, dialogueResult.rows[0].id, current_node_id, availableChoices, isEnd, 0, cursor.time_blocks ?? 0)
    );
  } catch (error: any) {
    console.error('Get active dialogue error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active dialogue',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
// POST /dialogue/end - Explicitly end a dialogue
// ============================================================
dialogueRouter.post('/end', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Clear dialogue cursor + simulation flags so an explicit /end
    // returns the player to the live world even mid-simulation.
    await withOLTPTransaction(async (client) => {
      await PlayerStateRepository.clearDialogueAndSimulation(client, userId);
    });

    res.json({
      success: true,
      data: { ended: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('End dialogue error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end dialogue',
      timestamp: new Date().toISOString(),
    });
  }
});
