import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import {
  resolveDialogueTree,
  filterChoices,
  initializeDialogueState,
} from './dialogue-helpers.js';
import { buildDialogueResponse, type ChunkPayload } from './dialogue-response-helpers.js';
import { DialogueResolver } from '../services/DialogueResolver.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';

export async function handleStartDialogue(req: any, res: any): Promise<any> {
  try {
    const userId = req.userId!;
    const { characterId, sceneId } = req.body;

    if (!characterId || !sceneId) {
      return res.status(400).json({
        success: false,
        error: 'characterId and sceneId are required',
        timestamp: new Date().toISOString(),
      });
    }

    const dialogue = await resolveDialogueTree(characterId, sceneId, userId);

    if (!dialogue) {
      return res.status(404).json({
        success: false,
        error: 'No dialogue available for this character at this location',
        timestamp: new Date().toISOString(),
      });
    }

    const startChunkResult = await queryOLTP(
      `SELECT id, chunk_key FROM dialogue_chunks
       WHERE tree_id = $1 AND chunk_key = $2
       LIMIT 1`,
      [dialogue.id, dialogue.start_node_id]
    );

    if (startChunkResult.rows.length === 0) {
      return handleStartFallback(userId, dialogue, res);
    }

    const { id: startChunkId, chunk_key: startChunkKey } = startChunkResult.rows[0];
    return handleStartChunk(userId, dialogue, startChunkId, startChunkKey, res);
  } catch (error: any) {
    console.error('Start dialogue error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start dialogue',
      timestamp: new Date().toISOString(),
    });
  }
}

async function handleStartFallback(userId: string, dialogue: any, res: any) {
  console.warn(`[dialogue/start] No chunk found for tree ${dialogue.id}, falling back to tree resolver`);

  const resolved = await DialogueResolver.resolveTreeForUser(userId, dialogue.id);
  const rootNodeId = resolved.rootId;
  const rootNode = resolved.nodes[rootNodeId];

  if (!rootNode) {
    return res.status(500).json({
      success: false,
      error: 'Dialogue tree has invalid root node',
      timestamp: new Date().toISOString(),
    });
  }

  await withOLTPTransaction(async (client) => {
    await initializeDialogueState(client, userId, dialogue.id, rootNodeId);
  });

  const availableChoices = await filterChoices(rootNode.choices || [], userId);
  const isEnd = rootNode.is_end === true || (!rootNode.choices || rootNode.choices.length === 0);

  const chunkPayload: ChunkPayload = {
    id: dialogue.id,
    chunk_key: rootNodeId,
    nodes: resolved.nodes,
    leaves: {},
  };

  return res.status(201).json(buildDialogueResponse(chunkPayload, dialogue.id, rootNodeId, availableChoices, isEnd, 0, 0));
}

async function handleStartChunk(userId: string, dialogue: any, startChunkId: string, startChunkKey: string, res: any) {
  let resolvedChunk;
  try {
    resolvedChunk = await DialogueResolver.resolveChunkForUser(userId, startChunkId, startChunkKey);
  } catch (err: any) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'chunk_not_found',
        timestamp: new Date().toISOString(),
      });
    }
    throw err;
  }

  const rootNodeId = resolvedChunk.currentNodeId;
  const rootNode = resolvedChunk.mergedNodes[rootNodeId];

  if (!rootNode) {
    return res.status(500).json({
      success: false,
      error: 'Dialogue chunk has invalid root node',
      timestamp: new Date().toISOString(),
    });
  }

  await withOLTPTransaction(async (client) => {
    await PlayerStateRepository.setDialogueCursor(client, userId, rootNodeId, dialogue.id);
    await PlayerStateRepository.initDialogueChunkState(client, userId, dialogue.id, rootNodeId, startChunkId);
  });

  const availableChoices = await filterChoices(rootNode.choices || [], userId);
  const isEnd = rootNode.is_end === true || (!rootNode.choices || rootNode.choices.length === 0);
  const tbCursor = await PlayerStateRepository.getDialogueCursor(userId);

  const chunkPayload: ChunkPayload = {
    id: resolvedChunk.chunk.id,
    chunk_key: resolvedChunk.chunk.chunk_key,
    nodes: resolvedChunk.mergedNodes,
    leaves: resolvedChunk.chunk.leaves,
  };

  return res.status(201).json(
    buildDialogueResponse(
      chunkPayload,
      resolvedChunk.chunk.id,
      rootNodeId,
      availableChoices,
      isEnd,
      0,
      tbCursor?.time_blocks ?? 0,
      dialogue.id
    )
  );
}
