// ============================================================
// Posture vocabulary (M48)
//
// Maps a relationship condition state to a coarse `Posture` used by
// `required_posture` / `hidden_if_posture` gates and by fallback
// selection. All thresholds live in `POSTURE_THRESHOLDS` — a single
// source of truth to be tuned after the 7-scenario playtest. Do NOT
// duplicate these constants into YAML.
// ============================================================

import { PostureSchema, type Posture } from './schemas/dialogue.js';
import type { RelationshipConditionState } from './relationshipGates.js';

export { PostureSchema };
export type { Posture };

export const POSTURES = PostureSchema.options;

/**
 * Tunable posture thresholds. Centralized so a threshold change is a
 * one-line edit. All values are first-draft constants pending playtest.
 */
  // Tuned after the M48 7-scenario API-driven playtest (2026-08-24):
  // - warmTrustMin 50->40: warm re-engagement at trust 45 (scenario 6 re)
  //   read CURIOUS under the first draft; a confident friend reunion
  //   should read WARM. No other playtest vector sits in 40..49 trust.
  // - distantFamiliarityMax 20->30: pushed-away stranger at trust 5 /
  //   familiarity 30 (scenario 6 pushed-away) read CURIOUS; cold,
  //   low-trust states up to modest familiarity now read DISTANT.
export const POSTURE_THRESHOLDS = {
  romanticTrustMin: 30,
  romanticTensionMax: 50,
  guardedTensionMin: 60,
  guardedFamiliarityMax: 30,
  confrontationalTensionMin: 60,
  confrontationalAlignmentMax: -20,
  warmTrustMin: 40,
  warmFamiliarityMin: 50,
  warmTensionMax: 40,
  distantTrustMax: 20,
  distantFamiliarityMax: 30,
  vulnerableTrustMin: 30,
  vulnerableFamiliarityMin: 20,
  vulnerableTensionMin: 40,
} as const;

/**
 * Derive a posture from a relationship state. A `null` state (no
 * relationship row) maps to DISTANT (the STRANGER baseline), matching
 * `relationshipPassesFilters` posture semantics.
 */
export function derivePosture(state: RelationshipConditionState | null): Posture {
  if (!state) {
    return 'DISTANT';
  }

  const { trust, familiarity, alignment, tension } = state.axes;
  const status = state.status;

  if (status === 'ROMANTIC' || status === 'PARTNER') {
    if (trust < POSTURE_THRESHOLDS.romanticTrustMin && tension >= POSTURE_THRESHOLDS.romanticTensionMax) {
      return 'VOLATILE_ROMANCE';
    }
    return 'WARM';
  }
  if (status === 'ENDED') return 'BROKEN';
  if (status === 'DISTANCED') return 'DISTANT';

  if (
    tension >= POSTURE_THRESHOLDS.confrontationalTensionMin &&
    alignment < POSTURE_THRESHOLDS.confrontationalAlignmentMax
  ) {
    return 'CONFRONTATIONAL';
  }
  if (
    tension >= POSTURE_THRESHOLDS.guardedTensionMin &&
    familiarity < POSTURE_THRESHOLDS.guardedFamiliarityMax
  ) {
    return 'GUARDED';
  }
  if (
    trust >= POSTURE_THRESHOLDS.warmTrustMin &&
    familiarity >= POSTURE_THRESHOLDS.warmFamiliarityMin &&
    tension < POSTURE_THRESHOLDS.warmTensionMax
  ) {
    return 'WARM';
  }
  if (
    trust < POSTURE_THRESHOLDS.distantTrustMax &&
    familiarity < POSTURE_THRESHOLDS.distantFamiliarityMax
  ) {
    return 'DISTANT';
  }
  if (
    trust >= POSTURE_THRESHOLDS.vulnerableTrustMin &&
    familiarity >= POSTURE_THRESHOLDS.vulnerableFamiliarityMin &&
    tension >= POSTURE_THRESHOLDS.vulnerableTensionMin
  ) {
    return 'GUARDED';
  }
  return 'CURIOUS';
}
