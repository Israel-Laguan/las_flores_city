import { randomUUID } from 'crypto';
import { queryOLTP, queryOLAP } from '../database/connection.js';
import type { SMSMessage } from '../../../shared/src/types/sms.js';

export interface StartThreadTransactionResult {
  status: number;
  payload: { success: false; error: string; timestamp: string; status: number } | null;
  threadId?: string;
  firstMessageId?: string;
  startNodeId?: string;
}

export async function performStartThreadTransaction(
  userId: string,
  characterId: string,
  tree: { start_node_id: string; nodes: Record<string, any> }
): Promise<StartThreadTransactionResult> {
  const errorPayload = (error: string): { success: false; error: string; timestamp: string; status: number } => ({
    success: false,
    error,
    timestamp: new Date().toISOString(),
    status: 0,
  });

  const startNode = tree.nodes[tree.start_node_id];
  if (!startNode) {
    return { status: 500, payload: errorPayload('dialogue_missing_start_node') };
  }

  const firstMessage: SMSMessage = {
    id: randomUUID(),
    author: 'npc',
    text: startNode.text ?? '',
    createdAt: new Date().toISOString(),
    nodeId: tree.start_node_id,
  };

  const insertResult = await queryOLTP<{ id: string; created_at: string; updated_at: string }>(
    `INSERT INTO player_sms_threads
       (user_id, character_id, current_node_id, chat_history, unread, last_npc_message_at)
     VALUES ($1, $2, $3, $4::jsonb, TRUE, NOW())
     RETURNING id, created_at, updated_at`,
    [
      userId,
      characterId,
      tree.start_node_id,
      JSON.stringify([firstMessage]),
    ]
  );

  return {
    status: 200,
    payload: null,
    threadId: insertResult.rows[0].id,
    firstMessageId: firstMessage.id,
    startNodeId: tree.start_node_id,
  };
}

export async function emitStartThreadAnalytics(
  userId: string,
  characterId: string,
  firstMessageId: string,
  startNodeId: string
): Promise<void> {
  await queryOLAP(
    `INSERT INTO player_events (user_id, event_type, event_data)
     VALUES ($1, 'sms_received', $2::jsonb)`,
    [userId, JSON.stringify({ characterId, messageId: firstMessageId, nodeId: startNodeId })]
  ).catch((e) => console.error('OLAP sms_received write failed:', e));
}
