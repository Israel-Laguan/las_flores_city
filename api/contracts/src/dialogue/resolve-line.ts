// api/contracts/src/dialogue/resolve-line.ts
// SC-308: the specificity ladder — pick ONE line from candidates gathered from every rung.
// Pure and deterministic: no randomness, no LLM, independent of candidate order. Lives in
// contracts because runtime may not import planning (SC-M3 serves it).
//
//   1. eligibility   a line applies only if every dimension its `when` constrains is known in
//                    the context AND listed. An unknown context value never satisfies a
//                    constraint (a rain-only line does not fire when the weather is unknown).
//   2. rung          scene > relationship > personality   (proposal §2.6)
//   3. specificity   more constrained dimensions beats fewer (`lineWhenSpecificity`)
//   4. line_id       ascending
//   5. source        ascending (the slot id or pool slug; only reached when two sources share a
//                    line_id at the same rung and specificity, so the result is still total)
//
// Seeded variety between equally good lines is deliberately NOT here (D5): post-SC-M2.

import { lineWhenSpecificity, type LineWhen, type SlotLine } from '../scene/line.js';
import type { PersonalityPool } from './personality-pool.js';
import type { SceneTime } from '../scene/scene-vocab.js';
import type { WeatherTag } from '../weather/weather-tag.js';
import type { ComposedScene } from '../scene/compose.js';

export const LINE_RUNGS = ['personality', 'relationship', 'scene'] as const; // ascending specificity
export type LineRung = (typeof LINE_RUNGS)[number];

/** Coarse world state a line may be keyed on. `null`/absent = unknown. */
export interface LineContext {
  time?: SceneTime | null;
  weather?: WeatherTag | null;
}

export interface LineCandidate {
  rung: LineRung;
  line_id: string;
  text: string;
  when: LineWhen;
  /** Where it came from: a slot id (scene), a pool slug (personality), or the caller's label. */
  source: string;
}

const RANK: Record<LineRung, number> = { personality: 0, relationship: 1, scene: 2 };

/** True when every dimension `when` constrains is known in `ctx` and listed. */
export function lineApplies(when: LineWhen, ctx: LineContext): boolean {
  if (when.time !== undefined && (ctx.time == null || !when.time.includes(ctx.time))) return false;
  if (when.weather !== undefined && (ctx.weather == null || !when.weather.includes(ctx.weather))) return false;
  return true;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Best candidate for `ctx`, or undefined when none applies. Does not mutate its input. */
export function resolveLine(ctx: LineContext, candidates: ReadonlyArray<LineCandidate>): LineCandidate | undefined {
  let best: LineCandidate | undefined;
  for (const c of candidates) {
    if (!lineApplies(c.when, ctx)) continue;
    if (best === undefined || beats(c, best)) best = c;
  }
  return best;
}

/** True when `a` is strictly better than `b`. */
function beats(a: LineCandidate, b: LineCandidate): boolean {
  const order =
    RANK[b.rung] - RANK[a.rung] || // higher rung first
    lineWhenSpecificity(b.when) - lineWhenSpecificity(a.when) || // more constrained first
    cmp(a.line_id, b.line_id) ||
    cmp(a.source, b.source);
  return order < 0;
}

/** Scene rung: the lines attached to a role slot. They follow the slot, whoever is cast in it. */
export function slotLineCandidates(scene: Pick<ComposedScene, 'slot_lines'>, slotId: string): LineCandidate[] {
  return scene.slot_lines.filter((l: SlotLine) => l.slot_id === slotId).map((l) => ({ rung: 'scene', line_id: l.line_id, text: l.text, when: l.when, source: slotId }));
}

/** Personality rung: every line of every pool the character uses. */
export function poolLineCandidates(pools: ReadonlyArray<PersonalityPool>): LineCandidate[] {
  return pools.flatMap((p) => p.lines.map((l) => ({ rung: 'personality' as const, line_id: l.line_id, text: l.text, when: l.when, source: p.slug })));
}
