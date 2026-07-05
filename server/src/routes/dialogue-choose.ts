import { queryOLTP, queryOLAP, withOLTPTransaction } from '../database/connection.js';
import {
  filterChoices,
  processChoice,
} from './dialogue-helpers.js';
import { buildChooseResponse, buildChoiceTelemetryEventData, type ChunkPayload } from './dialogue-response-helpers.js';
import { DialogueResolver } from '../services/DialogueResolver.js';
import { IronGateValidator } from '../services/IronGateValidator.js';
import { appendTBReceipt } from '../services/ReceiptRenderer.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { deleteCache } from '../database/redis.js';
import { handleAlignmentSideEffects, handleBreakthroughSideEffects, handleJoinMystery } from './dialogue-side-effects.js';
import { handleLegacyChoiceIndex } from './dialogue-legacy.js';

// ── main handler ────────────────────────────────────────────
export async function handleChoose(req: any, res: any): Promise<any> {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { current_chunk_id, choice_id, choiceIndex } = req.body;

    if (choiceIndex !== undefined && !current_chunk_id && !choice_id) {
      return handleLegacyChoiceIndex(req, res, id, userId, choiceIndex);
    }

    if (!current_chunk_id || !choice_id) {
      return res.status(400).json({
        success: false,
        error: 'current_chunk_id and choice_id are required',
        timestamp: new Date().toISOString(),
      });
    }

    const chunkResult = await queryOLTP(
      `SELECT id, tree_id, chunk_key, nodes, leaves FROM dialogue_chunks WHERE id = $1`,
      [current_chunk_id]
    );

    if (chunkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'chunk_not_found',
        timestamp: new Date().toISOString(),
      });
    }

    const currentChunk = chunkResult.rows[0];
    const leaves = currentChunk.leaves as Record<string, any>;
    const chunkNodes = currentChunk.nodes as Record<string, any>;
    const leaf = leaves[choice_id] ?? findLeafByChoiceId(leaves, choice_id);

    if (!leaf) {
      return handleIntraChunkChoice(id, userId, current_chunk_id, choice_id, currentChunk, chunkNodes, leaves, res);
    }

    return handleChunkBoundaryChoice(id, userId, current_chunk_id, choice_id, currentChunk, leaf, res);
  } catch (error: any) {
    console.error('Dialogue choose error:', error);
    res.status(500).json({ success: false, error: 'Failed to process choice', timestamp: new Date().toISOString() });
  }
}

// ── intra-chunk navigation ─────────────────────────────────
async function handleIntraChunkChoice(
  dialogueId: string,
  userId: string,
  currentChunkId: string,
  choiceId: string,
  currentChunk: any,
  chunkNodes: Record<string, any>,
  leaves: Record<string, any>,
  res: any
) {
  const matched = findChoiceInNodes(chunkNodes, choiceId);
  if (!matched) {
    return res.status(400).json({
      success: false,
      error: 'invalid_choice',
      timestamp: new Date().toISOString(),
    });
  }

  const { choice: matchedChoice, fromNodeId: matchedFromNodeId } = matched;
  const cursor = await PlayerStateRepository.getDialogueCursor(userId);
  const currentNodeId = cursor?.current_node_id ?? matchedFromNodeId;

  let choiceResult: Awaited<ReturnType<typeof processChoice>>;
  await withOLTPTransaction(async (client) => {
    choiceResult = await processChoice(client, userId, dialogueId, 0, matchedChoice, currentNodeId, chunkNodes);
  });
  choiceResult = choiceResult!;

  if (!choiceResult.success) {
    return sendChoiceError(res, choiceResult.error);
  }

  const nextNodeId = matchedChoice.next_node_id;
  const nextNode = chunkNodes[nextNodeId] ?? null;
  const isEnd = !nextNode || (nextNode as any).is_end === true || (!(nextNode as any).choices || (nextNode as any).choices.length === 0);
  const nextChoices = isEnd ? [] : await filterChoices((nextNode as any)?.choices || [], userId);
  const tbCursor = await PlayerStateRepository.getDialogueCursor(userId);

  emitIntraChunkTelemetry(userId, dialogueId, choiceId, currentChunkId, choiceResult);
  emitIntraChunkSideEffects(userId, dialogueId, choiceId, choiceResult);

  const intraChunkPayload: ChunkPayload = {
    id: currentChunk.id,
    chunk_key: currentChunk.chunk_key,
    nodes: chunkNodes,
    leaves,
  };

  return res.json(
    buildChooseResponse(
      dialogueId, choiceId, intraChunkPayload, currentChunkId, nextNodeId,
      nextChoices, isEnd, choiceResult.timeBlocksSpent ?? 0,
      tbCursor?.time_blocks ?? 0, null,
      choiceResult.unlockedVaultItem ?? null,
      choiceResult.mysterySolveStatus ?? null,
      choiceResult.alignmentChange ?? null, false
    )
  );
}

