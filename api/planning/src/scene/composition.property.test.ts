// api/planning/src/scene/composition.property.test.ts
// SC-313 (m-69/m-70): composition properties. Seeded so CI is deterministic;
// 300 runs per property (>= 200 required).

import { describe, expect, test } from '@jest/globals';
import fc from 'fast-check';
import {
  FALSE,
  TRUE,
  and,
  applyOverlayOps,
  createSceneDef,
  evaluate,
  flag,
  not,
  or,
  resolveSceneForPlayer,
  selectActiveOverlays,
  SCENE_TIMES,
  WEATHER_TAGS,
  type ComposedScene,
  type ConditionExpr,
  type RoleSlot,
  type SceneDef,
  type SceneOverlay,
  type SceneOverlayOp,
} from '@las-flores/api-contracts';
import { composeScene } from './compose-scene.js';
import { detectConflicts } from './conflicts.js';

const PARAMS = { seed: 20261007, numRuns: 300 };

// ── m-69 arbitraries (bounded, identifier-valid slugs) ─────────────────────────────

const FLAGS = ['f_a', 'f_b', 'f_c'] as const;
const SLOT_IDS = ['s_one', 's_two', 's_three', 's_four'] as const;
const CHARS = ['ana', 'ben', 'cora'] as const;
const ITEMS = ['knife', 'map', 'ticket', 'umbrella'] as const;
const REFS = ['dlg_a', 'dlg_b', 'dlg_c'] as const;
const OVERLAY_SLUGS = ['ov_a', 'ov_b', 'ov_c', 'ov_d', 'ov_e'] as const;
const POSITIONS = ['left', 'center', 'right'] as const;

const condArb: fc.Arbitrary<ConditionExpr> = fc.letrec<{ expr: ConditionExpr }>((tie) => ({
  expr: fc.oneof(
    { depthSize: 'small', maxDepth: 3 },
    fc.constant(TRUE),
    fc.constant(FALSE),
    fc.record({ f: fc.constantFrom(...FLAGS), e: fc.boolean() }).map(({ f, e }) => flag(f, e)),
    tie('expr').map((x) => not(x)),
    fc.array(tie('expr'), { maxLength: 3 }).map((xs) => and(xs)),
    fc.array(tie('expr'), { maxLength: 3 }).map((xs) => or(xs)),
  ),
})).expr;

const slotArb = (ids: readonly string[]): fc.Arbitrary<RoleSlot[]> =>
  fc.uniqueArray(fc.constantFrom(...ids), { maxLength: ids.length }).chain((picked) =>
    fc.tuple(...picked.map((id) =>
      fc.record({ cast: fc.option(fc.constantFrom(...CHARS), { nil: null }), position: fc.constantFrom(...POSITIONS) }).map(
        (r): RoleSlot => ({ slot_id: id, cast: r.cast, position: r.position }),
      ),
    )),
  );

const baseArb: fc.Arbitrary<SceneDef> = fc
  .record({
    items: fc.uniqueArray(fc.constantFrom(...ITEMS), { maxLength: 2 }),
    refs: fc.uniqueArray(fc.constantFrom(...REFS), { maxLength: 2 }),
    slots: slotArb(SLOT_IDS.slice(0, 2)),
    weather: fc.option(fc.constantFrom(...WEATHER_TAGS), { nil: null }),
    time: fc.option(fc.constantFrom(...SCENE_TIMES), { nil: null }),
  })
  .map((r) =>
    createSceneDef({
      id: 'c3000000-0000-4000-8000-000000000099',
      slug: 'prop_scene',
      title: 't',
      description: 'd',
      location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
      items: r.items,
      dialogue_refs: r.refs,
      role_slots: r.slots,
      weather: r.weather,
      time: r.time,
    }),
  );

