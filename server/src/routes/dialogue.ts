import express from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  filterChoices,
  getSpeaker,
  initializeDialogueState,
  resolveDialogueTree,
  getDialogState,
  processChoice,
  joinMystery,
} from './dialogue-helpers.js';
import { buildDialogueResponse, buildChooseResponse } from './dialogue-response-helpers.js';
import { emitBreakthroughSideEffects } from './dialogue-breakthrough-helpers.js';
import { withOLTPTransaction, queryOLTP, queryOLAP } from '../database/connection.js';
import { deleteCache, invalidatePattern } from '../database/redis.js';
import { DialogueResolver } from '../services/DialogueResolver.js';
import { userStateCacheKey } from './player-helpers.js';

export const dialogueRouter = express.Router();

async function recordPostChoiceTelemetry(
  userId: string,
  dialogueId: string,
  choiceIndex: number,
  result: any
) {
  if (result.unlockedVaultItem) {
    await deleteCache(`user:vault:${userId}`);
    queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data)
       VALUES (gen_random_uuid(), $1, 'vault_item_unlocked', $2)`,
      [userId, JSON.stringify({ itemId: result.unlockedVaultItem.id })]
    ).catch((err) => console.error('Vault unlock telemetry error:', err));
  }

  if (result.timeBlocksSpent && result.timeBlocksSpent > 0) {
    queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
       VALUES (gen_random_uuid(), $1, 'dialogue_choice', $2, $3)`,
      [
        userId,
        JSON.stringify({ dialogue_tree_id: dialogueId, choice_index: choiceIndex }),
        result.timeBlocksSpent,
      ]
    ).catch((err) => console.error('Dialogue choice telemetry error:', err));
  }
}

// ============================================================
// POST /dialogue/start - Start a conversation
// Body: { characterId, sceneId }
//
// Resolves the base tree, then runs the resolver to merge in
// any active mystery overlays for this user. The merged tree
// (with overlaid nodes) is what the client sees.
// ============================================================
dialogueRouter.post('/start', authMiddleware, async (req: AuthRequest, res) => {
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

    const dialogue = await resolveDialogueTree(characterId, sceneId);

    if (!dialogue) {
      return res.status(404).json({
        success: false,
        error: 'No dialogue available for this character at this location',
        timestamp: new Date().toISOString(),
      });
    }

    // Apply mystery overlays via the resolver (Task 3.1).
    // Players with no active mysteries get the base tree; players
    // investigating mysteries get the merged tree.
    const resolved = await DialogueResolver.resolveTreeForUser(
      userId,
      dialogue.id
    );
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
    const speaker = rootNode.speaker_id ? await getSpeaker(rootNode.speaker_id) : null;
    const isEnd = rootNode.is_end === true || (!rootNode.choices || rootNode.choices.length === 0);

    // Build response with the resolved nodes — the client only
    // sees overlaid content, never the raw base nodes.
    const responseDialogue = {
      ...dialogue,
      start_node_id: rootNodeId,
      nodes: resolved.nodes,
    };

    res.status(201).json(buildDialogueResponse(responseDialogue, rootNode, speaker, availableChoices, isEnd, 0, 0));
  } catch (error: any) {
    console.error('Start dialogue error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start dialogue',
      timestamp: new Date().toISOString(),
    });
  }
});

async function handleAlignmentSideEffects(userId: string, alignmentChange: 'loyalist' | 'fugitive' | undefined, choiceId: string, dialogueId: string) {
  if (!alignmentChange) return;
  queryOLAP(
    `INSERT INTO player_events (id, user_id, event_type, event_data)
     VALUES (gen_random_uuid(), $1, 'alignment_locked', $2)`,
    [userId, JSON.stringify({ alignment: alignmentChange, dialogue_tree_id: dialogueId, choice_id: choiceId })],
  ).catch((err) => console.error('Alignment lock telemetry error:', err));
  await deleteCache(userStateCacheKey(userId));
  await invalidatePattern('dialogue:resolved:*');
}

async function handleBreakthroughSideEffects(userId: string, breakthrough: any) {
  if (breakthrough && breakthrough.kind !== 'unrelated') {
    await emitBreakthroughSideEffects(userId, breakthrough);
  }
}

async function handleJoinMystery(availableChoices: any[], userId: string, choiceIndex: number) {
  if (!availableChoices[choiceIndex].join_mystery) return;
  const joinAction = availableChoices[choiceIndex].join_mystery;
  const mysteryId = Array.isArray(joinAction) ? joinAction[0] : joinAction;
  if (!mysteryId) return;
  await withOLTPTransaction(async (client) => {
    await joinMystery(client, userId, mysteryId);
  });
  await invalidatePattern('dialogue:resolved:*');
}