function findChoiceInNodes(chunkNodes: Record<string, any>, choiceId: string) {
  for (const [nodeId, node] of Object.entries(chunkNodes)) {
    if (node && Array.isArray((node as any).choices)) {
      const found = (node as any).choices.find((c: any) => c.id === choiceId);
      if (found) {
        return { choice: found, fromNodeId: nodeId };
      }
    }
  }
  return null;
}

export function findLeafByChoiceId(leaves: Record<string, any>, choiceId: string): any | undefined {
  const suffix = `:${choiceId}`;
  for (const [key, leaf] of Object.entries(leaves)) {
    if (key.endsWith(suffix)) return leaf;
  }
  return undefined;
}

function sendChoiceError(res: any, error: string | undefined) {
  const errorStatusMap: Record<string, number> = {
    insufficient_time_blocks: 403,
    invalid_vault_item: 400,
  };
  return res.status(errorStatusMap[error ?? ''] ?? 400).json({
    success: false,
    error,
    timestamp: new Date().toISOString(),
  });
}

function emitIntraChunkTelemetry(
  userId: string, dialogueId: string, choiceId: string,
  currentChunkId: string, choiceResult: Awaited<ReturnType<typeof processChoice>>
) {
  if (choiceResult.timeBlocksSpent && choiceResult.timeBlocksSpent > 0) {
    queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
       VALUES (gen_random_uuid(), $1, 'dialogue_choice', $2, $3)`,
      [
        userId,
        JSON.stringify({
          dialogue_tree_id: dialogueId,
          choice_id: choiceId,
          chunk_id: currentChunkId,
          is_chunk_boundary_crossing: false,
          leaf_type: 'FREE',
        }),
        choiceResult.timeBlocksSpent,
      ]
    ).catch((err) => console.error('Dialogue choice telemetry error:', err));
  }

  if (choiceResult.unlockedVaultItem) {
    deleteCache(`user:vault:${userId}`);
    queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data)
       VALUES (gen_random_uuid(), $1, 'vault_item_unlocked', $2)`,
      [userId, JSON.stringify({ itemId: choiceResult.unlockedVaultItem.id })]
    ).catch((err) => console.error('Vault unlock telemetry error:', err));
  }
}

async function emitIntraChunkSideEffects(
  userId: string, dialogueId: string, choiceId: string,
  choiceResult: Awaited<ReturnType<typeof processChoice>>
) {
  if (choiceResult.alignmentChange) {
    await handleAlignmentSideEffects(userId, choiceResult.alignmentChange, choiceId, dialogueId);
  }
  if (choiceResult.breakthrough && choiceResult.breakthrough.kind !== 'unrelated') {
    await handleBreakthroughSideEffects(userId, choiceResult.breakthrough);
  }
}