/** One overlay's ops; at most one op per exclusive property / slot (as validated). */
const opsArb: fc.Arbitrary<SceneOverlayOp[]> = fc
  .record({
    weather: fc.option(fc.option(fc.constantFrom(...WEATHER_TAGS), { nil: null }), { nil: undefined }),
    time: fc.option(fc.option(fc.constantFrom(...SCENE_TIMES), { nil: null }), { nil: undefined }),
    items: fc.uniqueArray(fc.constantFrom(...ITEMS), { maxLength: 2 }),
    refs: fc.uniqueArray(fc.constantFrom(...REFS), { maxLength: 2 }),
    casts: fc.uniqueArray(
      fc.record({ slot_id: fc.constantFrom(...SLOT_IDS), cast: fc.option(fc.constantFrom(...CHARS), { nil: null }) }),
      { selector: (c) => c.slot_id, maxLength: 2 },
    ),
    adds: slotArb(SLOT_IDS.slice(2)),
  })
  .map((r) => {
    const ops: SceneOverlayOp[] = [];
    if (r.refs.length) ops.push({ op: 'add_dialogue_refs', refs: r.refs });
    if (r.items.length) ops.push({ op: 'add_items', items: r.items });
    for (const slot of r.adds) ops.push({ op: 'add_role_slot', slot });
    for (const c of r.casts) ops.push({ op: 'cast_slot', slot_id: c.slot_id, cast: c.cast });
    if (r.weather !== undefined) ops.push({ op: 'set_weather', weather: r.weather });
    if (r.time !== undefined) ops.push({ op: 'set_time', time: r.time });
    return ops;
  });

const overlayArb = (slug: string): fc.Arbitrary<SceneOverlay> =>
  fc.record({ priority: fc.integer({ min: 0, max: 2 }), availability: condArb, ops: opsArb }).map((r) => ({
    slug,
    base_scene_slug: 'prop_scene',
    ...r,
  }));

const overlaysArb: fc.Arbitrary<SceneOverlay[]> = fc
  .uniqueArray(fc.constantFrom(...OVERLAY_SLUGS), { maxLength: OVERLAY_SLUGS.length })
  .chain((slugs) => fc.tuple(...slugs.map(overlayArb)));

const flagSetArb = fc.uniqueArray(fc.constantFrom(...FLAGS)).map((fs) => new Set<string>(fs));

const withoutProvenance = ({ provenance: _p, ...rest }: ComposedScene) => rest;

// ── m-70 properties ────────────────────────────────────────────────────────────────

describe('composition properties (SC-313)', () => {
  test('order independence: shuffling the overlay array never changes the result', () => {
    fc.assert(
      fc.property(
        baseArb,
        overlaysArb.chain((os) => fc.tuple(fc.constant(os), fc.shuffledSubarray(os, { minLength: os.length, maxLength: os.length }))),
        flagSetArb,
        (base, [overlays, shuffled], flags) => {
          expect(composeScene(base, shuffled)).toEqual(composeScene(base, overlays));
          expect(composeScene(base, shuffled, { flags })).toEqual(composeScene(base, overlays, { flags }));
        },
      ),
      PARAMS,
    );
  });

  test('idempotence: re-applying the active overlays to the resolved scene changes nothing', () => {
    fc.assert(
      fc.property(baseArb, overlaysArb, flagSetArb, (base, overlays, flags) => {
        const result = composeScene(base, overlays);
        // Only for artifacts that pass the compile's slot reference check: a cast_slot
        // ordered before the add_role_slot it targets fails compile (SCENE_SLOT_MISSING)
        // precisely because a second pass would then succeed.
        fc.pre(!result.issues.some((i) => i.code === 'SCENE_SLOT_MISSING' || i.code === 'SCENE_SLOT_ALREADY_EXISTS'));
        const compiled = result.scene;
        const player = resolveSceneForPlayer(compiled, flags).scene;
        const again = applyOverlayOps(player, selectActiveOverlays(compiled.layers, flags)).scene;
        expect(again).toEqual(player);
        // Re-compiling the compiled artifact's own (base, layers) is a fixed point.
        const baseDef: SceneDef = withoutProvenance(compiled.base);
        const relayers = compiled.layers.map((l) => ({ ...l, base_scene_slug: base.slug }));
        const recompiled = composeScene(baseDef, relayers).scene;
        expect(withoutProvenance(recompiled.base)).toEqual(withoutProvenance(compiled.base));
        expect(recompiled.layers).toEqual(compiled.layers);
      }),
      PARAMS,
    );
  });

  test('identity: zero overlays → result equals base (modulo provenance)', () => {
    fc.assert(
      fc.property(baseArb, flagSetArb, (base, flags) => {
        const { scene, issues } = composeScene(base, []);
        expect(withoutProvenance(scene.base)).toEqual(base);
        expect(scene.layers).toEqual([]);
        expect(issues).toEqual([]);
        expect(withoutProvenance(resolveSceneForPlayer(scene, flags).scene)).toEqual(base);
        expect(Object.values(scene.base.provenance).every((p) => p === 'base')).toBe(true);
      }),
      PARAMS,
    );
  });

  test('monotonic additivity: adding an additive overlay never removes content', () => {
    const additiveArb = fc
      .record({
        priority: fc.integer({ min: 0, max: 2 }),
        availability: condArb,
        items: fc.uniqueArray(fc.constantFrom(...ITEMS), { minLength: 1, maxLength: 2 }),
        refs: fc.uniqueArray(fc.constantFrom(...REFS), { maxLength: 2 }),
      })
      .map(
        (r): SceneOverlay => ({
          slug: 'ov_zz_additive',
          base_scene_slug: 'prop_scene',
          priority: r.priority,
          availability: r.availability,
          ops: [{ op: 'add_items', items: r.items }, ...(r.refs.length ? [{ op: 'add_dialogue_refs' as const, refs: r.refs }] : [])],
        }),
      );
    fc.assert(
      fc.property(baseArb, overlaysArb, additiveArb, flagSetArb, (base, overlays, extra, flags) => {
        const before = composeScene(base, overlays, { flags }).scene.base;
        const after = composeScene(base, [...overlays, extra], { flags }).scene.base;
        for (const i of base.items) expect(after.items).toContain(i);
        for (const r of base.dialogue_refs) expect(after.dialogue_refs).toContain(r);
        for (const i of before.items) expect(after.items).toContain(i);
        for (const r of before.dialogue_refs) expect(after.dialogue_refs).toContain(r);
        expect(after.role_slots).toEqual(before.role_slots);
        expect(after.weather).toBe(before.weather);
        expect(after.time).toBe(before.time);
      }),
      PARAMS,
    );
  });

});