dialogueRouter.post('/:id/choose', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { choiceIndex } = req.body;

    if (choiceIndex === undefined || typeof choiceIndex !== 'number') {
      return res.status(400).json({ success: false, error: 'choiceIndex (number) is required', timestamp: new Date().toISOString() });
    }

    const state = await getDialogState(userId, id);

    if ('error' in state) {
      if (state.error === 'not_found') {
        return res.status(404).json({ success: false, error: 'Dialogue not found', timestamp: new Date().toISOString() });
      }
      if (state.error === 'player_not_found') {
        return res.status(404).json({ success: false, error: 'Player not found', timestamp: new Date().toISOString() });
      }
      return res.status(400).json({ success: false, error: 'Invalid current node state', timestamp: new Date().toISOString() });
    }

    const { dialogue, currentNodeId, currentNode, nodes } = state;

    const availableChoices = await filterChoices(currentNode.choices || [], userId);

    if (choiceIndex < 0 || choiceIndex >= availableChoices.length) {
      return res.status(400).json({ success: false, error: 'Invalid choice index', timestamp: new Date().toISOString() });
    }

    const result = await withOLTPTransaction(async (client) => {
      return processChoice(client, userId, id, choiceIndex, availableChoices[choiceIndex], currentNodeId, nodes);
    });

    if (!result.success) {
      if (result.error === 'insufficient_time_blocks') {
        return res.status(403).json({ success: false, error: 'Insufficient time blocks', timestamp: new Date().toISOString() });
      }
      if (result.error === 'invalid_vault_item') {
        return res.status(400).json({ success: false, error: 'Invalid vault item reference', timestamp: new Date().toISOString() });
      }
      if (result.error === 'invalid_next_node') {
        return res.status(500).json({ success: false, error: 'Choice points to invalid node', timestamp: new Date().toISOString() });
      }
    }

    await recordPostChoiceTelemetry(userId, id, choiceIndex, result);
    await handleAlignmentSideEffects(userId, result.alignmentChange, availableChoices[choiceIndex].id, id);
    await handleBreakthroughSideEffects(userId, result.breakthrough);

    const nextNode = nodes[availableChoices[choiceIndex].next_node_id];
    await handleJoinMystery(availableChoices, userId, choiceIndex);

    const speaker = nextNode.speaker_id ? await getSpeaker(nextNode.speaker_id) : null;
    const isEnd = nextNode.is_end === true || (!nextNode.choices || nextNode.choices.length === 0);
    const nextChoices = isEnd ? [] : await filterChoices(nextNode.choices || [], userId);

    const newTbResult = await queryOLTP('SELECT time_blocks FROM users WHERE id = $1', [userId]);

    res.json(buildChooseResponse(
      id,
      choiceIndex,
      nextNode,
      speaker,
      nextChoices,
      isEnd,
      result.timeBlocksSpent || 0,
      newTbResult.rows[0]?.time_blocks,
      result.unlockedVaultItem,
      result.mysterySolveStatus,
      result.alignmentChange
    ));
  } catch (error: any) {
    console.error('Dialogue choose error:', error);
    res.status(500).json({ success: false, error: 'Failed to process choice', timestamp: new Date().toISOString() });
  }
});

// ============================================================
// GET /dialogue/active - Get current active dialogue (for refresh recovery)
//
// Uses the resolver to fetch the merged tree, so a refresh
// mid-mystery preserves the overlaid content.
// ============================================================
dialogueRouter.get('/active', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const userResult = await queryOLTP(
      'SELECT active_dialogue_id, current_node_id FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]?.active_dialogue_id || !userResult.rows[0]?.current_node_id) {
      return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    }

    const { active_dialogue_id, current_node_id } = userResult.rows[0];

    const dialogueResult = await queryOLTP(
      'SELECT id, name, description, start_node_id, metadata FROM dialogue_trees WHERE id = $1',
      [active_dialogue_id]
    );

    if (dialogueResult.rows.length === 0) {
      return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    }

    // Resolve tree through the DialogueResolver (merges active
    // mystery overlays for this user).
    const resolved = await DialogueResolver.resolveTreeForUser(
      userId,
      active_dialogue_id
    );
    const currentNode = resolved.nodes[current_node_id];

    if (!currentNode) {
      return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    }

    const speaker = currentNode.speaker_id ? await getSpeaker(currentNode.speaker_id) : null;
    const availableChoices = await filterChoices(currentNode.choices || [], userId);
    const isEnd = currentNode.is_end === true || (!currentNode.choices || currentNode.choices.length === 0);

    // Compose response dialogue with resolved nodes so the
    // client only sees the merged (overlay-applied) tree.
    const dialogue = {
      ...dialogueResult.rows[0],
      start_node_id: resolved.rootId,
      nodes: resolved.nodes,
    };

    res.json(buildDialogueResponse(dialogue, currentNode, speaker, availableChoices, isEnd, 0, 0));
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

    // Task 5.1: also clear simulation flags so an explicit /end
    // returns the player to the live world even mid-simulation.
    await queryOLTP(
      `UPDATE users
          SET current_node_id = NULL,
              active_dialogue_id = NULL,
              is_in_simulation = FALSE,
              simulation_mystery_id = NULL
        WHERE id = $1`,
      [userId]
    );

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
