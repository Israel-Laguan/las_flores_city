import express, { Response, NextFunction } from 'express';
import {
  AuthRequest,
  authMiddleware,
} from '../middleware/auth.js';
import {
  queryOLTP,
} from '../database/connection.js';
import { getCache, setCache, deleteCache } from '../database/redis.js';
import { userStateCacheKey } from './player-helpers.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { performStartThreadTransaction, emitStartThreadAnalytics } from './comms-start-helpers.js';
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

export function ok<T>(data: T) {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function err(error: string, status = 400) {
  return { success: false, error, timestamp: new Date().toISOString(), status };
}

export interface ThreadRow {
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

export const THREAD_BASE_SELECT = `
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

export async function loadThread(
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

export function toDetail(row: ThreadRow, choices: SMSThreadChoice[], isEnd: boolean): SMSThreadDetail {
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

export async function findDialogueTreeForCharacter(characterId: string) {
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

export async function applyChoiceFilters(
  rawChoices: any[],
  userId: string
): Promise<any[]> {
  if (!rawChoices || rawChoices.length === 0) return [];

  const player = await PlayerStateRepository.getForChoiceFilter(userId);
  if (!player) return rawChoices;

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

export async function invalidateCaches(userId: string) {
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

      const createResult = await performStartThreadTransaction(userId, characterId, tree);
      if (createResult.status !== 200 || !createResult.threadId) {
        return res.status(createResult.status).json(createResult.payload);
      }

      await emitStartThreadAnalytics(
        userId,
        characterId,
        createResult.firstMessageId!,
        createResult.startNodeId!
      );

      await invalidateCaches(userId);

      const created = await loadThread(userId, characterId);
      if (!created) {
        return res.status(500).json(err('thread_create_failed'));
      }

      const startNode = tree.nodes[tree.start_node_id];
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
    const { characterId } = req.params as Record<string, string>;
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