describe('composition properties: conflicts and fold (SC-313)', () => {
  test('conflict soundness: every conflict is a real same-property pair; differing priorities never conflict', () => {
    const writes = (o: SceneOverlay, property: string): unknown[] =>
      o.ops.flatMap((op) => {
        if (op.op === 'set_weather' && property === 'weather') return [op.weather];
        if (op.op === 'set_time' && property === 'time') return [op.time];
        if (op.op === 'cast_slot' && property === `role_slots.${op.slot_id}.cast`) return [op.cast];
        if (op.op === 'add_role_slot' && property === `role_slots.${op.slot.slot_id}`) return [op.slot.cast];
        return [];
      });
    fc.assert(
      fc.property(overlaysArb, (overlays) => {
        const bySlug = new Map(overlays.map((o) => [o.slug, o]));
        for (const c of detectConflicts(overlays)) {
          const [a, b] = c.overlays.map((s) => bySlug.get(s)!);
          expect(a).toBeDefined();
          expect(b).toBeDefined();
          expect(a.slug).not.toBe(b.slug);
          expect(writes(a, c.property)).toEqual([c.values[0]]);
          expect(writes(b, c.property)).toEqual([c.values[1]]);
          if (c.code !== 'SCENE_SLOT_ADD_CONFLICT') expect(a.priority).toBe(b.priority);
          if (c.code === 'SCENE_SLOT_CAST_CONFLICT') expect(c.values[0]).not.toBe(c.values[1]);
          if (c.severity === 'error') {
            const w = new Set(c.witness);
            expect(evaluate(a.availability, w) && evaluate(b.availability, w)).toBe(true);
          }
        }
      }),
      PARAMS,
    );
  });

  test('hybrid fold is transparent: player-mode compose equals runtime selection over the artifact', () => {
    fc.assert(
      fc.property(baseArb, overlaysArb, flagSetArb, (base, overlays, flags) => {
        const compiled = composeScene(base, overlays).scene;
        expect(resolveSceneForPlayer(compiled, flags).scene).toEqual(composeScene(base, overlays, { flags }).scene.base);
      }),
      PARAMS,
    );
  });
});
