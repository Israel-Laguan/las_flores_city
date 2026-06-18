import express from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { DialogueResolver } from '../services/DialogueResolver.js';
import { initializeDialogueState, filterChoices, getSpeaker, buildDialogueResponse } from './dialogue-helpers.js';

// ============================================================
// Archive Room (Task 5.1 - Legacy Play)
// ============================================================
// ARCHIVED mysteries are dropped from the live resolver, but their
// overlays stay in the DB. This route lets a player start a
// "simulation" of a closed case: it force-merges the mystery's
// overlays into the base tree (bypassing status gating), seeds
// dialogue state, and flags the user as in-simulation so that
// subsequent /dialogue/choose requests route through the archive
// resolver instead of the live one.
//
// Authored to match dialogue.ts's POST /start handler shape so the
// client gets an identical response envelope.
// ============================================================

export const archiveRouter = express.Router();

archiveRouter.post('/start-simulation', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { mysteryId, baseTreeId } = req.body;

    if (!mysteryId || !baseTreeId) {
      return res.status(400).json({
        success: false,
        error: 'mysteryId and baseTreeId are required',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await startSimulation(userId, mysteryId, baseTreeId);

    if ('error' in result) {
      const status = result.status ?? 500;
      return res.status(status).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }

    res
      .status(201)
      .json(buildDialogueResponse(result.dialogue, result.rootNode, result.speaker, result.choices, result.isEnd, 0, 0));
  } catch (error: any) {
    console.error('Archive start-simulation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start archive simulation',
      timestamp: new Date().toISOString(),
    });
  }
});

// ----------------------------------------------------------
// Helper: encapsulates the start-simulation flow so the route
// handler stays under the ESLint max-lines-per-function limit.
// ----------------------------------------------------------
async function startSimulation(
  userId: string,
  mysteryId: string,
  baseTreeId: string
): Promise<
  | { error: string; status?: number }
  | { dialogue: any; rootNode: any; speaker: any; choices: any[]; isEnd: boolean }
> {
  // 1. Verify the mystery is ARCHIVED — live mysteries use the
  //    standard dialogue flow, not the archive room.
  const mysteryResult = await queryOLTP<{ status: string }>(
    `SELECT status FROM mysteries WHERE id = $1`,
    [mysteryId]
  );
  if (mysteryResult.rows.length === 0) {
    return { error: 'Mystery not found', status: 404 };
  }
  if (mysteryResult.rows[0].status !== 'ARCHIVED') {
    return { error: 'MYSTERY_NOT_ARCHIVED', status: 400 };
  }

  // 2. Resolve the archive tree: base tree deep-merged with ALL
  //    of this mystery's overlays (status-agnostic, NSFW-gated).
  const isNsfwUnlocked = await DialogueResolver.getUserNsfwStatus(userId);
  const resolved = await DialogueResolver.resolveTreeForArchive(
    baseTreeId,
    mysteryId,
    isNsfwUnlocked
  );
  const rootNodeId = resolved.rootId;
  const rootNode = resolved.nodes[rootNodeId];

  if (!rootNode) {
    return { error: 'Archive tree has invalid root node' };
  }

  // 3. Put the player into simulation mode and seed dialogue
  //    state so /dialogue/choose can advance the conversation
  //    through the archive resolver.
  await withOLTPTransaction(async (client) => {
    await client.query(
      `UPDATE users
          SET current_node_id = $1,
              active_dialogue_id = $2,
              is_in_simulation = TRUE,
              simulation_mystery_id = $3
        WHERE id = $4`,
      [rootNodeId, baseTreeId, mysteryId, userId]
    );
    await initializeDialogueState(client, userId, baseTreeId, rootNodeId);
  });

  const availableChoices = await filterChoices(rootNode.choices || [], userId);
  const speaker = rootNode.speaker_id ? await getSpeaker(rootNode.speaker_id) : null;
  const isEnd = rootNode.is_end === true || (!rootNode.choices || rootNode.choices.length === 0);

  // Build the response envelope identical to dialogue /start so
  // the client renders it with the same code path.
  const treeBase = await queryOLTP<{ name: string; description: string; metadata: any }>(
    `SELECT name, description, metadata FROM dialogue_trees WHERE id = $1`,
    [baseTreeId]
  );
  const dialogue = {
    id: baseTreeId,
    name: treeBase.rows[0]?.name ?? 'Archived Case',
    description: treeBase.rows[0]?.description ?? '',
    start_node_id: rootNodeId,
    nodes: resolved.nodes,
    metadata: treeBase.rows[0]?.metadata ?? null,
  };

  return { dialogue, rootNode, speaker, choices: availableChoices, isEnd };
}
