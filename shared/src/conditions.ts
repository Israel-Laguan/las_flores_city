// ============================================================
// Choice condition evaluator — single source of truth
//
// `filterChoices` (server/src/routes/dialogue-helpers.ts) and
// `applyChoiceFilters` (server/src/routes/comms.ts) previously
// duplicated a strict-`===` check that only handled boolean flags.
// This module replaces both with one pure evaluator that supports
// the three typed condition kinds defined in schemas/dialogue.ts:
//
//   flags  — boolean presence   (required_flags / hidden_if)
//   state  — string equality    (required_state / hidden_if_state)
//   stats  — op:number compare  (required_stats / hidden_if_stats)
//
// Fail-closed: a required gate referencing a missing key fails
// (missing stat is treated as 0, so "gt:0" fails until earned).
// ============================================================

export interface PlayerConditionState {
  flags: Record<string, boolean>;
  state: Record<string, string>;
  stats: Record<string, number>;
  timeBlocks: number;
}

export interface ConditionedChoice {
  required_flags?: Record<string, boolean>;
  hidden_if?: Record<string, boolean>;
  required_state?: Record<string, string>;
  hidden_if_state?: Record<string, string>;
  required_stats?: Record<string, string>; // "op:number" strings
  hidden_if_stats?: Record<string, string>; // "op:number" strings
  time_block_cost?: { amount: number };
}

const COMPARISON_RE = /^(gt|lt|gte|lte|eq|ne):(-?\d+)$/;

export interface ParsedComparison {
  op: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'ne';
  n: number;
}

/** Parse "gt:50" → { op: 'gt', n: 50 }. Returns null if malformed. */
export function parseNumericComparison(value: string): ParsedComparison | null {
  const match = COMPARISON_RE.exec(value);
  if (!match) return null;
  return { op: match[1] as ParsedComparison['op'], n: Number(match[2]) };
}

/** Apply a parsed comparison to an actual number. */
export function compareNumber(actual: number, parsed: ParsedComparison): boolean {
  switch (parsed.op) {
    case 'gt':
      return actual > parsed.n;
    case 'lt':
      return actual < parsed.n;
    case 'gte':
      return actual >= parsed.n;
    case 'lte':
      return actual <= parsed.n;
    case 'eq':
      return actual === parsed.n;
    case 'ne':
      return actual !== parsed.n;
    default:
      return false;
  }
}

/** Evaluate a required_* map (ALL must pass). */
function requiredPasses(
  map: Record<string, unknown> | undefined,
  actual: Record<string, unknown> | undefined,
  kind: 'flags' | 'state' | 'stats'
): boolean {
  if (!map) return true;
  const entries = Object.entries(map);
  if (entries.length === 0) return true;
  for (const [key, expected] of entries) {
    if (kind === 'stats') {
      // expected is an "op:number" string; missing stat counts as 0.
      const parsed = parseNumericComparison(String(expected));
      if (!parsed) return false; // malformed gate → fail closed
      const actualNum = typeof actual?.[key] === 'number' ? (actual[key] as number) : 0;
      if (!compareNumber(actualNum, parsed)) return false;
    } else {
      // boolean presence or string equality; missing → fail closed.
      if (actual?.[key] !== expected) return false;
    }
  }
  return true;
}

/** Evaluate a hidden_if_* map (ANY match hides the choice). */
function hiddenMatches(
  map: Record<string, unknown> | undefined,
  actual: Record<string, unknown> | undefined,
  kind: 'flags' | 'state' | 'stats'
): boolean {
  if (!map) return false;
  for (const [key, value] of Object.entries(map)) {
    if (kind === 'stats') {
      const parsed = parseNumericComparison(String(value));
      if (!parsed) continue; // malformed → never hides (safe default)
      const actualNum = typeof actual?.[key] === 'number' ? (actual[key] as number) : 0;
      if (compareNumber(actualNum, parsed)) return true;
    } else {
      if (actual?.[key] === value) return true;
    }
  }
  return false;
}

/**
 * Decide whether a choice should be shown to the player, given their
 * flags/state/stats and current credit balance. Pure — no I/O.
 */
export function choicePassesFilters(
  choice: ConditionedChoice,
  player: PlayerConditionState,
  credits: number
): boolean {
  if (!requiredPasses(choice.required_flags, player.flags, 'flags')) return false;
  if (!requiredPasses(choice.required_state, player.state, 'state')) return false;
  if (!requiredPasses(choice.required_stats, player.stats, 'stats')) return false;

  if (hiddenMatches(choice.hidden_if, player.flags, 'flags')) return false;
  if (hiddenMatches(choice.hidden_if_state, player.state, 'state')) return false;
  if (hiddenMatches(choice.hidden_if_stats, player.stats, 'stats')) return false;

  if (choice.time_block_cost && choice.time_block_cost.amount > 0) {
    if (player.timeBlocks < choice.time_block_cost.amount) return false;
  }

  return true;
}

/**
 * Evaluate tree-level `metadata.required_*` gates (mirrors
 * `isStoryBeatAllowed` for story_beat). Used by resolveDialogueTree
 * so a stat-gated tree (e.g. `metadata.required_stats: sofia_trust: "gt:0"`)
 * is actually enforced, not just validated.
 */
export function metadataConditionsPass(
  metadata: Record<string, any> | undefined,
  player: PlayerConditionState
): boolean {
  if (!metadata) return true;
  if (!requiredPasses(metadata.required_flags, player.flags, 'flags')) return false;
  if (!requiredPasses(metadata.required_state, player.state, 'state')) return false;
  if (!requiredPasses(metadata.required_stats, player.stats, 'stats')) return false;
  return true;
}
