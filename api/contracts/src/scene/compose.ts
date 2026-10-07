// api/contracts/src/scene/compose.ts
// SC-303b (m-57/58/59): the op-application engine shared by compile and runtime.
//
// SC-S13: `composeScene` (planning) runs at compile over static overlays and builds a
// `ResolvedScene { base, layers }`; runtime selects the active layers per player and
// applies them with THIS function, in the stored order. Because runtime may not import
// planning, the engine and its types live here in contracts.
//
// `applyOverlayOps` does NOT sort and does NOT detect conflicts — the caller passes
// layers already in `(priority asc, slug asc)` order and conflicts are a compile concern
// (SC-304). Semantics per op (SC-303a):
// - additive (`add_dialogue_refs`, `add_items`): append entries not already present —
//   merge by identity, first occurrence keeps its position and provenance.
// - `add_role_slot`: append; a `slot_id` that already exists → SCENE_SLOT_ALREADY_EXISTS.
// - `cast_slot`: replace `cast` on an existing slot; missing → SCENE_SLOT_MISSING.
// - exclusive (`set_weather`, `set_time`): replace; the last layer applied (= highest
//   priority) wins.
// A failing op is skipped and reported as an issue; the engine never throws.
//
// Provenance: field key → `'base'` or the overlay slug that last wrote it. Keys:
// `weather`, `time`, `dialogue_refs.<ref>`, `items.<item>`, `role_slots.<slot_id>`,
// `role_slots.<slot_id>.cast`. Emitted with sorted keys for stable JSON.

import type { ConditionExpr } from '../condition/expression.js';
import { issuePath, type IssueSeverity, type ValidationIssue } from '../validation/issue.js';
import type { RoleSlot } from './role-slot.js';
import type { SceneDef } from './scene-def.js';
import type { SceneOverlayOp } from './scene-overlay.js';

/** Codes emitted by composition (engine, `composeScene`, conflict detection). */
export const SCENE_COMPOSE_ISSUE_CODES = {
  SCENE_SLOT_ALREADY_EXISTS: 'SCENE_SLOT_ALREADY_EXISTS',
  SCENE_SLOT_MISSING: 'SCENE_SLOT_MISSING',
  SCENE_OVERLAY_BASE_MISMATCH: 'SCENE_OVERLAY_BASE_MISMATCH',
  SCENE_OVERLAY_NEVER_APPLIES: 'SCENE_OVERLAY_NEVER_APPLIES',
  /** SC-304: co-satisfiable overlays at equal priority write the same weather/time. */
  SCENE_EXCLUSIVE_CONFLICT: 'SCENE_EXCLUSIVE_CONFLICT',
  /** SC-304: co-satisfiable overlays at equal priority cast one slot to different characters. */
  SCENE_SLOT_CAST_CONFLICT: 'SCENE_SLOT_CAST_CONFLICT',
  /** SC-304: co-satisfiable overlays (any priority) both add the same slot_id. */
  SCENE_SLOT_ADD_CONFLICT: 'SCENE_SLOT_ADD_CONFLICT',
} as const;

export type SceneComposeIssueCode = (typeof SCENE_COMPOSE_ISSUE_CODES)[keyof typeof SCENE_COMPOSE_ISSUE_CODES];
export type SceneComposeIssue = ValidationIssue<SceneComposeIssueCode>;

/** `'base'` or the slug of the overlay that last wrote the field. */
export type ProvenanceSource = 'base' | (string & {});
export type Provenance = Record<string, ProvenanceSource>;

/** A SceneDef with every field's origin recorded. */
export interface ComposedScene extends SceneDef {
  provenance: Provenance;
}

/**
 * A flag-gated overlay kept in the compiled artifact (SC-S13), already validated and
 * conflict-checked. Runtime keeps those whose `availability` holds and applies them in
 * stored order.
 */
export interface ConditionalLayer {
  slug: string;
  priority: number;
  availability: ConditionExpr;
  ops: SceneOverlayOp[];
}

/** Anything the engine can apply: a `ConditionalLayer` or a `SceneOverlay`. */
export type OverlayLayer = Pick<ConditionalLayer, 'slug' | 'ops'> & Partial<ConditionalLayer>;

/**
 * Compile output for one scene (SC-S13 shape, SC-402 artifact payload). Per-field
 * provenance lives on `base.provenance` (static fold) and, at runtime, on the
 * per-player `ComposedScene` — it is not duplicated at the top level.
 */
