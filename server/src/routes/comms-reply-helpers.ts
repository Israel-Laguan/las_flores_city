import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { withOLTPTransaction, queryOLAP } from '../database/connection.js';
import { processRelationshipChange } from './dialogue-helpers.js';
import { THREAD_BASE_SELECT, ThreadRow, applyChoiceFilters } from './comms.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import type { SMSMessage } from '../../../shared/src/types/sms.js';

export interface ReplyTransactionDetail {
  userId: string;
  characterId: string;
  thread: ThreadRow;
  newCurrentNodeId: string | null;
  isEnd: boolean;
  history: SMSMessage[];
  npcMessageId: string | null;
  nextNode: any;
  timeBlocksSpent: number;
  playerMessageId: string;
  choiceId: string;
}

export type ReplyError = {
  status: number;
  payload: { success: false; error: string; timestamp: string; status: number };
};

export type ReplyOk = { status: 200; payload: null; detail: ReplyTransactionDetail };
export type ReplyTransactionResult = ReplyError | ReplyOk;

function makeError(status: number, error: string): ReplyError {
  return {
    status,
    payload: {
      success: false,
      error,
      timestamp: new Date().toISOString(),
      status: 0,
    },
  };
}

interface ThreadResult {
  error: ReplyError | null;
  thread: ThreadRow | null;
}

async function loadAndValidateThread(
  client: PoolClient,
  userId: string,
  characterId: string,
  tree: any
): Promise<ThreadResult> {
  const lockResult = await client.query(
    `${THREAD_BASE_SELECT}
     WHERE pst.user_id = $1 AND pst.character_id = $2
     FOR UPDATE OF pst`,
    [userId, characterId]
  );

  if (lockResult.rows.length === 0) {
    return { error: makeError(404, 'thread_not_found'), thread: null };
  }

  const thread = lockResult.rows[0] as ThreadRow;
  if (!thread.current_node_id) {
    return { error: makeError(400, 'thread_has_no_active_node'), thread: null };
  }

  const currentNode = tree.nodes[thread.current_node_id];
  if (!currentNode) {
    return { error: makeError(500, 'dialogue_missing_node'), thread: null };
  }

  return { error: null, thread };
}

interface ChoiceResult {
  error: ReplyError | null;
  chosen: any | null;
}

async function findChosenChoice(
  thread: ThreadRow,
  tree: any,
  choiceId: string,
  userId: string
): Promise<ChoiceResult> {
  const currentNode = tree.nodes[thread.current_node_id!];
  const rawChoices: any[] = currentNode.choices ?? [];
  const allowed = await applyChoiceFilters(rawChoices, userId);
  const chosen = allowed.find((c: any) => c.id === choiceId);
  if (!chosen) {
    return { error: makeError(404, 'choice_not_available'), chosen: null };
  }
  return { error: null, chosen };
}

interface SpendResult {
  error: ReplyError | null;
  spent: number;
}

async function deductTimeBlocksIfNeeded(
  client: PoolClient,
  userId: string,
  chosen: any
): Promise<SpendResult> {
  const amount = chosen.time_block_cost?.amount ?? 0;
  if (amount <= 0) {
    return { error: null, spent: 0 };
  }

  let tbResult;
  try {
    tbResult = await PlayerStateRepository.spendTimeBlocks(client, userId, amount);
  } catch {
    return { error: makeError(404, 'player_not_found'), spent: 0 };
  }
  if (!tbResult.success) {
    return { error: makeError(402, 'insufficient_time_blocks'), spent: 0 };
  }
  return { error: null, spent: amount };
}

interface ReplyStateUpdate {
  history: SMSMessage[];
  newCurrentNodeId: string | null;
  isEnd: boolean;
  npcMessageId: string | null;
  nextNode: any;
  playerMessageId: string;
}

