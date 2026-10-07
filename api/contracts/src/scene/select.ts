// api/contracts/src/scene/select.ts
// SC-312: per-player selection of a compiled scene's conditional layers (SC-S13).
//
// Runtime contract: keep the layers whose `availability` holds for the player's flags
// and apply them with the SAME engine as compile (`applyOverlayOps`), in the STORED order
// — no re-sorting and no conflict detection; both were settled at compile. Pinning
// (proposal §2.2) pins `active_layers`, not a snapshot of the scene.

import { evaluate, type FlagSet } from '../condition/evaluate.js';
import { applyOverlayOps, type ComposedScene, type ConditionalLayer, type ResolvedScene, type SceneComposeIssue } from './compose.js';

/** Layers active for `flags`, in their stored order. */
export function selectActiveOverlays<T extends Pick<ConditionalLayer, 'availability'>>(
  layers: ReadonlyArray<T>,
  flags: FlagSet,
): T[] {
  return layers.filter((l) => evaluate(l.availability, flags));
}

export interface PlayerScene {
  /** The scene this player sees, with per-field provenance. */
  scene: ComposedScene;
  /** Slugs of the layers applied, in order — what pinning records. */
  active_layers: string[];
  /** Engine issues (e.g. a cast_slot whose slot came from an inactive layer). */
  issues: SceneComposeIssue[];
}

export function resolveSceneForPlayer(resolved: ResolvedScene, flags: FlagSet): PlayerScene {
  const active = selectActiveOverlays(resolved.layers, flags);
  const { scene, issues } = applyOverlayOps(resolved.base, active);
  return { scene, active_layers: active.map((l) => l.slug), issues };
}
