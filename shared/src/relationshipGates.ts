// ============================================================
// Relationship gate evaluator (M48) — single source of truth
//
// Mirrors `choicePassesFilters` (conditions.ts) but gates against
// the target character's canonical `user_relationships` row instead
// of player-state stats. Pure: no I/O. The server builds a per-request
// `{ [targetCharacterId]: RelationshipConditionState | null }` map
// (one pool read per distinct target) and passes it in.
//
// Fail-closed by default:
//  - `required_relationship` with no row ⇒ choice hidden (unless
//    `neutral_default`, then evaluated against a STRANGER/zero baseline).
//  - `hidden_if_relationship` with no row ⇒ never matches (unless
//    `neutral_default`).
//  - Posture gates on a missing row use the DISTANT (STRANGER) baseline.
// ============================================================

import type { RelationshipGate, Posture } from './schemas/dialogue.js';
import { parseNumericComparison, compareNumber } from './conditions.js';
import { derivePosture } from './relationshipPostures.js';

export interface RelationshipAxesState {
  trust: number;
  familiarity: number;
  alignment: number;
  tension: number;
  debt: number;
  visibility: number;
}

export interface RelationshipConditionState {
  axes: RelationshipAxesState;
  bond: number;
  vibe: number;
  romance: number;
  friendship: number;
  status: string;
  flags: Record<string, boolean>;
  memory: Record<string, number>;
}

export type RelationshipStateByTarget = Record<string, RelationshipConditionState | null>;

export interface RelationshipGatedChoice {
  required_relationship?: RelationshipGate;
  hidden_if_relationship?: RelationshipGate;
  required_posture?: Posture;
  hidden_if_posture?: Posture;
}

/** STRANGER / zero baseline used when a gate opts into `neutral_default`. */
const NEUTRAL_BASELINE: RelationshipConditionState = {
  axes: { trust: 0, familiarity: 0, alignment: 0, tension: 0, debt: 0, visibility: 0 },
  bond: 0,
  vibe: 0,
  romance: 0,
  friendship: 0,
  status: 'STRANGER',
  flags: {},
  memory: {},
};

type GateMode = 'all' | 'any';

/**
 * Evaluate every condition in a gate against an effective state.
 * `mode: 'all'` ⇒ required gate (every condition must hold);
 * `mode: 'any'` ⇒ hidden_if gate (any single match hides the choice).
 *
 * `state` is `null` only when there is no relationship row at all. In
 * that case a non-`neutral_default` gate cannot be satisfied: required
 * gates fail and hidden_if gates never match. A `neutral_default` gate
 * is evaluated against the STRANGER/zero baseline instead.
 */
function gateConditionsMet(
  gate: RelationshipGate,
  state: RelationshipConditionState | null,
  mode: GateMode
): boolean {
  const effective = state ?? (gate.neutral_default ? NEUTRAL_BASELINE : null);
  if (!effective) {
    return false;
  }

  const conditions: Array<() => boolean> = [];

  if (gate.axes) {
    for (const [axis, cmp] of Object.entries(gate.axes)) {
      const parsed = parseNumericComparison(cmp as string);
      if (!parsed) {
        // Malformed axis comparison: fail-closed for required, never
        // matches for hidden_if.
        conditions.push(() => false);
        continue;
      }
      const actual = effective.axes[axis as keyof RelationshipAxesState] ?? 0;
      conditions.push(() => compareNumber(actual, parsed));
    }
  }
  if (gate.bond) {
    const parsed = parseNumericComparison(gate.bond as string);
    conditions.push(() => (parsed ? compareNumber(effective.bond ?? 0, parsed) : false));
  }
  if (gate.vibe) {
    const parsed = parseNumericComparison(gate.vibe as string);
    conditions.push(() => (parsed ? compareNumber(effective.vibe ?? 0, parsed) : false));
  }
  if (gate.romance) {
    const parsed = parseNumericComparison(gate.romance as string);
    conditions.push(() => (parsed ? compareNumber(effective.romance ?? 0, parsed) : false));
  }
  if (gate.friendship) {
    const parsed = parseNumericComparison(gate.friendship as string);
    conditions.push(() => (parsed ? compareNumber(effective.friendship ?? 0, parsed) : false));
  }
  if (gate.status) {
    conditions.push(() => effective.status === gate.status);
  }
  if (gate.flags) {
    for (const [key, expected] of Object.entries(gate.flags)) {
      conditions.push(() => (effective.flags?.[key] ?? false) === expected);
    }
  }
  if (gate.memory) {
    for (const [key, cmp] of Object.entries(gate.memory)) {
      const parsed = parseNumericComparison(cmp as string);
      conditions.push(() => (parsed ? compareNumber(effective.memory?.[key] ?? 0, parsed) : false));
    }
  }

  return mode === 'all' ? conditions.every((c) => c()) : conditions.some((c) => c());
}

/**
 * Decide whether a choice is visible given the player's relationship
 * state(s). Pure — no I/O. `defaultTargetId` is the dialogue tree's
 * `character_id`; gates with an explicit `target_character_id`
 * override look up their own key in `relStateByTarget`.
 */
export function relationshipPassesFilters(
  choice: RelationshipGatedChoice,
  relStateByTarget: RelationshipStateByTarget,
  defaultTargetId: string | undefined
): boolean {
  if (choice.required_relationship) {
    const targetId = choice.required_relationship.target_character_id ?? defaultTargetId;
    if (!targetId) return false;
    const state = relStateByTarget[targetId] ?? null;
    if (!gateConditionsMet(choice.required_relationship, state, 'all')) return false;
  }

  if (choice.hidden_if_relationship) {
    const targetId = choice.hidden_if_relationship.target_character_id ?? defaultTargetId;
    if (targetId) {
      const state = relStateByTarget[targetId] ?? null;
      if (gateConditionsMet(choice.hidden_if_relationship, state, 'any')) return false;
    }
  }

  if (choice.required_posture) {
    const state = defaultTargetId ? (relStateByTarget[defaultTargetId] ?? null) : null;
    if (derivePosture(state) !== choice.required_posture) return false;
  }

  if (choice.hidden_if_posture) {
    const state = defaultTargetId ? (relStateByTarget[defaultTargetId] ?? null) : null;
    if (derivePosture(state) === choice.hidden_if_posture) return false;
  }

  return true;
}
