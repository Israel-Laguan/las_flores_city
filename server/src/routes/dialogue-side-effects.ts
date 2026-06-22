import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { deleteCache, invalidatePattern } from '../database/redis.js';
import { userStateCacheKey } from './player-helpers.js';
import { emitBreakthroughSideEffects } from './dialogue-breakthrough-helpers.js';
import { joinMystery } from './dialogue-helpers.js';

export async function handleAlignmentSideEffects(userId: string, alignmentChange: 'loyalist' | 'fugitive' | undefined, choiceId: string, dialogueId: string) {
  if (!alignmentChange) return;
  queryOLTP(
    `INSERT INTO player_events (id, user_id, event_type, event_data)
     VALUES (gen_random_uuid(), $1, 'alignment_locked', $2)`,
    [userId, JSON.stringify({ alignment: alignmentChange, dialogue_tree_id: dialogueId, choice_id: choiceId })],
  ).catch((err) => console.error('Alignment lock telemetry error:', err));
  await deleteCache(userStateCacheKey(userId));
  await invalidatePattern('dialogue:resolved:*');
}

export async function handleBreakthroughSideEffects(userId: string, breakthrough: any) {
  if (breakthrough && breakthrough.kind !== 'unrelated') {
    await emitBreakthroughSideEffects(userId, breakthrough);
  }
}

export async function handleJoinMystery(choices: any[], choiceId: string, userId: string) {
  const choice = choices.find((c: any) => c.id === choiceId);
  if (!choice?.join_mystery) return;
  const joinAction = choice.join_mystery;
  const mysteryId = Array.isArray(joinAction) ? joinAction[0] : joinAction;
  if (!mysteryId) return;
  await withOLTPTransaction(async (client) => {
    await joinMystery(client, userId, mysteryId);
  });
  await invalidatePattern('dialogue:resolved:*');
}