// ── chunk-boundary crossing ────────────────────────────────
async function handleChunkBoundaryChoice(
  dialogueId: string,
  userId: string,
  currentChunkId: string,
  choiceId: string,
  currentChunk: any,
  leaf: any,
  res: any
) {
  const validationResult = await IronGateValidator.validateChoice(userId, currentChunkId, choiceId, leaf);

  if (!validationResult.success) {
    return sendValidationError(res, validationResult.error);
  }

  const tbDeducted = validationResult.tbDeducted ?? 0;
  const targetChunkKey = leaf.target_chunk as string;

  let resolvedNextChunk;
  try {
    resolvedNextChunk = await DialogueResolver.resolveNextChunk(userId, targetChunkKey);
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

  const nextChunkId = resolvedNextChunk.chunk.id;
  const nextNodeId = resolvedNextChunk.currentNodeId;
  const isChunkBoundaryCrossing = nextChunkId !== currentChunkId;

  const { mergedNodes: finalNodes, receiptString } = applyTBReceipt(
    resolvedNextChunk.mergedNodes, nextNodeId, tbDeducted
  );

  const nextNode = finalNodes[nextNodeId];

  await persistChunkBoundaryState(userId, dialogueId, nextNodeId, nextChunkId, choiceId, currentChunkId);

  await handleChunkBoundarySideEffects(
    userId, choiceId, dialogueId,
    validationResult.alignmentChange,
    validationResult.breakthroughStatus,
    currentChunk.nodes as Record<string, any>
  );

  const isEnd = !nextNode || nextNode.is_end === true || (!nextNode?.choices || nextNode.choices.length === 0);
  const nextChoices = isEnd ? [] : await filterChoices(nextNode?.choices || [], userId);
  const tbCursor = await PlayerStateRepository.getDialogueCursor(userId);

  const mysterySolveStatus = buildMysterySolveStatus(validationResult.breakthroughStatus);

  await recordPostChoiceTelemetry(
    userId, dialogueId, choiceId, currentChunkId,
    isChunkBoundaryCrossing, leaf.type as 'FREE' | 'GUARDED',
    tbDeducted
  );

  const nextChunkPayload: ChunkPayload = {
    id: resolvedNextChunk.chunk.id,
    chunk_key: resolvedNextChunk.chunk.chunk_key,
    nodes: finalNodes,
    leaves: resolvedNextChunk.chunk.leaves,
  };

  return res.json(
    buildChooseResponse(
      dialogueId, choiceId, nextChunkPayload, nextChunkId, nextNodeId,
      nextChoices, isEnd, tbDeducted,
      tbCursor?.time_blocks ?? 0, receiptString, null,
      mysterySolveStatus, validationResult.alignmentChange ?? null,
      isChunkBoundaryCrossing
    )
  );
}

function sendValidationError(res: any, error: string | undefined) {
  if (error === 'insufficient_time_blocks') {
    return res.status(403).json({ success: false, error: 'insufficient_time_blocks', timestamp: new Date().toISOString() });
  }
  if (error === 'mystery_not_eligible') {
    return res.status(400).json({ success: false, error: 'mystery_not_eligible', timestamp: new Date().toISOString() });
  }
  if (error === 'invalid_vault_item') {
    return res.status(400).json({ success: false, error: 'invalid_vault_item', timestamp: new Date().toISOString() });
  }
  return res.status(400).json({ success: false, error: error ?? 'validation_failed', timestamp: new Date().toISOString() });
}

function applyTBReceipt(mergedNodes: Record<string, any>, nextNodeId: string, tbDeducted: number) {
  let finalNodes = { ...mergedNodes };
  let receiptString: string | null = null;
  if (tbDeducted > 0 && finalNodes[nextNodeId]) {
    const annotatedNode = appendTBReceipt(finalNodes[nextNodeId], tbDeducted);
    finalNodes = { ...finalNodes, [nextNodeId]: annotatedNode };
    const receiptMatch = (annotatedNode.thought ?? '').match(/\[TB EXPENDED: \d+ — [^\]]+\]/);
    receiptString = receiptMatch ? receiptMatch[0] : null;
  }
  return { mergedNodes: finalNodes, receiptString };
}

async function persistChunkBoundaryState(
  userId: string, dialogueId: string, nextNodeId: string,
  nextChunkId: string, choiceId: string, currentChunkId: string
) {
  await withOLTPTransaction(async (client) => {
    await PlayerStateRepository.setDialogueCursor(client, userId, nextNodeId, dialogueId);
    await PlayerStateRepository.setDialogueChunkCursor(
      client, userId, dialogueId, nextChunkId, nextNodeId,
      { choice_id: choiceId, chunk_id: currentChunkId, timestamp: new Date().toISOString() }
    );
  });
}

async function handleChunkBoundarySideEffects(
  userId: string, choiceId: string, dialogueId: string,
  alignmentChange: any, breakthrough: any, chunkNodes: Record<string, any>
) {
  await handleAlignmentSideEffects(userId, alignmentChange, choiceId, dialogueId);
  await handleBreakthroughSideEffects(userId, breakthrough);

  let allChoices: any[] = [];
  for (const node of Object.values(chunkNodes)) {
    if (node && Array.isArray((node as any).choices)) {
      allChoices = allChoices.concat((node as any).choices);
    }
  }
  await handleJoinMystery(allChoices, choiceId, userId);
}

function buildMysterySolveStatus(breakthrough: any) {
  if (!breakthrough) return null;
  return {
    mysteryId: breakthrough.mysteryId,
    isBreakthrough: breakthrough.kind === 'winner',
    kind: breakthrough.kind,
  };
}

// ── shared telemetry ───────────────────────────────────────
async function recordPostChoiceTelemetry(
  userId: string, dialogueId: string, choiceId: string,
  chunkId: string, isChunkBoundaryCrossing: boolean,
  leafType: 'FREE' | 'GUARDED', tbDeducted: number
) {
  queryOLAP(
    `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
     VALUES (gen_random_uuid(), $1, 'dialogue_choice', $2, $3)`,
    [
      userId,
      JSON.stringify(buildChoiceTelemetryEventData(dialogueId, choiceId, chunkId, isChunkBoundaryCrossing, leafType)),
      tbDeducted,
    ]
  ).catch((err) => console.error('Dialogue choice telemetry error:', err));
}
