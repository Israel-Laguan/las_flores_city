import express, { Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import {
  AuthRequest,
  authMiddleware,
} from '../middleware/auth.js';
import {
  queryOLTP,
  queryOLAP,
  withOLTPTransaction,
} from '../database/connection.js';
import { getCache, setCache, deleteCache } from '../database/redis.js';
import { processRelationshipChange } from './dialogue-helpers.js';
import { userStateCacheKey } from './player-helpers.js';
import type {
  SMSMessage,
  SMSThreadPreview,
  SMSThreadDetail,
  SMSThreadChoice,
  SMSInboxResponse,
} from '../../../shared/src/types/sms.js';

export const commsRouter = express.Router();

const INBOX_TTL_SECONDS = 60;
const INBOX_CACHE_PREFIX = 'user:sms:inbox:';

function inboxCacheKey(userId: string): string {
  return `${INBOX_CACHE_PREFIX}${userId}`;
}

function ok<T>(data: T) {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function err(error: string, status = 400) {
  return { success: false, error, timestamp: new Date().toISOString(), status };
}

interface ThreadRow {
  id: string;
  user_id: string;
  character_id: string;
  current_node_id: string | null;
  chat_history: SMSMessage[];
  unread: boolean;
  last_npc_message_at: string | null;
  updated_at: string;
  character_name: string;
  character_title: string | null;
  avatar_url: string | null;
  friendship_level: number;
  romance_level: number;
}

const THREAD_BASE_SELECT = `
  SELECT
    pst.id,
    pst.user_id,
    pst.character_id,
    pst.current_node_id,
    pst.chat_history,
    pst.unread,
    pst.last_npc_message_at,
    pst.updated_at,
    c.name AS character_name,
    c.title AS character_title,
    c.avatar_url,
    COALESCE(ur.friendship_level, 0) AS friendship_level,
    COALESCE(ur.romance_level, 0) AS romance_level
  FROM player_sms_threads pst
  JOIN characters c ON c.id = pst.character_id
  LEFT JOIN user_relationships ur
    ON ur.user_id = pst.user_id AND ur.character_id = pst.character_id
`;

async function loadThread(
  userId: string,
  characterId: string
): Promise<ThreadRow | null> {
  const result = await queryOLTP<ThreadRow>(
    `${THREAD_BASE_SELECT}
     WHERE pst.user_id = $1 AND pst.character_id = $2`,
    [userId, characterId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function loadInbox(userId: string): Promise<SMSThreadPreview[]> {
  const cached = await getCache<SMSThreadPreview[]>(inboxCacheKey(userId));
  if (cached) return cached;

  const result = await queryOLTP<{
    character_id: string;
    character_name: string;
    character_title: string | null;
    avatar_url: string | null;
    chat_history: SMSMessage[];
    unread: boolean;
    last_npc_message_at: string | null;
    updated_at: string;
    friendship_level: number;
    romance_level: number;
  }>(
    `
    SELECT
      pst.character_id,
      c.name AS character_name,
      c.title AS character_title,
      c.avatar_url,
      pst.chat_history,
      pst.unread,
      pst.last_npc_message_at,
      pst.updated_at,
      COALESCE(ur.friendship_level, 0) AS friendship_level,
      COALESCE(ur.romance_level, 0) AS romance_level
    FROM player_sms_threads pst
    JOIN characters c ON c.id = pst.character_id
    LEFT JOIN user_relationships ur
      ON ur.user_id = pst.user_id AND ur.character_id = pst.character_id
    WHERE pst.user_id = $1
    ORDER BY pst.last_npc_message_at DESC NULLS LAST, pst.updated_at DESC
    `,
    [userId]
  );

  const threads: SMSThreadPreview[] = result.rows.map((row) => {
    const history = Array.isArray(row.chat_history) ? row.chat_history : [];
    const last = history.length > 0 ? history[history.length - 1] : null;
    return {
      characterId: row.character_id,
      characterName: row.character_name,
      characterTitle: row.character_title,
      avatarUrl: row.avatar_url,
      lastMessage: last,
      lastNpcMessageAt: row.last_npc_message_at,
      friendshipLevel: row.friendship_level,
      romanceLevel: row.romance_level,
      unread: row.unread,
    };
  });

  await setCache(inboxCacheKey(userId), threads, INBOX_TTL_SECONDS);
  return threads;
}

function toDetail(row: ThreadRow, choices: SMSThreadChoice[], isEnd: boolean): SMSThreadDetail {
  return {
    characterId: row.character_id,
    characterName: row.character_name,
    characterTitle: row.character_title,
    avatarUrl: row.avatar_url,
    chatHistory: Array.isArray(row.chat_history) ? row.chat_history : [],
    currentNodeId: row.current_node_id,
    isEnd,
    choices,
    friendshipLevel: row.friendship_level,
    romanceLevel: row.romance_level,
    unread: row.unread,
  };
}

async function findDialogueTreeForCharacter(characterId: string) {
  const result = await queryOLTP<{
    id: string;
    name: string;
    start_node_id: string;
    nodes: Record<string, any>;
  }>(
    `
    SELECT id, name, start_node_id, nodes
    FROM dialogue_trees dt
    WHERE EXISTS (
      SELECT 1 FROM jsonb_each(dt.nodes) AS node(key, value)
      WHERE (node.value->>'speaker_id') = $1
    )
    LIMIT 1
    `,
    [characterId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function applyChoiceFilters(
  rawChoices: any[],
  userId: string
): Promise<any[]> {
  if (!rawChoices || rawChoices.length === 0) return [];

  const playerResult = await queryOLTP<{ credits: number; flags: Record<string, boolean> }>(
    `SELECT u.credits, ps.flags
     FROM users u
     LEFT JOIN player_states ps ON u.id = ps.user_id
     WHERE u.id = $1`,
    [userId]
  );

  if (playerResult.rows.length === 0) return rawChoices;

  const player = playerResult.rows[0];
  const credits = player.credits ?? 0;
  const flags = player.flags ?? {};

  return rawChoices.filter((choice: any) => {
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

async function invalidateCaches(userId: string) {
  await Promise.all([
    deleteCache(inboxCacheKey(userId)),
    deleteCache(userStateCacheKey(userId)),
  ]);
}

// =========================================================================
// POST /comms/start - idempotently open a thread with a character
// =========================================================================
commsRouter.post(
  '/start',
  authMiddleware,
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.userId!;
    const { characterId } = req.body ?? {};

    if (!characterId || typeof characterId !== 'string') {
      return res.status(400).json(err('characterId is required'));
    }

    try {
      const characterResult = await queryOLTP<{ id: string }>(
        'SELECT id FROM characters WHERE id = $1',
        [characterId]
      );
      if (characterResult.rows.length === 0) {
        return res.status(404).json(err('character_not_found'));
      }

      const existing = await loadThread(userId, characterId);
      if (existing) {
        const tree = await findDialogueTreeForCharacter(characterId);
        const node = tree && existing.current_node_id ? tree.nodes[existing.current_node_id] : null;
        const isEnd = !node || node.is_end === true || !node.choices || node.choices.length === 0;
        const choices = node
          ? await applyChoiceFilters(node.choices ?? [], userId)
          : [];
        return res.json(ok(toDetail(existing, choices, isEnd)));
      }

      const tree = await findDialogueTreeForCharacter(characterId);
      if (!tree) {
        return res.status(404).json(err('no_dialogue_for_character'));
      }

      const startNode = tree.nodes[tree.start_node_id];
      if (!startNode) {
        return res.status(500).json(err('dialogue_missing_start_node'));
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

      await queryOLAP(
        `INSERT INTO player_events (user_id, event_type, event_data)
         VALUES ($1, 'sms_received', $2::jsonb)`,
        [userId, JSON.stringify({ characterId, messageId: firstMessage.id, nodeId: tree.start_node_id })]
      ).catch((e) => console.error('OLAP sms_received write failed:', e));

      await invalidateCaches(userId);

      const created = await loadThread(userId, characterId);
      if (!created) {
        return res.status(500).json(err('thread_create_failed'));
      }

      const choices = startNode.choices
        ? await applyChoiceFilters(startNode.choices, userId)
        : [];
      const isEnd = !startNode.choices || startNode.choices.length === 0;
      return res.json(ok(toDetail(created, choices, isEnd)));
    } catch (e: any) {
      console.error('comms.start error:', e);
      return res.status(500).json(err(e?.message ?? 'internal_error'));
    }
  }
);

// =========================================================================
// GET /comms/inbox - list active threads for the current user
// =========================================================================
commsRouter.get(
  '/inbox',
  authMiddleware,
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.userId!;
    try {
      const threads = await loadInbox(userId);
      const body: SMSInboxResponse = { threads };
      return res.json(ok(body));
    } catch (e: any) {
      console.error('comms.inbox error:', e);
      return res.status(500).json(err(e?.message ?? 'internal_error'));
    }
  }
);

// =========================================================================
// GET /comms/thread/:characterId - full thread with current node choices
// =========================================================================
commsRouter.get(
  '/thread/:characterId',
  authMiddleware,
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.userId!;
    const { characterId } = req.params;
    try {
      const thread = await loadThread(userId, characterId);
      if (!thread) {
        return res.status(404).json(err('thread_not_found'));
      }

      const tree = await findDialogueTreeForCharacter(characterId);
      const node = tree && thread.current_node_id ? tree.nodes[thread.current_node_id] : null;
      const isEnd = !node || node.is_end === true || !node.choices || node.choices.length === 0;
      const choices = node
        ? await applyChoiceFilters(node.choices ?? [], userId)
        : [];

      return res.json(ok(toDetail(thread, choices, isEnd)));
    } catch (e: any) {
      console.error('comms.thread error:', e);
      return res.status(500).json(err(e?.message ?? 'internal_error'));
    }
  }
);

// =========================================================================
// POST /comms/reply - submit a choice, advance dialogue, apply effects
// =========================================================================
commsRouter.post(
  '/reply',
  authMiddleware,
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.userId!;
    const { characterId, choiceId } = req.body ?? {};

    if (!characterId || typeof characterId !== 'string') {
      return res.status(400).json(err('characterId is required'));
    }
    if (!choiceId || typeof choiceId !== 'string') {
      return res.status(400).json(err('choiceId is required'));
    }

    try {
      const tree = await findDialogueTreeForCharacter(characterId);
      if (!tree) {
        return res.status(404).json(err('no_dialogue_for_character'));
      }

      const result = await withOLTPTransaction(async (client) => {
        const lockResult = await client.query<ThreadRow>(
          `${THREAD_BASE_SELECT}
           WHERE pst.user_id = $1 AND pst.character_id = $2
           FOR UPDATE OF pst`,
          [userId, characterId]
        );

        if (lockResult.rows.length === 0) {
          return { status: 404, payload: err('thread_not_found') };
        }

        const thread = lockResult.rows[0];
        if (!thread.current_node_id) {
          return { status: 400, payload: err('thread_has_no_active_node') };
        }

        const currentNode = tree.nodes[thread.current_node_id];
        if (!currentNode) {
          return { status: 500, payload: err('dialogue_missing_node') };
        }

        const rawChoices: any[] = currentNode.choices ?? [];
        const allowed = await applyChoiceFilters(rawChoices, userId);
        const chosen = allowed.find((c: any) => c.id === choiceId);
        if (!chosen) {
          return { status: 404, payload: err('choice_not_available') };
        }

        let timeBlocksSpent = 0;
        if (chosen.time_block_cost && chosen.time_block_cost.amount > 0) {
          const amount = chosen.time_block_cost.amount;
          const tbLock = await client.query<{ time_blocks: number }>(
            'SELECT time_blocks FROM users WHERE id = $1 FOR UPDATE',
            [userId]
          );
          if (tbLock.rows.length === 0) {
            return { status: 404, payload: err('player_not_found') };
          }
          const current = tbLock.rows[0].time_blocks;
          if (current < amount) {
            return { status: 402, payload: err('insufficient_time_blocks') };
          }
          await client.query(
            'UPDATE users SET time_blocks = time_blocks - $1 WHERE id = $2',
            [amount, userId]
          );
          timeBlocksSpent = amount;
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
        const history: SMSMessage[] = Array.isArray(thread.chat_history)
          ? [...thread.chat_history]
          : [];

        const playerMessage: SMSMessage = {
          id: randomUUID(),
          author: 'player',
          text: chosen.text ?? '',
          createdAt: now,
          nodeId: thread.current_node_id,
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
              nodeId: nextNodeId!,
            };
            history.push(npcMessage);
            npcMessageId = npcMessage.id;
          }
        } else {
          isEnd = true;
        }

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

        return {
          status: 200,
          payload: null,
          detail: {
            userId,
            characterId,
            thread,
            newCurrentNodeId,
            isEnd,
            history,
            npcMessageId,
            nextNode,
            timeBlocksSpent,
            playerMessageId: playerMessage.id,
            choiceId: chosen.id,
          } as const,
        };
      });

      if (result.status !== 200 || !('detail' in result)) {
        return res.status(result.status).json(result.payload);
      }

      const d = result.detail!;

      await Promise.all([
        queryOLAP(
          `INSERT INTO player_events (user_id, event_type, event_data)
           VALUES ($1, 'sms_reply_submitted', $2::jsonb)`,
          [userId, JSON.stringify({ characterId, choiceId: d.choiceId, fromNodeId: d.thread.current_node_id, toNodeId: d.newCurrentNodeId, timeBlocksSpent: d.timeBlocksSpent })]
        ).catch((e) => console.error('OLAP sms_reply_submitted write failed:', e)),
        d.npcMessageId
          ? queryOLAP(
              `INSERT INTO player_events (user_id, event_type, event_data)
               VALUES ($1, 'sms_received', $2::jsonb)`,
              [userId, JSON.stringify({ characterId, messageId: d.npcMessageId, nodeId: d.newCurrentNodeId })]
            ).catch((e) => console.error('OLAP sms_received write failed:', e))
          : Promise.resolve(),
      ]);

      await invalidateCaches(userId);

      const reloaded = await loadThread(userId, characterId);
      if (!reloaded) {
        return res.status(500).json(err('thread_disappeared'));
      }

      const nextChoicesRaw: any[] =
        d.isEnd || !d.nextNode || !d.nextNode.choices ? [] : d.nextNode.choices;
      const nextChoices = await applyChoiceFilters(nextChoicesRaw, userId);

      return res.json(ok(toDetail(reloaded, nextChoices, d.isEnd)));
    } catch (e: any) {
      console.error('comms.reply error:', e);
      return res.status(500).json(err(e?.message ?? 'internal_error'));
    }
  }
);

// =========================================================================
// POST /comms/read - mark a thread as read
// =========================================================================
commsRouter.post(
  '/read',
  authMiddleware,
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.userId!;
    const { characterId } = req.body ?? {};

    if (!characterId || typeof characterId !== 'string') {
      return res.status(400).json(err('characterId is required'));
    }

    try {
      const result = await queryOLTP(
        `UPDATE player_sms_threads
           SET unread = FALSE
         WHERE user_id = $1 AND character_id = $2`,
        [userId, characterId]
      );

      await invalidateCaches(userId);

      return res.json(ok({ updated: result.rowCount ?? 0 }));
    } catch (e: any) {
      console.error('comms.read error:', e);
      return res.status(500).json(err(e?.message ?? 'internal_error'));
    }
  }
);
