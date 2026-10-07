// api/planning/src/scene/conflicts.ts
// SC-304: compile-time overlay conflict detection + machine-readable report.
//
// Rule (SC-S13). Each overlay "claims" properties through its ops:
//   set_weather → `weather`, set_time → `time`            (exclusive)
//   cast_slot   → `role_slots.<slot_id>.cast`              (conflicting)
//   add_role_slot → `role_slots.<slot_id>`                 (additive, keyed by identity)
// Claims are grouped by property; within a group every pair whose `availability`
// expressions are CO-SATISFIABLE (contracts `coSatisfiable`) is checked:
//   - exclusive, equal priority                         → SCENE_EXCLUSIVE_CONFLICT
//   - cast_slot, equal priority, different characters   → SCENE_SLOT_CAST_CONFLICT
//   - add_role_slot, ANY priority                       → SCENE_SLOT_ADD_CONFLICT
//     (when both are active the later add is always discarded, whatever the priority)
// Different priorities never make an exclusive/cast conflict: runtime applies the highest
// active priority last, which is well-defined. A pair whose satisfiability cannot be
// decided (> MAX_SAT_VARS flags) is reported conservatively with severity `hint`.
// Flags are treated as independent booleans, so this can over-report, never under-report.
//
// Output is sorted and has sorted keys, so the JSON report is byte-stable — the same
// shape the SC-405 compile-failure report will carry.

import {
  coSatisfiable,
  type SceneComposeIssueCode,
  type SceneOverlay,
  type ValidationIssue,
} from '@las-flores/api-contracts';
import { compareSlug as cmp, sortOverlays } from './order.js';

export type SceneConflictCode = Extract<
  SceneComposeIssueCode,
  'SCENE_EXCLUSIVE_CONFLICT' | 'SCENE_SLOT_CAST_CONFLICT' | 'SCENE_SLOT_ADD_CONFLICT'
>;

/** One conflicting overlay pair. Keys in sorted order (stable JSON). */
export interface SceneConflict {
  code: SceneConflictCode;
  /** The two overlay slugs, in compose order `(priority asc, slug asc)`. */
  overlays: [string, string];
  /** Priority of the first overlay (equal for both except SCENE_SLOT_ADD_CONFLICT). */
  priority: number;
  /** Property key, same vocabulary as provenance (`weather`, `role_slots.<id>.cast`, …). */
  property: string;
  /** `error` = decided co-satisfiable; `hint` = could not decide (treated as co-satisfiable). */
  severity: 'error' | 'hint';
  /** The value each overlay writes, aligned with `overlays`. */
  values: [unknown, unknown];
  /** Flags set true in an assignment where both overlays apply; `null` when undecided. */
  witness: string[] | null;
}

type ClaimKind = 'exclusive' | 'cast' | 'add';

interface Claim {
  property: string;
  kind: ClaimKind;
  value: unknown;
  overlay: SceneOverlay;
}

const CODE_BY_KIND: Record<ClaimKind, SceneConflictCode> = {
  exclusive: 'SCENE_EXCLUSIVE_CONFLICT',
  cast: 'SCENE_SLOT_CAST_CONFLICT',
  add: 'SCENE_SLOT_ADD_CONFLICT',
};

function claimsOf(overlay: SceneOverlay): Claim[] {
  const claims: Claim[] = [];
  for (const op of overlay.ops) {
    switch (op.op) {
      case 'set_weather':
        claims.push({ property: 'weather', kind: 'exclusive', value: op.weather, overlay });
        break;
      case 'set_time':
        claims.push({ property: 'time', kind: 'exclusive', value: op.time, overlay });
        break;
      case 'cast_slot':
        claims.push({ property: `role_slots.${op.slot_id}.cast`, kind: 'cast', value: op.cast, overlay });
        break;
      case 'add_role_slot':
        claims.push({ property: `role_slots.${op.slot.slot_id}`, kind: 'add', value: op.slot.cast, overlay });
        break;
      default:
        break;
    }
  }
  return claims;
}

function pairConflict(a: Claim, b: Claim): SceneConflict | null {
  if (a.kind !== 'add' && a.overlay.priority !== b.overlay.priority) return null;
  if (a.kind === 'cast' && a.value === b.value) return null;
  const sat = coSatisfiable(a.overlay.availability, b.overlay.availability);
  if (sat.result === false) return null;
  return {
    code: CODE_BY_KIND[a.kind],
    overlays: [a.overlay.slug, b.overlay.slug],
    priority: a.overlay.priority,
    property: a.property,
    severity: sat.result === true ? 'error' : 'hint',
    values: [a.value, b.value],
    witness: sat.result === true ? sat.witness : null,
  };
}

/** All conflicts among `overlays` (assumed to share one base scene), sorted. */
export function detectConflicts(overlays: ReadonlyArray<SceneOverlay>): SceneConflict[] {
  const groups = new Map<string, Claim[]>();
  for (const overlay of sortOverlays(overlays)) {
    for (const claim of claimsOf(overlay)) {
      const group = groups.get(claim.property) ?? [];
      group.push(claim);
      groups.set(claim.property, group);
    }
  }
  const conflicts: SceneConflict[] = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const c = pairConflict(group[i], group[j]);
        if (c) conflicts.push(c);
      }
    }
  }
  return conflicts.sort(
    (x, y) =>
      cmp(x.property, y.property) ||
      x.priority - y.priority ||
      cmp(x.overlays[0], y.overlays[0]) ||
      cmp(x.overlays[1], y.overlays[1]),
  );
}

/** Conflicts as standard validation issues (path = property). */
export function conflictsToIssues(conflicts: ReadonlyArray<SceneConflict>): ValidationIssue<SceneConflictCode>[] {
  return conflicts.map((c) => ({
    code: c.code,
    path: c.property,
    severity: c.severity,
    message:
      `overlays '${c.overlays[0]}' and '${c.overlays[1]}' both write '${c.property}'` +
      (c.code === 'SCENE_SLOT_ADD_CONFLICT' ? '' : ` at priority ${c.priority}`) +
      (c.witness ? ` and can both apply (e.g. flags {${c.witness.join(', ')}})` : ' and may both apply (undecided)'),
  }));
}

export interface ConflictReport {
  conflicts: SceneConflict[];
  scene_slug: string;
  /** `failed` iff any conflict has severity `error`. */
  status: 'ok' | 'failed';
}

/** Machine-readable report with sorted keys (stable bytes). */
export function formatConflictReport(sceneSlug: string, conflicts: ReadonlyArray<SceneConflict>): ConflictReport {
  return {
    conflicts: conflicts.map((c) => ({
      code: c.code,
      overlays: [c.overlays[0], c.overlays[1]],
      priority: c.priority,
      property: c.property,
      severity: c.severity,
      values: [c.values[0], c.values[1]],
      witness: c.witness === null ? null : [...c.witness],
    })),
    scene_slug: sceneSlug,
    status: conflicts.some((c) => c.severity === 'error') ? 'failed' : 'ok',
  };
}

export function stringifyConflictReport(report: ConflictReport): string {
  return JSON.stringify(report, null, 2);
}
