import express, { Response, NextFunction } from 'express';
import {
  AuthRequest,
  authMiddleware,
} from '../middleware/auth.js';
import {
  queryOLTP,
} from '@las-flores/infra';
import { getCache, setCache, deleteCache } from '@las-flores/infra';
import { userStateCacheKey } from './player-helpers.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import { performStartThreadTransaction, emitStartThreadAnalytics } from './comms-start-helpers.js';
import { getRelationshipForFilter } from '../database/repositories/RelationshipRepository.js';
import { snapshotToConditionState } from './dialogue-helpers.js';
import type {
  SMSMessage,
  SMSThreadPreview,
  SMSThreadDetail,
  SMSThreadChoice,
  SMSInboxResponse,
} from '../../../shared/src/types/sms.js';
import {
  choicePassesFilters,
  relationshipPassesFilters,
  type PlayerConditionState,
  type RelationshipStateByTarget,
} from '@las-flores/shared';
import { fetchNodesFromContentUrl } from '../services/contentFetch.js';

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
  trust: number;
  familiarity: number;
  alignment: number;
  tension: number;
  debt: number;
  visibility: number;
  bond_level: number;
  daily_vibe: number;
  relationship_status: string;
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
    COALESCE(ur.romance_level, 0) AS romance_level,
    COALESCE(ur.trust, 0) AS trust,
    COALESCE(ur.familiarity, 0) AS familiarity,
    COALESCE(ur.alignment, 0) AS alignment,
    COALESCE(ur.tension, 0) AS tension,
    COALESCE(ur.debt, 0) AS debt,
    COALESCE(ur.visibility, 0) AS visibility,
    COALESCE(ur.bond_level, 0) AS bond_level,
    COALESCE(ur.daily_vibe, 0) AS daily_vibe,
    COALESCE(ur.status, 'STRANGER') AS relationship_status
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
    trust: number;
    familiarity: number;
    alignment: number;
    tension: number;
    debt: number;
    visibility: number;
    bond_level: number;
    daily_vibe: number;
    relationship_status: string;
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
      COALESCE(ur.romance_level, 0) AS romance_level,
      COALESCE(ur.trust, 0) AS trust,
      COALESCE(ur.familiarity, 0) AS familiarity,
      COALESCE(ur.alignment, 0) AS alignment,
      COALESCE(ur.tension, 0) AS tension,
      COALESCE(ur.debt, 0) AS debt,
      COALESCE(ur.visibility, 0) AS visibility,
      COALESCE(ur.bond_level, 0) AS bond_level,
      COALESCE(ur.daily_vibe, 0) AS daily_vibe,
      COALESCE(ur.status, 'STRANGER') AS relationship_status
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
      relationship: relationshipSummary(row),
      unread: row.unread,
    };
  });

  await setCache(inboxCacheKey(userId), threads, INBOX_TTL_SECONDS);
  return threads;
}

function relationshipSummary(row: Pick<ThreadRow, 'friendship_level' | 'romance_level' | 'trust' | 'familiarity' | 'alignment' | 'tension' | 'debt' | 'visibility' | 'bond_level' | 'daily_vibe' | 'relationship_status'>) {
  return {
    friendshipLevel: row.friendship_level,
    romanceLevel: row.romance_level,
    bondLevel: row.bond_level,
    dailyVibe: row.daily_vibe,
    status: row.relationship_status,
    axes: {
      trust: row.trust,
      familiarity: row.familiarity,
      alignment: row.alignment,
      tension: row.tension,
      debt: row.debt,
      visibility: row.visibility,
    },
  };
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
    relationship: relationshipSummary(row),
    unread: row.unread,
  };
}

export async function findDialogueTreeForCharacter(characterId: string) {
  // M32/M23: the tree node map is externalized to the CDN (content_url);
  // the in-DB `nodes` JSONB column is dropped. We pre-filter by the tree's
  // character FK (the speaking character) and confirm a node's `speaker_id`
  // in the loaded blob — preserving the prior `jsonb_each(dt.nodes)`
  // speaker lookup semantics without touching the dropped column.
  //
  // Some scene/onboarding-scoped trees have NULL character_id (they carry
  // the speaker in the CDN node map, not the FK). The character_id filter
  // excludes those, so we also query trees with NULL character_id and rely
  // on the node-level speaker_id check below to preserve the old lookup.
  const result = await queryOLTP<{
    id: string;
    name: string;
    start_node_id: string;
    content_url: string | null;
  }>(
    `SELECT id, name, start_node_id, content_url
     FROM dialogue_trees dt
     WHERE dt.character_id = $1
        OR (dt.character_id IS NULL AND dt.dialogue_scope IN ('onboarding', 'system'))
     ORDER BY (dt.character_id = $1) DESC, dt.created_at ASC, dt.id ASC`,
    [characterId]
  );

  for (const row of result.rows) {
    if (!row.content_url) continue;
    const nodes = await fetchNodesFromContentUrl(row.content_url, {});
    if (!nodes || Object.keys(nodes).length === 0) continue;
    const hasSpeaker = Object.values(nodes).some(
      (n: any) => n && n.speaker_id === characterId
    );
    if (hasSpeaker) {
      return {
        id: row.id,
        name: row.name,
        start_node_id: row.start_node_id,
        nodes,
      };
    }
  }
  return null;
}

export async function applyChoiceFilters(
  rawChoices: any[],
  userId: string,
  characterId?: string
): Promise<any[]> {
  if (!rawChoices || rawChoices.length === 0) return [];

  const player = await PlayerStateRepository.getForChoiceFilter(userId);
  if (!player) return rawChoices;

  // Shared evaluator (see filterChoices in dialogue-helpers.ts).
  const playerState: PlayerConditionState = {
    flags: player.flags ?? {},
    state: player.state ?? {},
    stats: player.stats ?? {},
    timeBlocks: player.time_blocks ?? 0,
  };

  // M48: load the thread character's relationship state once and
  // evaluate relationship/posture gates (mirrors filterChoices).
  let relStateByTarget: RelationshipStateByTarget = {};
  if (characterId) {
    const snap = await getRelationshipForFilter(userId, characterId);
    relStateByTarget = { [characterId]: snapshotToConditionState(snap) };
  }

  return rawChoices.filter(
    (choice: any) =>
      choicePassesFilters(choice, playerState) &&
      relationshipPassesFilters(choice, relStateByTarget, characterId)
  );
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
          ? await applyChoiceFilters(node.choices ?? [], userId, characterId)
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
        ? await applyChoiceFilters(startNode.choices, userId, characterId)
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
        ? await applyChoiceFilters(node.choices ?? [], userId, characterId)
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
