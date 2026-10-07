// api/planning/src/scene/compose-scene.ts
// SC-303b: composeScene — base + overlays → ResolvedScene (SC-S13 "base + conditional
// layers"). Pure: no DB, no I/O; inputs are never mutated.
//
// Order: overlays apply in `(priority asc, slug asc)` — deterministic and independent of
// the input array order. Exclusive writes therefore resolve to the highest priority
// (ties: the greater slug), additive writes merge by identity (see contracts
// `applyOverlayOps`).
//
// Compile mode (no `flags`):
//  - an overlay whose availability reads no flag is constant: TRUE → static, FALSE →
//    dropped with SCENE_OVERLAY_NEVER_APPLIES (hint);
//  - static overlays that sort before EVERY flag-gated overlay are folded into `base`;
//    everything from the first flag-gated overlay on is kept, in order, as `layers`.
//    Folding only the prefix keeps runtime == "apply all active overlays in sorted
//    order": a static overlay sorting after a layer must still be able to override it;
//  - layered `cast_slot`/`add_role_slot` are checked against the folded base so a
//    dangling target is reported at compile, not discovered by players.
// Both modes run SC-304 conflict detection over every overlay for this base (folded or
// layered): an `error` there fails the compile.
// Player mode (`flags` given, SC-312): overlays whose availability is false for `flags`
// are skipped and the rest are all applied; `layers` is empty.

import {
  applyOverlayOps,
  evaluate,
  extractFlagSlugs,
  issuePath,
  toComposedScene,
  type ConditionalLayer,
  type ComposedScene,
  type FlagSet,
  type ResolvedScene,
  type SceneDef,
  type SceneOverlay,
  type ValidationIssue,
} from '@las-flores/api-contracts';
import { conflictsToIssues, detectConflicts } from './conflicts.js';
import { compareSlug, sortOverlays } from './order.js';

export { sortOverlays };

export interface ComposeSceneOptions {
  /** Per-player flag state. Omitted = compile mode (keep flag-gated overlays as layers). */
  flags?: FlagSet;
}

export interface ComposeSceneResult {
  scene: ResolvedScene;
  /** Every issue, errors included. A compile fails when any has severity `error`. */
  issues: ValidationIssue[];
}

const NO_FLAGS: FlagSet = new Set<string>();

const isFlagGated = (o: SceneOverlay): boolean => extractFlagSlugs(o.availability).length > 0;

function toLayer(o: SceneOverlay): ConditionalLayer {
  return { slug: o.slug, priority: o.priority, availability: o.availability, ops: o.ops };
}

/** Compile-time reference check for layered slot ops against the folded base. */
function checkLayerSlots(base: ComposedScene, layers: ReadonlyArray<ConditionalLayer>): ValidationIssue[] {
  const inBase = new Set(base.role_slots.map((s) => s.slot_id));
  const known = new Set(inBase);
  const issues: ValidationIssue[] = [];
  for (const layer of layers) {
    layer.ops.forEach((op, i) => {
      const path = issuePath(layer.slug, 'ops', i);
      if (op.op === 'add_role_slot') {
        if (inBase.has(op.slot.slot_id)) {
          issues.push({ code: 'SCENE_SLOT_ALREADY_EXISTS', path, severity: 'error', message: `slot '${op.slot.slot_id}' already exists in the base scene` });
        }
        known.add(op.slot.slot_id);
      } else if (op.op === 'cast_slot' && !known.has(op.slot_id)) {
        issues.push({
          code: 'SCENE_SLOT_MISSING',
          path,
          severity: 'error',
          message: `cast_slot targets slot '${op.slot_id}', which neither the base nor an earlier layer defines`,
        });
      }
    });
  }
  return issues;
}

export function composeScene(
  base: SceneDef,
  overlays: ReadonlyArray<SceneOverlay>,
  options: ComposeSceneOptions = {},
): ComposeSceneResult {
  const issues: ValidationIssue[] = [];

  const own = overlays.filter((o) => {
    if (o.base_scene_slug === base.slug) return true;
    issues.push({
      code: 'SCENE_OVERLAY_BASE_MISMATCH',
      path: o.slug,
      severity: 'error',
      message: `overlay '${o.slug}' targets '${o.base_scene_slug}', not '${base.slug}'`,
    });
    return false;
  });
  const sorted = sortOverlays(own);
  const flags = [...new Set(sorted.flatMap((o) => extractFlagSlugs(o.availability)))].sort(compareSlug);

  let folded: SceneOverlay[];
  let layers: ConditionalLayer[];
  if (options.flags !== undefined) {
    const playerFlags = options.flags;
    folded = sorted.filter((o) => evaluate(o.availability, playerFlags));
    layers = [];
  } else {
    const live = sorted.filter((o) => {
      if (isFlagGated(o) || evaluate(o.availability, NO_FLAGS)) return true;
      issues.push({ code: 'SCENE_OVERLAY_NEVER_APPLIES', path: o.slug, severity: 'hint', message: `overlay '${o.slug}' has a constant-false availability and is dropped` });
      return false;
    });
    const firstGated = live.findIndex(isFlagGated);
    const cut = firstGated < 0 ? live.length : firstGated;
    folded = live.slice(0, cut);
    layers = live.slice(cut).map(toLayer);
  }

  const applied = applyOverlayOps(toComposedScene(base), folded);
  issues.push(...applied.issues, ...checkLayerSlots(applied.scene, layers));
  issues.push(...conflictsToIssues(detectConflicts(own)));

  return {
    scene: {
      scene_slug: base.slug,
      base: applied.scene,
      layers,
      flags,
      issues: issues.filter((i) => i.severity !== 'error'),
    },
    issues,
  };
}
