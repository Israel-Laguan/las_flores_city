import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { DialogueResolver } from '../services/DialogueResolver.js';

export async function getSpeaker(speakerId: string) {
  const result = await queryOLTP(
    'SELECT id, name, title, avatar_url FROM characters WHERE id = $1',
    [speakerId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function resolveDialogueTree(characterId: string, sceneId: string) {
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
    return sceneResult.rows[0];
  }

  const fallbackResult = await queryOLTP(
    `SELECT dt.id, dt.name, dt.description, dt.start_node_id, dt.nodes, dt.metadata
     FROM dialogue_trees dt
     WHERE (dt.nodes->dt.start_node_id->>'speaker_id') = $1
     LIMIT 1`,
    [characterId]
  );

  return fallbackResult.rows.length > 0 ? fallbackResult.rows[0] : null;
}

export async function filterChoices(choices: any[], userId: string) {
  if (!choices || choices.length === 0) return [];

  const playerResult = await queryOLTP(
    `SELECT credits, flags FROM users u
     LEFT JOIN player_states ps ON u.id = ps.user_id
     WHERE u.id = $1`,
    [userId]
  );

  const player = playerResult.rows[0];
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
    const lockResult = await client.query(
      'SELECT time_blocks FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (lockResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const currentTB = lockResult.rows[0].time_blocks;

    if (currentTB < amount) {
      return { success: false as const, error: 'insufficient_blocks' as const };
    }

    await client.query(
      'UPDATE users SET time_blocks = time_blocks - $1 WHERE id = $2',
      [amount, userId]
    );

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
    await client.query(
      'UPDATE users SET current_node_id = NULL, active_dialogue_id = NULL WHERE id = $1',
      [userId]
    );
  } else {
    await client.query(
      'UPDATE users SET current_node_id = $1 WHERE id = $2',
      [nextNodeId, userId]
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

  if (nextNode.effects?.flag_set) {
    await client.query(
      'UPDATE player_states SET flags = flags || $1 WHERE user_id = $2',
      [JSON.stringify(nextNode.effects.flag_set), userId]
    );
  }
}

export async function initializeDialogueState(client: any, userId: string, dialogueId: string, rootNodeId: string) {
  await client.query(
    'UPDATE users SET current_node_id = $1, active_dialogue_id = $2 WHERE id = $3',
    [rootNodeId, dialogueId, userId]
  );

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

  const userResult = await queryOLTP(
    'SELECT current_node_id, time_blocks FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    return { error: 'player_not_found' as const };
  }

  // Resolve tree through the DialogueResolver (merges active
  // mystery overlays for this user). The `nodes` field below
  // carries the resolved tree, not the raw base.
  const resolved = await DialogueResolver.resolveTreeForUser(userId, dialogueId);
  const currentNodeId = userResult.rows[0].current_node_id || resolved.rootId;
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

export async function processChoice(
  client: any,
  userId: string,
  dialogueId: string,
  choiceIndex: number,
  chosenOption: any,
  currentNodeId: string,
  nodes: any
): Promise<{ success: boolean; timeBlocksSpent?: number; error?: string }> {
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

  return { success: true, timeBlocksSpent };
}

export function buildDialogueResponse(
  dialogue: any,
  node: any,
  speaker: any,
  choices: any[],
  isEnd: boolean,
  timeBlocksSpent: number,
  timeBlocksRemaining: number
) {
  return {
    success: true,
    data: {
      tree: {
        id: dialogue.id,
        name: dialogue.name,
        description: dialogue.description,
        start_node_id: dialogue.start_node_id,
        nodes: dialogue.nodes,
        metadata: dialogue.metadata,
      },
      current_node: {
        id: node.id,
        type: node.type,
        text: node.text,
        thought: node.thought || null,
        speaker,
      },
      available_choices: choices,
      is_end: isEnd,
      time_blocks_spent: timeBlocksSpent,
      time_blocks_remaining: timeBlocksRemaining,
    },
    timestamp: new Date().toISOString(),
  };
}

export function buildChooseResponse(
  dialogueId: string,
  choiceIndex: number,
  nextNode: any,
  speaker: any,
  nextChoices: any[],
  isEnd: boolean,
  timeBlocksSpent: number,
  timeBlocksRemaining: number
) {
  return {
    success: true,
    data: {
      dialogue_id: dialogueId,
      choice_index: choiceIndex,
      next_node: {
        id: nextNode.id,
        type: nextNode.type,
        text: nextNode.text,
        thought: nextNode.thought || null,
        speaker,
      },
      available_choices: nextChoices,
      is_end: isEnd,
      time_blocks_spent: timeBlocksSpent,
      time_blocks_remaining: timeBlocksRemaining,
    },
    timestamp: new Date().toISOString(),
  };
}