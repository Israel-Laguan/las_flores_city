import express from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  filterChoices,
  getSpeaker,
  initializeDialogueState,
  resolveDialogueTree,
  buildDialogueResponse,
  getDialogState,
  processChoice,
  buildChooseResponse,
} from './dialogue-helpers.js';
import { withOLTPTransaction, queryOLTP } from '../database/connection.js';

export const dialogueRouter = express.Router();

// ============================================================
// POST /dialogue/start - Start a conversation
// Body: { characterId, sceneId }
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

    const nodes = dialogue.nodes;
    const rootNodeId = dialogue.start_node_id;
    const rootNode = nodes[rootNodeId];

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

    res.status(201).json(buildDialogueResponse(dialogue, rootNode, speaker, availableChoices, isEnd, 0, 0));
  } catch (error: any) {
    console.error('Start dialogue error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start dialogue',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
// POST /dialogue/choose - Advance the dialogue
// Body: { choiceIndex: number }
// ============================================================
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

    const { dialogue, currentNodeId, currentNode } = state;

    const availableChoices = await filterChoices(currentNode.choices || [], userId);

    if (choiceIndex < 0 || choiceIndex >= availableChoices.length) {
      return res.status(400).json({ success: false, error: 'Invalid choice index', timestamp: new Date().toISOString() });
    }

    const result = await withOLTPTransaction(async (client) => {
      return processChoice(client, userId, id, choiceIndex, availableChoices[choiceIndex], currentNodeId, dialogue.nodes);
    });

    if (!result.success) {
      if (result.error === 'insufficient_time_blocks') {
        return res.status(403).json({ success: false, error: 'Insufficient time blocks', timestamp: new Date().toISOString() });
      }
      if (result.error === 'invalid_next_node') {
        return res.status(500).json({ success: false, error: 'Choice points to invalid node', timestamp: new Date().toISOString() });
      }
    }

    const nextNode = dialogue.nodes[availableChoices[choiceIndex].next_node_id];
    const speaker = nextNode.speaker_id ? await getSpeaker(nextNode.speaker_id) : null;
    const isEnd = nextNode.is_end === true || (!nextNode.choices || nextNode.choices.length === 0);
    const nextChoices = isEnd ? [] : await filterChoices(nextNode.choices || [], userId);

    const newTbResult = await queryOLTP('SELECT time_blocks FROM users WHERE id = $1', [userId]);

    res.json(buildChooseResponse(id, choiceIndex, nextNode, speaker, nextChoices, isEnd, result.timeBlocksSpent || 0, newTbResult.rows[0]?.time_blocks));
  } catch (error: any) {
    console.error('Dialogue choose error:', error);
    res.status(500).json({ success: false, error: 'Failed to process choice', timestamp: new Date().toISOString() });
  }
});

// ============================================================
// GET /dialogue/active - Get current active dialogue (for refresh recovery)
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
      'SELECT id, name, description, start_node_id, nodes, metadata FROM dialogue_trees WHERE id = $1',
      [active_dialogue_id]
    );

    if (dialogueResult.rows.length === 0) {
      return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    }

    const dialogue = dialogueResult.rows[0];
    const currentNode = dialogue.nodes[current_node_id];

    if (!currentNode) {
      return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    }

    const speaker = currentNode.speaker_id ? await getSpeaker(currentNode.speaker_id) : null;
    const availableChoices = await filterChoices(currentNode.choices || [], userId);
    const isEnd = currentNode.is_end === true || (!currentNode.choices || currentNode.choices.length === 0);

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

    await queryOLTP(
      'UPDATE users SET current_node_id = NULL, active_dialogue_id = NULL WHERE id = $1',
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