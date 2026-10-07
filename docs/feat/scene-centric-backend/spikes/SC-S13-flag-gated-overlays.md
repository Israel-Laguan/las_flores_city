# SC-S13 — When are flag-gated scene overlays applied: compile-time variants or ordered conditional layers?

**Box:** 0.5 day · **Actual:** ~2 hours · **Date:** 2026-10-06
**Feeds:** SC-303a/b, SC-304, SC-312, SC-402 (gates Group E: E2/E5)

## Question

SC-303 says overlays are "applied at compile time — the compiled artifact is the resolved
result." A flag-gated overlay (`availability: ConditionExpr`) depends on per-player flag
state, which does not exist at compile. The SC-M2 exit criterion ("a base and a flag-gated
overlay compile to artifacts that resolve differently as the flag flips") needs one of:
(1) variant enumeration (one artifact per flag assignment, 2^k), (2) ordered conditional
layers (compile validates order/conflicts; runtime evaluates conditions and applies), or
(3) a hybrid. Which one, what is the `ResolvedScene` shape, and what is the compile-time
conflict rule for overlays whose conditions can both be true?

## What was run

Harness (committed, pure — no DB, no network; needs `api/contracts` built):
`server/scripts/spikes/flag-gated-overlays.mjs`

```bash
node server/scripts/spikes/flag-gated-overlays.mjs
```

- **Fixture.** Hypothetical base scene `vq_airport_gate` (role slots `valentina`, `bystander`;
  dialogue ref `dialogue_vq_endings`). Two overlays at equal priority 10, gated on the SC-S3
  vq_endings flags (`vq_gave_space`, `vq_pushed_away` from
  `content/dialogues/valentina_quan_relationship/dialogue_vq_endings.yaml`; canon sets both
  together at lines ~52-53, so they are genuinely co-satisfiable):
  - A `vq_gave_space_dusk`: `add_dialogue_refs`, `set_weather dusk`.
  - B `vq_pushed_away_rain`: `add_items`, `cast_slot bystander`, `set_weather rain`.
  - A "refined" variant narrows A to `vq_gave_space AND NOT vq_pushed_away`.
- **k** is measured with `extractFlagSlugs` (SC-203, the same function SC-2xx flag tracking uses) over
  the union of overlay `availability` expressions; artifacts are enumerated over all 2^k
  assignments with `evaluate`, composed with a throwaway pure `compose` (prototype of SC-303b:
  `(priority asc, slug asc)`, additive merge by identity, exclusive last-wins) and deduped by
  content hash.
- **Scaling.** n synthetic overlays, one flag each (best case for dedupe is none, worst for k).
- **Real k.** Census of flag keys (`required_flags`, `forbidden_flags`, `flag_set`) in all
  `content/dialogues/**` YAML.
- **Conflict rule.** Truth-table co-satisfiability over the union of `extractFlagSlugs`
  (cap k<=16, beyond that "unknown" -> treated co-satisfiable + `hint`).
- **Runtime cost (option 2).** In-process `evaluate` of every layer's condition plus `compose`
  of the active ones, 5000 timed iterations after 2000 warmup, n = 1..50 layers; compared
  with the SC-S6 re-run endpoint numbers.

## Raw results

```
=== (1) variant enumeration: the two-overlay fixture ===
[naive  A=gave_space, B=pushed_away] flags=["vq_gave_space","vq_pushed_away"] k=2 2^k=4 distinct_artifacts=4 ~bytes/artifact=309
    artifact 4c2f29652a65: 1 flag assignment(s)
    artifact 7b477b08fde9: 1 flag assignment(s)
    artifact 801cb8db688a: 1 flag assignment(s)
    artifact b6074b2e90ae: 1 flag assignment(s)

=== conflict check (SC-304 rule, co-satisfiable pairs only) ===
naive  : [{"property":"weather","priority":10,"overlays":["vq_gave_space_dusk","vq_pushed_away_rain"],"co_satisfiable":true,"witness":["vq_gave_space","vq_pushed_away"],"code":"SCENE_EXCLUSIVE_CONFLICT","severity":"error"}]
[refined A=gave_space&!pushed_away, B=pushed_away] flags=["vq_gave_space","vq_pushed_away"] k=2 2^k=4 distinct_artifacts=3 ~bytes/artifact=309
    artifact 4c2f29652a65: 1 flag assignment(s)
    artifact 7b477b08fde9: 1 flag assignment(s)
    artifact 801cb8db688a: 2 flag assignment(s)
refined: [{"property":"weather","priority":10,"overlays":["vq_gave_space_dusk","vq_pushed_away_rain"],"co_satisfiable":false,"witness":null,"code":null,"severity":null}]
all-pairs rule would flag refined as conflict:  yes (same property, same priority) -> false positive

=== k growth: n flag-gated overlays on one scene, each own flag, additive+exclusive mix ===
n=2 k=2 2^k=4 distinct=4 compile_ms=0.1 storage_at_243B=0.00MB/scene
n=4 k=4 2^k=16 distinct=16 compile_ms=0.2 storage_at_253B=0.00MB/scene
n=8 k=8 2^k=256 distinct=256 compile_ms=2.3 storage_at_273B=0.07MB/scene
n=12 k=12 2^k=4096 distinct=4096 compile_ms=17.7 storage_at_295B=1.21MB/scene
n=16 k=16 2^k=65536 distinct=65536 compile_ms=227.6 storage_at_321B=21.04MB/scene
n=20 k=20 2^k=1048576 distinct=skipped (>2^16) compile_ms=- storage_at_345B=361.76MB/scene

=== real-content flag census (upper bound on k if flags gated scene overlays) ===
dialogue files with flags=40 distinct flags overall=185 flags/file p50=5 p95=15 max=20
2^overall would be 2^185: global enumeration is impossible; only per-scene k matters.

=== (2) runtime cost of ordered conditional layers ===
layers=1 evaluate+compose p50=0.1us p95=0.2us max=16.8us
layers=2 evaluate+compose p50=0.3us p95=0.5us max=673.4us
layers=5 evaluate+compose p50=0.4us p95=0.5us max=9.0us
layers=10 evaluate+compose p50=0.6us p95=4.7us max=14.8us
layers=50 evaluate+compose p50=2.3us p95=2.7us max=253.9us
SC-S6 re-run reference (2026-10-06): GET /dialogue/active p50=21.01ms p95=28.07ms; rest-of-endpoint p50=14.91ms; presigning p50=5.45ms
```

## Answer

**Chosen model: hybrid (option 3), which degenerates to ordered conditional layers
(option 2) for everything flag-gated. Do not enumerate variants.**

Reasoning, from the numbers:

- **Option 1 does not scale and buys nothing.** k for the two-overlay fixture is only 2 (4
  artifacts, 3 distinct once co-satisfiability is refined), so the SC-M2 demo would pass. But
  artifact count is 2^k with *no* dedupe when overlays are additive or touch different
  properties (n=16: 65,536 artifacts / ~21 MB per scene; n=20: 1,048,576 / ~362 MB). Real
  content already has up to 20 distinct flags in a single dialogue file (p50 5, p95 15, 185
  distinct overall), so a scene whose overlays gate on a dialogue's branch flags can reach k
  where compile time, storage and content-hash churn (every flag added doubles the artifact
  set, SC-403 idempotency breaks) are unacceptable. It also puts per-player state into a
  content-addressed, player-independent artifact and still needs a runtime pick step.
- **Option 2's runtime cost is negligible.** Evaluating all layer conditions and composing
  the active ones is microseconds (p50 0.1us at 1 layer, 2.3us at 50 layers; microbench, not
  I/O) against the SC-S6 re-run baseline of 21.0ms endpoint p50 / 14.9ms "rest of endpoint" /
  5.5ms presigning. Even 100x pessimism (CPU contention, cold JIT, serialization of the
  result) is well under 1ms, i.e. <5% of the endpoint p50. Fetching one artifact and one
  evaluation pass replaces nothing on the hot path.
- **Static overlays can still be folded.** An overlay whose `availability` is `TRUE` (or
  folds to a constant under the flag registry) has no per-player dependence; folding it into
  the base is a pure win (smaller layers list, fewer runtime ops) and is exactly SC-303's
  original intent.

**`ResolvedScene` shape (base + layers, not a single resolved scene):**

```ts
interface ResolvedScene {
  scene_slug: string;
  base: ComposedScene;              // base with all availability==TRUE overlays folded (compile)
  layers: ConditionalLayer[];       // flag-gated overlays, sorted (priority asc, slug asc), already validated
  flags: string[];                  // union of extractFlagSlugs(layer.availability) — dependency list for SC-401/SC-701
  provenance: Record<string, string>; // field -> 'base' | overlay slug (for the static fold)
  issues: Issue[];                  // hints only (errors fail the compile)
}
interface ConditionalLayer { slug: string; priority: number; availability: ConditionExpr; ops: SceneOp[] }
```

Runtime contract (`selectActiveOverlays`, SC-312): `layers.filter(l => evaluate(l.availability, flags))`
then apply `ops` with the *same* compose function in the stored order (no re-sorting, no
conflict detection — those were settled at compile). The result, including per-field
provenance, is the per-player resolved scene; pinning (proposal §2.2 open question) pins the
*selected layer slugs*, not a snapshot of the scene.

**Compile-time conflict rule for co-satisfiable overlays.** Group by (exclusive property
`weather|time|background`, or `(slot_id, cast)`), then by equal `priority`. For each pair in
a group, compute co-satisfiability of their `availability` expressions:
`vars = extractFlagSlugs(a) ∪ extractFlagSlugs(b)`; the pair is co-satisfiable iff some
assignment of `vars` makes both `evaluate` true (truth table, cap |vars| <= 16).
- co-satisfiable -> `SCENE_EXCLUSIVE_CONFLICT` / `SCENE_SLOT_CAST_CONFLICT`, severity `error`, compile fails.
- not co-satisfiable (e.g. `A AND NOT B` vs `B`) -> no conflict. (Raw results: naive A/B
  conflict with witness `{vq_gave_space, vq_pushed_away}`; refined A does not.)
- |vars| > 16 -> treated co-satisfiable, severity `hint` (conservative, never silently passes).
- Different priorities are never a conflict: with layers, the runtime picks the highest
  *active* priority, which is well-defined.
Known limit: flags are treated as independent booleans, so the check over-reports for flags
that are not independently settable (it never under-reports). Author fix: narrow the
condition (as in "refined"); a registry-level mutual-exclusion declaration is a later
refinement, not needed for SC-M2.

## What it changes

**SC-303 "resolved at compile time" wording (`sprint-03.md` §1 SC-303, `backlog.md`):**
- Before: "Overlay is applied at compile time, not at runtime — the compiled artifact is the
  resolved result."
- After: "Overlay *ordering, conflicts and validity* are resolved at compile time. Overlays
  with a constant `availability` are folded into the base at compile; overlays gated on flags
  are kept as ordered conditional layers in the artifact and selected per player at runtime
  with the shared `evaluate`. The compiled artifact is the base-plus-validated-layers, not a
  single player's result."

**SC-402 artifact shape:** artifact = `ResolvedScene { base, layers[], flags[] }`, one
content-addressed artifact per scene (not one per flag combination). Content hash covers
`base`+`layers` so SC-403 idempotency is unaffected by flag growth; `flags[]` feeds the
dependency/edge projection (SC-701, flag-tracking). SC-M2 exit criterion stays valid with one
artifact: the *same* artifact resolves differently as the flag flips (cover it with a
runtime-selection test, not two artifacts).

**SC-304:** conflicts are decided on *co-satisfiable* pairs at equal priority, via the
truth-table check above over `extractFlagSlugs` (this matches the existing Group E wording;
the "all pairs" rule is rejected — it false-positives on the refined fixture). The helper
lives in `contracts/condition`. `cast_slot` conflicts follow the same rule.

**SC-303b / SC-312:** `composeScene` is run twice with the same code: at compile over static
overlays (+ conflict check over all layers), at runtime over the active layers. SC-312's
`selectActiveOverlays` is therefore a hard dependency of SC-303b's output shape, not a
follow-up; keep it in the same module (`api/planning/src/scene/`, pure, no I/O).

**`proposal.md` §2.2:** adds a "When overlays apply" paragraph (static folded at compile,
flag-gated kept as layers). **SC-303a** note: add `availability` evaluation as a runtime
responsibility to the contract's doc comment.

Harness caveats: the micro-benchmark measures pure CPU in one process with a warm JIT and
does not include JSON (de)serialization of the artifact; `compose` here is a prototype and
not the SC-303b implementation. The census counts flag keys in dialogue YAML only
(scenes/missions not yet flag-gated), so it is an upper-bound illustration of k, not a measured scene k.
