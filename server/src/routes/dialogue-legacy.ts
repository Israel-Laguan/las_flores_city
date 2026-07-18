import { queryOLTP, queryOLAP, withOLTPTransaction } from '../database/connection.js';
import {
  filterChoices,
  getDialogState,
  processChoice,
  joinMystery,
} from './dialogue-helpers.js';
import { deleteCache, invalidatePattern } from '../database/redis.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { handleAlignmentSideEffects, handleBreakthroughSideEffects } from './dialogue-side-effects.js';

export async function handleLegacyChoiceIndex(
  req: any,
  res: any,
  dialogueId: string,
  userId: string,
  choiceIndex: number
) {
  if (typeof choiceIndex !== 'number' || choiceIndex < 0) {
    return res.status(400).json({
      success: false,
      error: 'choiceIndex must be a non-negative integer',
      timestamp: new Date().toISOString(),
    });
  }

  const state = await getDialogState(userId, dialogueId);

  // M15: premium gate check
  if ('dialogue' in state && state.dialogue?.metadata?.requires_premium) {
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

  if ('error' in state) {
    const statusMap: Record<string, number> = {
      not_found: 404,
      player_not_found: 404,
      invalid_node: 400,
    };
    return res.status(statusMap[state.error as string] ?? 400).json({
      success: false,
      error: state.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { currentNodeId, currentNode, nodes } = state;
  const availableChoices = await filterChoices(currentNode.choices || [], userId);

  if (choiceIndex >= availableChoices.length) {
    return res.status(400).json({
      success: false,
      error: 'invalid_choice_index',
      timestamp: new Date().toISOString(),
    });
  }

  const chosenOption = availableChoices[choiceIndex];
  let choiceResult: Awaited<ReturnType<typeof processChoice>>;

  await withOLTPTransaction(async (client) => {
    choiceResult = await processChoice(client, userId, dialogueId, choiceIndex, chosenOption, currentNodeId, nodes);
  });

  choiceResult = choiceResult!;

  if (!choiceResult.success) {
    const errorStatusMap: Record<string, number> = {
      insufficient_time_blocks: 403,
      invalid_vault_item: 400,
    };
    return res.status(errorStatusMap[choiceResult.error ?? ''] ?? 400).json({
      success: false,
      error: choiceResult.error,
      timestamp: new Date().toISOString(),
    });
  }

  return buildLegacyResponse(userId, dialogueId, choiceIndex, chosenOption, choiceResult, nodes, res);
}

async function buildLegacyResponse(
  userId: string,
  dialogueId: string,
  choiceIndex: number,
  chosenOption: any,
  choiceResult: Awaited<ReturnType<typeof processChoice>>,
  nodes: any,
  res: any
) {
  const nextNodeId = chosenOption.next_node_id;
  const nextNode = nodes[nextNodeId];
  const isEnd = !nextNode || nextNode.is_end === true || (!nextNode.choices || nextNode.choices.length === 0);
  const nextChoices = isEnd ? [] : await filterChoices(nextNode?.choices || [], userId);

  if (chosenOption.join_mystery) {
    const mysteryId = Array.isArray(chosenOption.join_mystery) ? chosenOption.join_mystery[0] : chosenOption.join_mystery;
    if (mysteryId) {
      await withOLTPTransaction(async (client) => {
        await joinMystery(client, userId, mysteryId);
      });
      await invalidatePattern('dialogue:resolved:*');
    }
  }

  if (choiceResult.alignmentChange) {
    await handleAlignmentSideEffects(userId, choiceResult.alignmentChange, chosenOption.id, dialogueId);
  }
  if (choiceResult.breakthrough && choiceResult.breakthrough.kind !== 'unrelated') {
    await handleBreakthroughSideEffects(userId, choiceResult.breakthrough);
  }

  const tbCursor = await PlayerStateRepository.getDialogueCursor(userId);

  if (choiceResult.timeBlocksSpent && choiceResult.timeBlocksSpent > 0) {
    queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost)
       VALUES (gen_random_uuid(), $1, 'dialogue_choice', $2, $3)`,
      [
        userId,
        JSON.stringify({ dialogue_tree_id: dialogueId, choice_index: choiceIndex }),
        choiceResult.timeBlocksSpent,
      ]
    ).catch((err: Error) => console.error('Dialogue choice telemetry error:', err));
  }

  if (choiceResult.unlockedVaultItem) {
    await deleteCache(`user:vault:${userId}`);
    queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data)
       VALUES (gen_random_uuid(), $1, 'vault_item_unlocked', $2)`,
      [userId, JSON.stringify({ itemId: choiceResult.unlockedVaultItem.id })]
    ).catch((err: Error) => console.error('Vault unlock telemetry error:', err));
  }

  if (choiceResult.grantedCredits) {
    queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data)
       VALUES (gen_random_uuid(), $1, 'credits_granted', $2)`,
      [userId, JSON.stringify(choiceResult.grantedCredits)]
    ).catch((err: Error) => console.error('Credits granted telemetry error:', err));
  }

  if (choiceResult.grantedItem) {
    queryOLAP(
      `INSERT INTO player_events (id, user_id, event_type, event_data)
       VALUES (gen_random_uuid(), $1, 'item_granted', $2)`,
      [userId, JSON.stringify(choiceResult.grantedItem)]
    ).catch((err: Error) => console.error('Item granted telemetry error:', err));
  }

  return res.json({
    success: true,
    data: {
      dialogue_id: dialogueId,
      choice_index: choiceIndex,
      next_node: nextNode ?? null,
      available_choices: nextChoices,
      is_end: isEnd,
      time_blocks_spent: choiceResult.timeBlocksSpent ?? 0,
      time_blocks_remaining: tbCursor?.time_blocks ?? 0,
      ...(choiceResult.unlockedVaultItem && { unlocked_vault_item: choiceResult.unlockedVaultItem }),
      ...(choiceResult.mysterySolveStatus && { mystery_solve_status: choiceResult.mysterySolveStatus }),
      ...(choiceResult.alignmentChange && { alignment_change: choiceResult.alignmentChange }),
    },
    timestamp: new Date().toISOString(),
  });
}
