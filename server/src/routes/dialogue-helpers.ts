import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import { DialogueResolver } from '../services/DialogueResolver.js';
import {
  processBreakthroughSolve,
  type BreakthroughResult,
} from './dialogue-breakthrough-helpers.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import type { DialogueChoice, PlayerConditionState } from '@las-flores/shared';
import { choicePassesFilters, metadataConditionsPass } from '@las-flores/shared';
import { fetchNodesFromContentUrl } from '../services/contentFetch.js';

/**
 * M32/M23: load a dialogue tree's row (without the dropped `nodes` JSONB
 * column) and hydrate its node map from the CDN via `content_url`. Returns
 * the row augmented with `nodes`, or null if the row is missing / has no
 * reachable blob. This is the replacement for reading `dialogue_trees.nodes`
 * directly in SQL.
 */
async function loadTreeWithNodes(treeId: string): Promise<{
  id: string;
  name: string;
  description: string | null;
  start_node_id: string;
  metadata: any;
  content_url: string | null;
  nodes: Record<string, any>;
} | null> {
  const result = await queryOLTP<{
    id: string;
    name: string;
    description: string | null;
    start_node_id: string;
    metadata: any;
    content_url: string | null;
  }>(
    `SELECT id, name, description, start_node_id, metadata, content_url
     FROM dialogue_trees WHERE id = $1`,
    [treeId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (!row.content_url) return null;
  const nodes = await fetchNodesFromContentUrl(row.content_url, {});
  if (!nodes || Object.keys(nodes).length === 0) return null;
  return { ...row, nodes };
}

// ============================================================
// Shared effect application pipeline
// ============================================================

/**
 * Apply EffectsSchema-validated effects to player_states atomically.
 * Reused by both the dialogue-choice path (recordChoiceAndEffects)
 * and the guarded-leaf path (IronGateValidator._validateEffects).
 */
export async function applyEffects(
  client: any,
  userId: string,
  effects: any
): Promise<void> {
  if (!effects) return;

  if (effects.flag_set && Object.keys(effects.flag_set).length > 0) {
    await PlayerStateRepository.mergeFlags(client, userId, effects.flag_set);
  }
  if (effects.state_set && Object.keys(effects.state_set).length > 0) {
    // Replace special "NOW" marker with current ISO timestamp for relationship tracking.
    const stateWithTimestamps: Record<string, string> = Object.fromEntries(
      Object.entries(effects.state_set).map(([key, value]) => [
        key,
        value === 'NOW' ? new Date().toISOString() : String(value),
      ])
    );
    await PlayerStateRepository.mergeState(client, userId, stateWithTimestamps);
  }
  if (effects.stat_set && Object.keys(effects.stat_set).length > 0) {
    await PlayerStateRepository.mergeStatsClamped(client, userId, effects.stat_set);
  }
  if (effects.story_beat) {
    await PlayerStateRepository.setStoryBeat(client, userId, effects.story_beat);
  }
}

/* eslint-disable max-lines -- dialogue route helpers are cohesively grouped in one module */

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
  // Build a typed condition snapshot (flags/state/stats) for both
  // the story-beat gate and the metadata.required_* stat/state gate.
  // Empty when there is no user / no player row yet (anonymous
  // resolution skips stat gating — a stat gate can't be satisfied
  // without a player, but trees without required_* metadata still
  // resolve, preserving prior no-userId behavior).
  let playerCondition: PlayerConditionState = { flags: {}, state: {}, stats: {}, timeBlocks: 0 };
  if (userId) {
    const playerRow = await PlayerStateRepository.getFullState(userId);
    storyBeat = playerRow?.story_beat || 'prologue';
    if (playerRow) {
      playerCondition = {
        flags: playerRow.flags || {},
        state: playerRow.state || {},
        stats: playerRow.stats || {},
        timeBlocks: playerRow.time_blocks || 0,
      };
    }
  }

  // Fetch all scene-scoped candidates first (no LIMIT 1), then
  // evaluate gates in Node so an ineligible LIMIT-1 row cannot
  // prevent an eligible alternative from being considered.
  // Preserve the scene's configured ordering by joining
  // `s.available_dialogues` WITH ORDINALITY and ordering by that
  // position — PostgreSQL does not guarantee row order without an
  // explicit ORDER BY, so without this identical player state could
  // start different trees when a scene lists multiple eligible
  // dialogues for the same character.
  const sceneResult = await queryOLTP<{ dialogue_id: string }>(
    `SELECT ad.dialogue_id
     FROM scenes s
     JOIN LATERAL unnest(s.available_dialogues) WITH ORDINALITY AS ad(dialogue_id, ord) ON true
     WHERE s.id = $1
     ORDER BY ad.ord`,
    [sceneId]
  );

  for (const { dialogue_id } of sceneResult.rows) {
    const tree = await loadTreeWithNodes(dialogue_id);
    if (!tree) continue;
    const hasSpeaker = Object.values(tree.nodes).some(
      (n: any) => n && n.speaker_id === characterId
    );
    if (!hasSpeaker) continue;
    if (
      isStoryBeatAllowed(tree.metadata?.required_story_beat, storyBeat) &&
      metadataConditionsPass(tree.metadata, playerCondition)
    ) {
      return tree;
    }
    // Gated: continue to the next candidate; only fall through
    // to the fallback if no scene-scoped tree passes all gates.
  }

    // Also include trees with NULL character_id (scene/onboarding-scoped trees
  // whose speaker is encoded in CDN node maps, not the FK). Migration 057
  // left character_id nullable without backfilling, so a speaker-based
  // fallback is required to find these trees.
  const fallbackResult = await queryOLTP<{ id: string }>(
    `SELECT id FROM dialogue_trees
      WHERE character_id = $1 OR character_id IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT 10`,
    [characterId]
  );

  for (const { id } of fallbackResult.rows) {
    const tree = await loadTreeWithNodes(id);
    if (!tree) continue;
    const startNode = tree.nodes[tree.start_node_id];
    if (!(startNode && startNode.speaker_id === characterId)) continue;
    if (
      !isStoryBeatAllowed(tree.metadata?.required_story_beat, storyBeat) ||
      !metadataConditionsPass(tree.metadata, playerCondition)
    ) {
      continue;
    }
    return tree;
  }
  return null;
}

export async function filterChoices(choices: any[], userId: string) {
  if (!choices || choices.length === 0) return [];

  const player = await PlayerStateRepository.getForChoiceFilter(userId);
  if (!player) return choices;

  // Single source of truth: shared choicePassesFilters evaluates
  // boolean flags (presence), categorical state (string ===), and
  // numeric stats (op:number) across required_*/hidden_if_* plus the
  // time_block_cost credit gate. Replaces the prior boolean-only ===
  // loop that could not match "gt:50"-style numeric thresholds.
  const playerState: PlayerConditionState = {
    flags: player.flags || {},
    state: player.state || {},
    stats: player.stats || {},
    timeBlocks: player.time_blocks || 0,
  };

  return choices.filter((choice: any) => choicePassesFilters(choice, playerState));
}

/**
 * Deduct time blocks INSIDE the caller's open transaction.
 *
 * The `client` is mandatory: spending TB on a separate pooled
 * connection would commit the deduction independently of the
 * surrounding choice transaction, so a later rollback could not
 * refund it (and, symmetrically, a rejected choice could keep
 * state the same transaction already wrote).
 */
export async function processTimeBlockCost(
  client: any,
  userId: string,
  amount: number
): Promise<{ success: boolean; error?: string; spent?: number }> {
  const result = await PlayerStateRepository.spendTimeBlocks(client, userId, amount);
  if (!result.success) {
    return { success: false, error: 'insufficient_blocks' };
  }
  return { success: true, spent: amount };
}

export async function processRelationshipChange(
  client: any,
  userId: string,
  speakerId: string,
  stat: string,
  amount: number
): Promise<void> {
  const friendshipDelta = stat === 'friendship' ? amount : 0;
  const romanceDelta = stat === 'romance' ? amount : 0;

  await client.query(
    'SELECT upsert_user_relationship($1, $2, $3, $4)',
    [userId, speakerId, friendshipDelta, romanceDelta]
  );
}

/**
 * Atomically claim a reward for a dialogue node. Returns true if this
 * is the first claim (grants should proceed), false if already claimed
 * (grants should be skipped).
 *
 * The full `claimKey` is passed by the caller so each effect path can
 * use a distinct, collision-free key (node-rewards, choice-rewards,
 * root-rewards) WITHOUT changing existing keys — preserving the
 * idempotency of already-claimed rewards for production users.
 */
export async function tryClaimReward(
  client: any,
  userId: string,
  claimKey: string,
  dialogueId: string,
  nodeId: string
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO mission_reward_claims (user_id, claim_key, dialogue_id, node_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (claim_key) DO NOTHING
     RETURNING id`,
    [userId, claimKey, dialogueId, nodeId]
  );
  return result.rows.length > 0;
}

/**
 * Apply M15 reward grants (grant_credits / grant_item) idempotently.
 *
 * Centralized here so every effect path — selected-choice effects,
 * fallback-root effects, chunk-root effects, and destination-node
 * effects — flows rewards through ONE mechanism instead of each call
 * site duplicating the grant logic (which previously left choice-level
 * and root-level reward effects silently dropped, since `applyEffects`
 * only handles flag/state/stat/story_beat mutations).
 *
 * Each caller passes a unique `claimKeyPrefix` + `nodeId` so the claim
 * key never collides across paths:
 *   - destination-node rewards: `grant`     → `grant_<u>_<d>_<nextNodeId>`  (unchanged)
 *   - choice-level rewards:     `grant_choice` → `grant_choice_<u>_<d>_<choiceId>[_<currentNodeId>]`  (new)
 *   - root-level rewards:       `grant_root`  → `grant_root_<u>_<d>_<rootNodeId>`   (new)
 * The optional `claimScope` appends a suffix to disambiguate otherwise
 * identical keys — e.g. the same choice id reused on multiple nodes — so
 * their rewards stay independently claimable. The destination-node key is
 * byte-for-byte identical to the previous inline key, so already-claimed
 * node rewards stay idempotent.
 */
export async function grantDialogueRewards(
  client: any,
  userId: string,
  dialogueId: string,
  nodeId: string,
  effects: any,
  claimKeyPrefix: string = 'grant',
  claimScope?: string
): Promise<{ grantedCredits?: { amount: number; currency: string }; grantedItem?: { itemId: string } }> {
  let grantedCredits: { amount: number; currency: string } | undefined;
  let grantedItem: { itemId: string } | undefined;

  if (effects?.grant_credits || effects?.grant_item) {
    const scopeSuffix = claimScope ? `_${claimScope}` : '';
    const claimKey = `${claimKeyPrefix}_${userId}_${dialogueId}_${nodeId}${scopeSuffix}`;
    const isFirstClaim = await tryClaimReward(client, userId, claimKey, dialogueId, nodeId);
    if (isFirstClaim) {
      if (effects.grant_credits) {
        const creditsDelta = effects.grant_credits.currency === 'gold_credits' ? undefined : effects.grant_credits.amount;
        const goldDelta = effects.grant_credits.currency === 'gold_credits' ? effects.grant_credits.amount : undefined;
        await PlayerStateRepository.modifyBalance(client, userId, creditsDelta, goldDelta);
        grantedCredits = effects.grant_credits;
      }
      if (effects.grant_item) {
        // RETURNING distinguishes a real insert from an ON CONFLICT no-op:
        // the player may already own this item (granted via vault_unlock or
        // another node), in which case nothing was actually granted and the
        // response/telemetry must not claim otherwise.
        const vaultResult = await client.query(
          `INSERT INTO player_vault (user_id, item_id) VALUES ($1, $2) ON CONFLICT (user_id, item_id) DO NOTHING RETURNING item_id`,
          [userId, effects.grant_item]
        );
        if (vaultResult.rows.length > 0) {
          grantedItem = { itemId: effects.grant_item };
        }
      }
    }
  }

  return { grantedCredits, grantedItem };
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
): Promise<{ grantedCredits?: { amount: number; currency: string }; grantedItem?: { itemId: string } }> {
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
  // Reuses the shared pipeline so NOW handling + clamping are
  // identical between the dialogue-choice path and IronGateValidator.
  const effects = nextNode.effects;
  await applyEffects(client, userId, effects);
  // M15: grant destination-node rewards idempotently via the shared
  // helper (claim key `grant_<u>_<d>_<nextNodeId>` is unchanged).
  return grantDialogueRewards(client, userId, dialogueId, nextNodeId, effects, 'grant');
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
  client: any,
  userId: string,
  nextNode: any,
  chosenOption: DialogueChoice
): Promise<{ isEnd: boolean }> {
  if (chosenOption.relationship_change) {
    const speakerId = nextNode.speaker_id;
    if (speakerId) {
      await processRelationshipChange(
        client,
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

// ============================================================
// ChoiceFailureError
//
// Thrown when a choice is rejected mid-processing (bad next node,
// stale vault reference, insufficient time blocks). `processChoice`
// mutates player state as it goes — the vault insert, the TB
// deduction, choice/node effects — so returning `{ success: false }`
// from inside `withOLTPTransaction` would COMMIT everything applied
// before the rejection (e.g. handing over a vault item on a choice
// the player could not afford). Throwing makes the transaction roll
// back; `processChoiceInTransaction` catches it and maps it back to
// a `{ success: false, error }` result for the route handlers.
//
// Mirrors GuardFailureError in IronGateValidator (chunk-boundary path).
// ============================================================
export class ChoiceFailureError extends Error {
  constructor(public errorCode: ChoiceFailureCode) {
    super(`Choice rejected: ${errorCode}`);
    this.name = 'ChoiceFailureError';
  }
}

export type ChoiceFailureCode =
  | 'invalid_next_node'
  | 'invalid_vault_item'
  | 'insufficient_time_blocks';

export interface ProcessChoiceResult {
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
  grantedCredits?: { amount: number; currency: string };
  grantedItem?: { itemId: string };
}

/**
 * Run `processChoice` in a single OLTP transaction with all-or-nothing
 * semantics: every mutation it performs (vault unlock, TB deduction,
 * choice + node effects, reward claims, cursor advance) either commits
 * together or is rolled back together.
 *
 * Route handlers must use this instead of wrapping `processChoice` in
 * their own `withOLTPTransaction`, because a plain callback return
 * commits — which is exactly how a rejected choice used to keep its
 * already-applied side effects.
 */
export async function processChoiceInTransaction(
  userId: string,
  dialogueId: string,
  choiceIndex: number,
  chosenOption: DialogueChoice,
  currentNodeId: string,
  nodes: any
): Promise<ProcessChoiceResult> {
  try {
    return await withOLTPTransaction((client) =>
      processChoice(client, userId, dialogueId, choiceIndex, chosenOption, currentNodeId, nodes)
    );
  } catch (err) {
    if (err instanceof ChoiceFailureError) {
      return { success: false, error: err.errorCode };
    }
    throw err;
  }
}

export async function processChoice(
  client: any,
  userId: string,
  dialogueId: string,
  choiceIndex: number,
  chosenOption: DialogueChoice,
  currentNodeId: string,
  nodes: any
): Promise<ProcessChoiceResult> {
  let timeBlocksSpent = 0;

  const nextNodeId = chosenOption.next_node_id;
  const nextNode = nodes[nextNodeId];

  if (!nextNode) {
    throw new ChoiceFailureError('invalid_next_node');
  }

  // Validate + unlock the vault BEFORE charging time blocks or mutating
  // relationship state. A stale or missing vault reference must fail fast
  // so retrying the rejected choice cannot repeatedly consume time blocks
  // or accumulate relationship deltas.
  //
  // The insert is safe to run first ONLY because every rejection below
  // throws: a failed TB guard rolls this transaction back, so the player
  // never keeps a gated item they did not pay for.
  let unlockedVaultItem: { id: string; title: string } | undefined;
  if (chosenOption.vault_unlock) {
    const result = await processVaultUnlock(client, userId, chosenOption.vault_unlock);
    if (!result) {
      throw new ChoiceFailureError('invalid_vault_item');
    }
    unlockedVaultItem = result;
  }

  if (chosenOption.time_block_cost && chosenOption.time_block_cost.amount > 0) {
    // Deducted on the SAME client/transaction as the vault insert above,
    // so the two can never diverge (item granted but TB never charged, or
    // TB charged but the choice rolled back).
    const tbResult = await processTimeBlockCost(client, userId, chosenOption.time_block_cost.amount);
    if (!tbResult.success) {
      throw new ChoiceFailureError('insufficient_time_blocks');
    }
    timeBlocksSpent = tbResult.spent ?? 0;
  }

  const { isEnd } = await processRelationshipAndCheckEnd(client, userId, nextNode, chosenOption);

  // Apply the choice's own effects (choice-level stat_set/flag_set/state_set)
  // BEFORE the destination node's effects. Both go through the shared
  // applyEffects pipeline so NOW handling + clamping are identical.
  // stat_set deltas accumulate from both; flag_set/state_set follow
  // overwrite semantics (node effects applied last take precedence).
  // Choice-level grant_credits / grant_item also flow through the shared
  // idempotent reward helper (distinct `grant_choice` claim key) so they
  // are no longer silently dropped when a choice carries reward effects.
  let choiceRewards: { grantedCredits?: { amount: number; currency: string }; grantedItem?: { itemId: string } } = {};
  if (chosenOption.effects) {
    await applyEffects(client, userId, chosenOption.effects);
    choiceRewards = await grantDialogueRewards(
      client,
      userId,
      dialogueId,
      chosenOption.id,
      chosenOption.effects,
      'grant_choice',
      currentNodeId
    );
  }

  const { grantedCredits: nodeCredits, grantedItem: nodeItem } = await recordChoiceAndEffects(
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

  // Surface whichever rewards were granted (choice-level rewards take
  // precedence if the choice carried them; otherwise the destination
  // node's rewards). In practice content authors attach grants to one
  // of the two, not both.
  return {
    success: true,
    timeBlocksSpent,
    unlockedVaultItem,
    mysterySolveStatus,
    breakthrough,
    alignmentChange,
    grantedCredits: choiceRewards.grantedCredits ?? nodeCredits,
    grantedItem: choiceRewards.grantedItem ?? nodeItem,
  };
}