export interface ResolvedScene {
  scene_slug: string;
  /** Base scene with every constant-TRUE overlay that sorts before all layers folded in. */
  base: ComposedScene;
  /** Overlays still applied per player, sorted `(priority asc, slug asc)`. */
  layers: ConditionalLayer[];
  /** Union of `extractFlagSlugs(layer.availability)`, sorted — dependency list (SC-401/701). */
  flags: string[];
  /** Non-error issues (hints/warnings). Errors fail the compile and are returned separately. */
  issues: ValidationIssue[];
}

const sortedProvenance = (p: Provenance): Provenance =>
  Object.fromEntries(Object.entries(p).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const copySlot = (s: RoleSlot): RoleSlot => ({ slot_id: s.slot_id, cast: s.cast, position: s.position });

/** Lifts a SceneDef into a ComposedScene whose every field has provenance `'base'`. */
export function toComposedScene(def: SceneDef): ComposedScene {
  const provenance: Provenance = { weather: 'base', time: 'base' };
  for (const ref of def.dialogue_refs) provenance[`dialogue_refs.${ref}`] = 'base';
  for (const item of def.items) provenance[`items.${item}`] = 'base';
  for (const slot of def.role_slots) {
    provenance[`role_slots.${slot.slot_id}`] = 'base';
    provenance[`role_slots.${slot.slot_id}.cast`] = 'base';
  }
  return {
    ...cloneDef(def),
    provenance: sortedProvenance(provenance),
  };
}

function cloneDef(def: SceneDef): SceneDef {
  return {
    id: def.id,
    slug: def.slug,
    title: def.title,
    description: def.description,
    location: def.location,
    time: def.time,
    weather: def.weather,
    items: [...def.items],
    dialogue_refs: [...def.dialogue_refs],
    role_slots: def.role_slots.map(copySlot),
    availability: def.availability,
    priority: def.priority,
  };
}

export interface ApplyResult {
  scene: ComposedScene;
  issues: SceneComposeIssue[];
}

const issue = (code: SceneComposeIssueCode, path: string, message: string, severity: IssueSeverity = 'error'): SceneComposeIssue => ({
  code,
  path,
  message,
  severity,
});

function appendByIdentity(list: string[], entries: readonly string[], key: string, source: string, prov: Provenance): void {
  for (const entry of entries) {
    if (list.includes(entry)) continue;
    list.push(entry);
    prov[`${key}.${entry}`] = source;
  }
}

/**
 * Ordered overlay application engine shared by compile and runtime.
 *
 * Applies `layers` to `scene` in the given order without mutating inputs.
 * Additive ops merge by identity (first occurrence keeps position); exclusive
 * ops (set_weather/set_time) let the last layer win; cast_slot and add_role_slot
 * report issues on conflicts rather than throwing.
 *
 * @param scene - The base composed scene to apply layers onto
 * @param layers - Ordered overlay layers to apply
 * @returns The composed scene with per-field provenance and any issues encountered
 */
export function applyOverlayOps(scene: ComposedScene, layers: ReadonlyArray<OverlayLayer>): ApplyResult {
  const out: ComposedScene = { ...cloneDef(scene), provenance: { ...scene.provenance } };
  const prov = out.provenance;
  const issues: SceneComposeIssue[] = [];

  for (const layer of layers) {
    layer.ops.forEach((op, i) => {
      const path = issuePath(layer.slug, 'ops', i);
      switch (op.op) {
        case 'add_dialogue_refs':
          appendByIdentity(out.dialogue_refs, op.refs, 'dialogue_refs', layer.slug, prov);
          return;
        case 'add_items':
          appendByIdentity(out.items, op.items, 'items', layer.slug, prov);
          return;
        case 'add_role_slot':
          if (out.role_slots.some((s) => s.slot_id === op.slot.slot_id)) {
            issues.push(issue('SCENE_SLOT_ALREADY_EXISTS', path, `slot '${op.slot.slot_id}' already exists`));
            return;
          }
          out.role_slots.push(copySlot(op.slot));
          prov[`role_slots.${op.slot.slot_id}`] = layer.slug;
          prov[`role_slots.${op.slot.slot_id}.cast`] = layer.slug;
          return;
        case 'cast_slot': {
          const idx = out.role_slots.findIndex((s) => s.slot_id === op.slot_id);
          if (idx < 0) {
            issues.push(issue('SCENE_SLOT_MISSING', path, `cast_slot targets slot '${op.slot_id}', which does not exist`));
            return;
          }
          out.role_slots[idx] = { ...out.role_slots[idx], cast: op.cast };
          prov[`role_slots.${op.slot_id}.cast`] = layer.slug;
          return;
        }
        case 'set_weather':
          out.weather = op.weather;
          prov.weather = layer.slug;
          return;
        case 'set_time':
          out.time = op.time;
          prov.time = layer.slug;
          return;
      }
    });
  }

  out.provenance = sortedProvenance(prov);
  return { scene: out, issues };
}
