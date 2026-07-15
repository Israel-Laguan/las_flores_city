import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { DialogueResolver } from '../services/DialogueResolver.js';
import {
  processBreakthroughSolve,
  type BreakthroughResult,
} from './dialogue-breakthrough-helpers.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import type { DialogueChoice } from '@las-flores/shared';

export async function getSpeaker(speakerId: string) {
  const result = await queryOLTP(
    'SELECT id, name, title, avatar_url FROM characters WHERE id = $1',
    [speakerId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Check whether the player's current `story_beat` satisfies a
 * dialogue tree's `metadata.required_story_beat` gate.
 *
 * Mirrors the scene-gate logic in `server/src/routes/location.ts:265-271`:
 *  - undefined / null → always visible (backwards-compatible default)
 *  - string → must equal the player's current beat
 *  - string[] → player must be in the allowed set
 *
 * Exported so dialogue-tree and chunk-level gating can share one
 * implementation, and so property tests can drive it directly.
 */
export function isStoryBeatAllowed(
  required: unknown,
  playerStoryBeat: string
): boolean {
  if (required === undefined || required === null) return true;
  if (Array.isArray(required)) {
    return required.includes(playerStoryBeat);
  }
  if (typeof required === 'string') {
    return required === playerStoryBeat;
  }
  // Defensive: any other type fails closed.
  return false;
}

/**
 * Resolve which dialogue tree to start for a given (characterId, sceneId).
 *
 * Beat gating: if the candidate tree carries
 * `metadata.required_story_beat`, the player's `story_beat` must
 * satisfy it (string equality, or membership if the requirement is
 * a list). Trees without the gate are returned for any beat.
 *
 * Two query paths:
 *  1. Scene-scoped: a tree explicitly attached to the scene.
 *  2. Fallback: any tree whose start node has the speaker — used
 *     for tests and for characters whose scene mapping is sparse.
 *
 * Both paths apply the same gate so a pre-gate player never
 * reaches a gated tree via either route.
 */
export async function resolveDialogueTree(
  characterId: string,
  sceneId: string,
  userId?: string
) {
  // Fetch the player's story beat up-front so we can apply the
  // gate on both the scene-scoped and the fallback queries.
  // Mirrors `location.ts:251-252`: default to 'prologue' if the
  // player has no row yet (e.g. mid-onboarding).
  let storyBeat = 'prologue';
  if (userId) {
    const playerRow = await PlayerStateRepository.getFullState(userId);
    storyBeat = playerRow?.story_beat || 'prologue';
  }

  const sceneResult = await queryOLTP(
    `SELECT dt.id, dt.name, dt.description, dt.start_node_id, dt.nodes, dt.metadata
     FROM dialogue_trees dt
     JOIN scenes s ON dt.id = ANY(s.available_dialogues)
     WHERE s.id = $1
       AND EXISTS (
         SELECT 1 FROM jsonb_each(dt.nodes) AS node(key, value)
         WHERE (node.value->>'speaker_id') = $2
       )
     LIMIT 1`,
    [sceneId, characterId]
  );

  if (sceneResult.rows.length > 0) {
    const tree = sceneResult.rows[0];
    if (isStoryBeatAllowed(tree.metadata?.required_story_beat, storyBeat)) {
      return tree;
    }
    // Gated: fall through to the fallback so a beat-unlocked
    // alternative tree can still serve the same character.
  }

  const fallbackResult = await queryOLTP(
    `SELECT dt.id, dt.name, dt.description, dt.start_node_id, dt.nodes, dt.metadata
     FROM dialogue_trees dt
     WHERE (dt.nodes->dt.start_node_id->>'speaker_id') = $1
     LIMIT 1`,
    [characterId]
  );

  if (fallbackResult.rows.length === 0) return null;
  const fallback = fallbackResult.rows[0];
  if (!isStoryBeatAllowed(fallback.metadata?.required_story_beat, storyBeat)) {
    return null;
  }
  return fallback;
}

export async function filterChoices(choices: any[], userId: string) {
  if (!choices || choices.length === 0) return [];

  const player = await PlayerStateRepository.getForChoiceFilter(userId);
  if (!player) return choices;

  const flags = player.flags || {};
  const credits = player.credits || 0;

  return choices.filter((choice: any) => {
    if (choice.required_flags) {
      for (const [flag, required] of Object.entries(choice.required_flags)) {
        if (flags[flag] !== required) return false;
      }
    }

    if (choice.hidden_if) {
      for (const [flag, value] of Object.entries(choice.hidden_if)) {
        if (flags[flag] === value) return false;
      }
    }

    if (choice.time_block_cost && choice.time_block_cost.amount > 0) {
      if (credits < choice.time_block_cost.amount) return false;
    }

    return true;
  });
}

export async function processTimeBlockCost(
  userId: string,
  amount: number
): Promise<{ success: boolean; error?: string; spent?: number }> {
  const tbResult = await withOLTPTransaction(async (client) => {
    const result = await PlayerStateRepository.spendTimeBlocks(client, userId, amount);
    if (!result.success) {
      return { success: false as const, error: 'insufficient_blocks' as const };
    }
    return { success: true as const, spent: amount };
  });

  return tbResult;
}

export async function processRelationshipChange(
  userId: string,
  speakerId: string,
  stat: string,
  amount: number
): Promise<void> {
  const friendshipDelta = stat === 'friendship' ? amount : 0;
  const romanceDelta = stat === 'romance' ? amount : 0;

  await queryOLTP(
    'SELECT upsert_user_relationship($1, $2, $3, $4)',
    [userId, speakerId, friendshipDelta, romanceDelta]
  );
}

export async function recordChoiceAndEffects(
  client: any,
  userId: string,
  dialogueId: string,
  nextNodeId: string,
  choiceIndex: number,
  chosenOptionId: string,
  fromNodeId: string,
  isEnd: boolean,
  nextNode: any
): Promise<void> {
  if (isEnd) {
    // Clear dialogue cursor + simulation flags so the player
    // returns to the live world after finishing an archive case.
    await PlayerStateRepository.clearDialogueAndSimulation(client, userId);
  } else {
    // Advance the dialogue cursor; preserve active_dialogue_id.
    const cursor = await PlayerStateRepository.getDialogueCursor(userId);
    await PlayerStateRepository.setDialogueCursor(
      client,
      userId,
      nextNodeId,
      cursor?.active_dialogue_id ?? dialogueId
    );
  }

  await client.query(
    `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, choices_made)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET
       current_node_id = EXCLUDED.current_node_id,
       choices_made = player_dialogue_states.choices_made || EXCLUDED.choices_made`,
    [
      userId,
      dialogueId,
      nextNodeId,
      JSON.stringify([{ choiceIndex, choice_id: chosenOptionId, from_node: fromNodeId, to_node: nextNodeId }]),
    ]
  );

  // Apply EffectsSchema-validated effects to player_states.
  // No gating logic here — story progression is a deferred feature.
  const effects = nextNode.effects;
  if (effects?.flag_set) {
    await PlayerStateRepository.mergeFlags(client, userId, effects.flag_set);
  }
  if (effects?.story_beat) {
    await PlayerStateRepository.setStoryBeat(client, userId, effects.story_beat);
  }
}

export async function initializeDialogueState(client: any, userId: string, dialogueId: string, rootNodeId: string) {
  await PlayerStateRepository.setDialogueCursor(client, userId, rootNodeId, dialogueId);

  await client.query(
    `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, choices_made)
     VALUES ($1, $2, $3, '[]')
     ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET
       current_node_id = EXCLUDED.current_node_id,
       choices_made = '[]',
       started_at = NOW()`,
    [userId, dialogueId, rootNodeId]
  );
}

export async function getDialogState(userId: string, dialogueId: string) {
  const dialogueResult = await queryOLTP(
    'SELECT id, name, description, start_node_id, metadata FROM dialogue_trees WHERE id = $1',
    [dialogueId]
  );

  if (dialogueResult.rows.length === 0) {
    return { error: 'not_found' as const };
  }

  const cursor = await PlayerStateRepository.getDialogueCursor(userId);

  if (!cursor) {
    return { error: 'player_not_found' as const };
  }

  const {
    current_node_id,
    time_blocks: _time_blocks,
    is_in_simulation,
    simulation_mystery_id,
  } = cursor;

  // Branch to the archive resolver when the player is in
  // simulation mode. The archive resolver force-merges ALL overlays
  // for the mystery regardless of ARCHIVED status, so legacy play
  // gets the full investigation tree.
  let resolved;
  if (is_in_simulation && simulation_mystery_id) {
    const isNsfwUnlocked = await DialogueResolver.getUserNsfwStatus(userId);
    resolved = await DialogueResolver.resolveTreeForArchive(
      dialogueId,
      simulation_mystery_id,
      isNsfwUnlocked
    );
  } else {
    // Live resolver: merges overlays for ACTIVE mysteries the user
    // is investigating or that are globally active.
    resolved = await DialogueResolver.resolveTreeForUser(userId, dialogueId);
  }

  const currentNodeId = current_node_id || resolved.rootId;
  const currentNode = resolved.nodes[currentNodeId];

  if (!currentNode) {
    return { error: 'invalid_node' as const };
  }

  // Compose a dialogue object with tree metadata + resolved
  // nodes so callers (e.g. buildDialogueResponse) get the
  // overlaid view, not the raw base.
  const dialogue = {
    ...dialogueResult.rows[0],
    start_node_id: resolved.rootId,
    nodes: resolved.nodes,
  };

  return { dialogue, currentNodeId, currentNode, nodes: resolved.nodes };
}

/**
 * Insert a player into a mystery (the "Trigger Choice" action).
 * Idempotent: ON CONFLICT DO NOTHING means picking the same
 * choice twice is a no-op.
 */
export async function joinMystery(
  client: any,
  userId: string,
  mysteryId: string
): Promise<void> {
  await client.query(
    `INSERT INTO player_mysteries (user_id, mystery_id, status)
     VALUES ($1, $2, 'INVESTIGATING')
     ON CONFLICT (user_id, mystery_id) DO NOTHING`,
    [userId, mysteryId]
  );
}

async function processVaultUnlock(
  client: any,
  userId: string,
  vaultUnlockId: string
): Promise<{ id: string; title: string } | null> {
  const itemResult = await client.query(
    'SELECT id, title FROM vault_items WHERE id = $1',
    [vaultUnlockId]
  );
  if (itemResult.rows.length === 0) {
    return null;
  }
  await client.query(
    `INSERT INTO player_vault (user_id, item_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, item_id) DO NOTHING`,
    [userId, vaultUnlockId]
  );
  return itemResult.rows[0];
}

async function processAlignmentChange(
  client: any,
  userId: string,
  alignment: 'loyalist' | 'fugitive'
): Promise<void> {
  await PlayerStateRepository.setAlignment(client, userId, alignment);
}

async function processRelationshipAndCheckEnd(
  userId: string,
  nextNode: any,
  chosenOption: DialogueChoice
): Promise<{ isEnd: boolean }> {
  if (chosenOption.relationship_change) {
    const speakerId = nextNode.speaker_id;
    if (speakerId) {
      await processRelationshipChange(
        userId,
        speakerId,
        chosenOption.relationship_change.stat,
        chosenOption.relationship_change.amount
      );
    }
  }
  const isEnd = nextNode.is_end === true || (!nextNode.choices || nextNode.choices.length === 0);
  return { isEnd };
}

export async function processChoice(
  client: any,
  userId: string,
  dialogueId: string,
  choiceIndex: number,
  chosenOption: DialogueChoice,
  currentNodeId: string,
  nodes: any
): Promise<{
  success: boolean;
  timeBlocksSpent?: number;
  error?: string;
  unlockedVaultItem?: { id: string; title: string };
  breakthrough?: BreakthroughResult;
  mysterySolveStatus?: {
    mysteryId: string;
    isBreakthrough: boolean;
    kind: 'winner' | 'solver' | 'late';
  };
  alignmentChange?: 'loyalist' | 'fugitive';
}> {
  let timeBlocksSpent = 0;

  if (chosenOption.time_block_cost && chosenOption.time_block_cost.amount > 0) {
    const tbResult = await processTimeBlockCost(userId, chosenOption.time_block_cost.amount);
    if (!tbResult.success) {
      return { success: false, error: 'insufficient_time_blocks' };
    }
    timeBlocksSpent = tbResult.spent ?? 0;
  }

  const nextNodeId = chosenOption.next_node_id;
  const nextNode = nodes[nextNodeId];

  if (!nextNode) {
    return { success: false, error: 'invalid_next_node' };
  }

  const { isEnd } = await processRelationshipAndCheckEnd(userId, nextNode, chosenOption);

  let unlockedVaultItem: { id: string; title: string } | undefined;
  if (chosenOption.vault_unlock) {
    const result = await processVaultUnlock(client, userId, chosenOption.vault_unlock);
    if (!result) {
      return { success: false, error: 'invalid_vault_item' };
    }
    unlockedVaultItem = result;
  }

  await recordChoiceAndEffects(
    client,
    userId,
    dialogueId,
    nextNodeId,
    choiceIndex,
    chosenOption.id,
    currentNodeId,
    isEnd,
    nextNode
  );

  const { result: breakthrough, status: mysterySolveStatus } =
    await processBreakthroughSolve(client, userId, chosenOption.mystery_solve);

  let alignmentChange: 'loyalist' | 'fugitive' | undefined;
  if (chosenOption.alignment_change) {
    await processAlignmentChange(client, userId, chosenOption.alignment_change);
    alignmentChange = chosenOption.alignment_change;
  }

return {
    success: true,
    timeBlocksSpent,
    unlockedVaultItem,
    mysterySolveStatus,
    breakthrough,
    alignmentChange,
  };
}
