import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import {
  resolveDialogueTree,
  filterChoices,
  initializeDialogueState,
  applyEffects,
  grantDialogueRewards,
} from './dialogue-helpers.js';
import { buildDialogueResponse, type ChunkPayload } from './dialogue-response-helpers.js';
import { resolveChunkSpeakers } from './dialogue-speakers.js';
import { DialogueResolver } from '../services/DialogueResolver.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { mapDialogueWriteError } from './dialogue-errors.js';

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
        error: 'Dialogue tree not found',
        timestamp: new Date().toISOString(),
      });
    }

    // M15: premium gate check (before any state mutation)
    if (dialogue?.metadata?.requires_premium) {
      const entitlement = await queryOLTP(
        'SELECT is_premium_unlocked FROM user_entitlements WHERE user_id = $1',
        [userId]
      );
      if (!entitlement.rows[0]?.is_premium_unlocked) {
        return res.status(403).json({
          success: false,
          error: 'premium_required',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Pin + chunk lookup in one tx for read-after-write after compile and so
    // pinned_tree_revision + current_chunk_id are written together.
    let startChunkId: string | undefined;
    let startChunkKey: string | undefined;
    let treeRevision = 0;
    await withOLTPTransaction(async (client) => {
      const treeRevResult = await client.query<{ revision: number }>(
        'SELECT revision FROM dialogue_trees WHERE id = $1',
        [dialogue.id]
      );
      treeRevision = treeRevResult.rows[0]?.revision ?? 0;

      const startChunkResult = await client.query(
        `SELECT id, chunk_key FROM dialogue_chunks
         WHERE tree_id = $1 AND chunk_key = $2 AND revision = $3
         LIMIT 1`,
        [dialogue.id, dialogue.start_node_id, treeRevision]
      );

      if (startChunkResult.rows.length > 0) {
        startChunkId = startChunkResult.rows[0].id;
        startChunkKey = startChunkResult.rows[0].chunk_key;
      }

      // Write both the pinned rev and the start chunk id in the same statement
      // (append-only rev history means we select the chunk for exactly this rev).
      const chunkForPds = startChunkId || null;
      await client.query(
        `INSERT INTO player_dialogue_states
           (user_id, dialogue_tree_id, current_node_id, current_chunk_id, pinned_tree_revision)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE
         SET current_node_id = EXCLUDED.current_node_id,
             current_chunk_id = EXCLUDED.current_chunk_id,
             pinned_tree_revision = CASE
               WHEN player_dialogue_states.pinned_tree_revision = 0 THEN EXCLUDED.pinned_tree_revision
               WHEN EXCLUDED.pinned_tree_revision > player_dialogue_states.pinned_tree_revision THEN EXCLUDED.pinned_tree_revision
               ELSE player_dialogue_states.pinned_tree_revision
             END`,
        [userId, dialogue.id, dialogue.start_node_id, chunkForPds, treeRevision]
      );
    });

    if (!startChunkId || !startChunkKey) {
      return handleStartFallback(userId, dialogue, res);
    }

    return handleStartChunk(userId, dialogue, startChunkId, startChunkKey, res);
  } catch (error: any) {
    const mapped = mapDialogueWriteError(error);
    if (mapped) {
      return res.status(mapped.status).json({
        success: false,
        error: mapped.code,
        timestamp: new Date().toISOString(),
      });
    }
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

  // Gate root-effect application to NEW dialogue runs only. Repeated
  // /dialogue/start calls while a dialogue is already active would
  // otherwise re-apply additive root stat_set deltas on every restart
  // (e.g. a player could farm trust by re-starting). After a dialogue
  // ENDS, `clearDialogueAndSimulation` nulls `active_dialogue_id`, so
  // re-entering a finished dialogue is treated as a fresh run and root
  // effects apply once — exactly as before.
  //
  // The cursor is read with `FOR UPDATE` INSIDE the transaction so the
  // check and the cursor write are one atomic claim: two concurrent
  // first starts serialize on the player row, and the loser observes
  // the winner's committed `active_dialogue_id` instead of a stale
  // pre-start snapshot (which would double-apply the root deltas).
  await withOLTPTransaction(async (client) => {
    const existingCursor = await PlayerStateRepository.lockDialogueCursor(client, userId);
    const isRestart = existingCursor?.active_dialogue_id === dialogue.id;

    await initializeDialogueState(client, userId, dialogue.id, rootNodeId);
    if (isRestart) {
      // Mid-dialogue restart: root stat_set already applied on the first
      // start and persists (initializeDialogueState resets the cursor +
      // choices_made, not stats). Skip re-applying root effects to avoid
      // additive stat accumulation.
      return;
    }
    // Apply the root node's stat_set / flag_set / state_set exactly once,
    // before returning choices. Subsequent choice effects go through
    // recordChoiceAndEffects which reuses the same shared pipeline.
    await applyEffects(client, userId, rootNode.effects);
    // Root-level grant_credits / grant_item flow through the shared
    // idempotent reward helper (distinct `grant_root` claim key).
    await grantDialogueRewards(
      client,
      userId,
      dialogue.id,
      rootNodeId,
      rootNode.effects,
      'grant_root'
    );
  });

  const availableChoices = await filterChoices(rootNode.choices || [], userId, rootNode.speaker_id);
  const isEnd = rootNode.is_end === true || (!rootNode.choices || rootNode.choices.length === 0);

  const chunkPayload: ChunkPayload = {
    id: dialogue.id,
    chunk_key: rootNodeId,
    nodes: resolved.nodes,
    leaves: {},
  };

  const speakers = await resolveChunkSpeakers(resolved.nodes);

  return res.status(201).json(
    buildDialogueResponse(chunkPayload, dialogue.id, rootNodeId, availableChoices, isEnd, 0, 0, undefined, speakers)
  );
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

  // Gate root-effect application to NEW dialogue runs only (see
  // handleStartFallback for the rationale: a mid-dialogue restart would
  // otherwise re-apply additive root stat_set deltas). The cursor is read
  // with `FOR UPDATE` inside the transaction so concurrent first starts
  // serialize on the player row and only one applies the root effects.
  await withOLTPTransaction(async (client) => {
    const existingCursor = await PlayerStateRepository.lockDialogueCursor(client, userId);
    const isRestart = existingCursor?.active_dialogue_id === dialogue.id;

    await PlayerStateRepository.setDialogueCursor(client, userId, rootNodeId, dialogue.id);
    await PlayerStateRepository.initDialogueChunkState(client, userId, dialogue.id, rootNodeId, startChunkId);
    if (isRestart) {
      // Mid-dialogue restart: skip re-applying root effects.
      return;
    }
    // Apply the root node's stat_set / flag_set / state_set exactly once.
    await applyEffects(client, userId, rootNode.effects);
    // Root-level grant_credits / grant_item flow through the shared
    // idempotent reward helper (distinct `grant_root` claim key).
    await grantDialogueRewards(
      client,
      userId,
      dialogue.id,
      rootNodeId,
      rootNode.effects,
      'grant_root'
    );
  });

  const availableChoices = await filterChoices(rootNode.choices || [], userId, rootNode.speaker_id);
  const isEnd = rootNode.is_end === true || (!rootNode.choices || rootNode.choices.length === 0);
  const tbCursor = await PlayerStateRepository.getDialogueCursor(userId);

  const chunkPayload: ChunkPayload = {
    id: resolvedChunk.chunk.id,
    chunk_key: resolvedChunk.chunk.chunk_key,
    nodes: resolvedChunk.mergedNodes,
    leaves: resolvedChunk.chunk.leaves,
  };

  const speakers = await resolveChunkSpeakers(resolvedChunk.mergedNodes);

  return res.status(201).json(
    buildDialogueResponse(
      chunkPayload,
      resolvedChunk.chunk.id,
      rootNodeId,
      availableChoices,
      isEnd,
      0,
      tbCursor?.time_blocks ?? 0,
      dialogue.id,
      speakers
    )
  );
}