function buildReplyStateUpdate(
  thread: ThreadRow,
  chosen: any,
  tree: any,
  now: string
): ReplyStateUpdate {
  const history: SMSMessage[] = Array.isArray(thread.chat_history)
    ? [...thread.chat_history]
    : [];

  const playerMessage: SMSMessage = {
    id: randomUUID(),
    author: 'player',
    text: chosen.text ?? '',
    createdAt: now,
    nodeId: thread.current_node_id ?? undefined,
    choiceId: chosen.id,
  };
  history.push(playerMessage);

  const nextNodeId: string | undefined = chosen.next_node_id;
  const nextNode = nextNodeId ? tree.nodes[nextNodeId] : null;

  let newCurrentNodeId: string | null = thread.current_node_id;
  let isEnd = false;
  let npcMessageId: string | null = null;

  if (nextNode) {
    newCurrentNodeId = nextNodeId!;
    isEnd = nextNode.is_end === true || !nextNode.choices || nextNode.choices.length === 0;

    if (nextNode.text) {
      const npcMessage: SMSMessage = {
        id: randomUUID(),
        author: 'npc',
        text: nextNode.text,
        createdAt: now,
        nodeId: nextNodeId,
      };
      history.push(npcMessage);
      npcMessageId = npcMessage.id;
    }
  } else {
    isEnd = true;
  }

  return {
    history,
    newCurrentNodeId,
    isEnd,
    npcMessageId,
    nextNode,
    playerMessageId: playerMessage.id,
  };
}

async function persistUpdatedThread(
  client: PoolClient,
  userId: string,
  characterId: string,
  newCurrentNodeId: string | null,
  history: SMSMessage[]
): Promise<void> {
  await client.query(
    `UPDATE player_sms_threads
       SET current_node_id = $1,
           chat_history = $2::jsonb,
           unread = TRUE,
           last_npc_message_at = NOW(),
           updated_at = NOW()
     WHERE user_id = $3 AND character_id = $4`,
    [newCurrentNodeId, JSON.stringify(history), userId, characterId]
  );
}

export async function performReplyTransaction(
  userId: string,
  characterId: string,
  choiceId: string,
  tree: any
): Promise<ReplyTransactionResult> {
  return withOLTPTransaction(async (client) => {
    const threadResult = await loadAndValidateThread(client, userId, characterId, tree);
    if (threadResult.error) return threadResult.error;
    const thread = threadResult.thread!;

    const choiceResult = await findChosenChoice(thread, tree, choiceId, userId);
    if (choiceResult.error) return choiceResult.error;
    const chosen = choiceResult.chosen!;

    let timeBlocksSpent = 0;
    if (chosen.time_block_cost?.amount > 0) {
      const spendResult = await deductTimeBlocksIfNeeded(client, userId, chosen);
      if (spendResult.error) return spendResult.error;
      timeBlocksSpent = spendResult.spent;
    }

    if (chosen.relationship_change) {
      await processRelationshipChange(
        userId,
        characterId,
        chosen.relationship_change.stat,
        chosen.relationship_change.amount
      );
    }

    const now = new Date().toISOString();
    const stateUpdate = buildReplyStateUpdate(thread, chosen, tree, now);

    await persistUpdatedThread(
      client,
      userId,
      characterId,
      stateUpdate.newCurrentNodeId,
      stateUpdate.history
    );

    return {
      status: 200 as const,
      payload: null,
      detail: {
        userId,
        characterId,
        thread,
        newCurrentNodeId: stateUpdate.newCurrentNodeId,
        isEnd: stateUpdate.isEnd,
        history: stateUpdate.history,
        npcMessageId: stateUpdate.npcMessageId,
        nextNode: stateUpdate.nextNode,
        timeBlocksSpent,
        playerMessageId: stateUpdate.playerMessageId,
        choiceId: chosen.id,
      },
    };
  }) as unknown as ReplyTransactionResult;
}

export async function emitReplyAnalytics(
  userId: string,
  characterId: string,
  detail: ReplyTransactionDetail
): Promise<void> {
  const tasks: Promise<unknown>[] = [
    queryOLAP(
      `INSERT INTO player_events (user_id, event_type, event_data)
       VALUES ($1, 'sms_reply_submitted', $2::jsonb)`,
      [userId, JSON.stringify({
        characterId,
        choiceId: detail.choiceId,
        fromNodeId: detail.thread.current_node_id,
        toNodeId: detail.newCurrentNodeId,
        timeBlocksSpent: detail.timeBlocksSpent,
      })]
    ).catch((e) => console.error('OLAP sms_reply_submitted write failed:', e)),
  ];
  if (detail.npcMessageId) {
    tasks.push(
      queryOLAP(
        `INSERT INTO player_events (user_id, event_type, event_data)
         VALUES ($1, 'sms_received', $2::jsonb)`,
        [userId, JSON.stringify({
          characterId,
          messageId: detail.npcMessageId,
          nodeId: detail.newCurrentNodeId,
        })]
      ).catch((e) => console.error('OLAP sms_received write failed:', e))
    );
  }
  await Promise.all(tasks);
}
