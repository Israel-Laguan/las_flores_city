# Group E — Composition: overlays, merge rules, conflicts (SC-303 / 304 / 305, 6 tasks)

Pure functions in `api/planning/src/scene/` over the contracts from Group D. No DB, no I/O —
so the boundary lint and property tests apply fully. **Do not start E2/E5 before SC-S13
answers** *when* flag-gated overlays are applied.

Property from `proposal.md` §2.2 that drives everything: scene properties are **additive**
(participants, items, activities, dialogue — all active scenes contribute) or **exclusive**
(weather, time, background — exactly one wins, needing explicit precedence).

> **Status: ✅ Done (branch `feat/sprint-03-group-e-composition`, 6 commits: 303a, 303b, 304, 305, 312, 313 — not yet merged).** TDD, one commit per task. Deviations and facts F/G rely on:
>
> **Deviations**
> - **The engine lives in contracts, not only planning.** Runtime may not import planning, but SC-S13 needs runtime to apply layers with the *same* code. So `applyOverlayOps`, `toComposedScene`, `selectActiveOverlays`, `resolveSceneForPlayer` and the `ComposedScene` / `ConditionalLayer` / `ResolvedScene` types are in `api/contracts/src/scene/`. `composeScene` (sorting, folding, conflicts), `resolveWeather` and the fixtures are in `api/planning/src/scene/`. The co-satisfiability helper is `contracts/condition/satisfiable.ts` (as in m-62).
> - **Static overlays fold as a prefix only.** Constant-TRUE overlays are folded into `base` only if they sort before every flag-gated overlay. A static overlay that sorts *after* a layer stays a layer (`availability: TRUE`) so it can still override it at runtime. Constant-FALSE overlays are dropped with the hint `SCENE_OVERLAY_NEVER_APPLIES`. A property test checks that the fold is invisible: player-mode `composeScene` equals runtime selection.
> - **`ResolvedScene` has no top-level `provenance`.** Provenance is on `base.provenance` and on the per-player `ComposedScene`; the SC-S13 sketch duplicated it at the top level.
> - **`set_weather` / `set_time` accept `null`** (explicitly clear back to inherit / any time).
> - **Extra codes beyond the doc:**
>   - `SCENE_SLOT_ADD_CONFLICT`: two co-satisfiable overlays add the same `slot_id`, at **any** priority.
>   - `SCENE_SLOT_ALREADY_EXISTS` / `SCENE_SLOT_MISSING`: engine issues; they never throw.
>   - `SCENE_OVERLAY_BASE_MISMATCH`.
>   - `SCENE_OVERLAY_OP_DUPLICATE`: shape check, e.g. two `set_weather` in one overlay.
> - **Compile requires implied casts.** A layered `cast_slot` on a slot that only layers add must have an `availability` that implies "some earlier adder is active". If not, compile reports `SCENE_SLOT_MISSING` (error, with witness flags). Without this rule a player could hit a dangling cast, and composition would not be idempotent. Property testing found this case.
> - SC-305 fixtures use `aeropuerto` (district City = `overcast`). This doc mentions a `downtown` district, but it does not exist in content.
>
> **Facts**
> - **Op set:** `add_dialogue_refs{refs}`, `add_items{items}`, `add_role_slot{slot}`, `cast_slot{slot_id,cast}`, `set_weather{weather}`, `set_time{time}`. The kind table is `SCENE_OVERLAY_OPS`. JSON uses sorted keys and stamps `schema_version: 1`.
> - **Provenance keys:** `weather`, `time`, `dialogue_refs.<ref>`, `items.<item>`, `role_slots.<id>`, `role_slots.<id>.cast`. Each maps to `'base'` or an overlay slug.
> - **Conflict report:** `formatConflictReport(sceneSlug, detectConflicts(overlays))` gives `{conflicts[], scene_slug, status: ok|failed}`. Each conflict is `{code, overlays[2], priority, property, severity, values[2], witness}`, keys sorted, rows ordered by (property, priority, slugs). Undecidable pairs (> 16 flags) get severity `hint`.
> - **Runtime consumer:** `api/runtime/src/resolve/scene.ts` `resolvePlayerScene(artifact, playerId, flagRepo)`.
> - **Golden fixtures:** `api/planning/test-fixtures/scene-composition/*.json`, data only. F3 loads them with its own I/O and calls `parseGoldenFixture`.
> - `fast-check` is now a devDependency of `api/planning`.
> - Overlay repository / `planning.scene_overlays` read-write is still **not built** (F1).

---

## SC-303a · Scene overlay contract · M · P0 · needs SC-301b, SC-310

`SceneOverlay { slug, base_scene_slug, priority: int, availability: ConditionExpr, ops }`.
`ops` is a small closed set — **no free-form patch language**:

| Op | Kind | Meaning |
|---|---|---|
| `add_dialogue_refs` | additive | append refs (dedupe by slug) |
| `add_items` | additive | append items |
| `add_role_slot` | additive | new `slot_id`; fails if it already exists |
| `cast_slot` | conflicting | assign `cast` on an existing slot |
| `set_weather` / `set_time` | exclusive | replace the value |

- Array merge is **by identity (`slot_id`, ref slug)**, never positional — SC-S3 proved naive `jsonb ||` is wrong for arrays; the same rule holds here.
- Distinct from the existing dialogue `OverlaySchema` in `shared/src/schemas/overlay.ts` (which is keyed by `target_tree_id`). Name it `SceneOverlay`, document the difference in the file header.

- m-54 Types + `toJSON/fromJSON`.
- m-55 `validateSceneOverlay` using the issue format from SC-301b.
- m-56 Unit tests per op (shape-valid and shape-invalid).

---

## SC-303b · `composeScene` — additive/exclusive merge · L · P0 · needs SC-303a, SC-S13

`composeScene(base, overlays) → { scene: ResolvedScene, issues: Issue[] }`.

**Acceptance**
- Overlays are applied in `(priority asc, slug asc)` order so output is deterministic and independent of input array order.
- Additive ops merge by identity; exclusive ops replace — the highest priority wins; `cast_slot` on a missing slot is an issue, not a throw.
- Inputs are never mutated (deep-frozen in tests).
- Output records **provenance** per field (`base` | overlay slug) — needed by E4 and by the later admin "why is it raining?" view.
- Shape of `ResolvedScene` follows the SC-S13 answer (single resolved value vs. base + conditional layers).

- m-57 `ResolvedScene` + provenance type.
- m-58 Implement additive merge (refs, items, role slots).
- m-59 Implement exclusive resolution + `cast_slot`.
- m-60 Golden tests: base-only, +1 overlay, +3 overlays at mixed priorities.

---

## SC-304 · Conflict detection + machine-readable report · M · P0 · needs SC-303b

Pulled forward from "follow-on" because SC-303 explicitly defers equal-priority conflicts
to it and the SC-M2 exit criterion requires the compile to *fail* on them.

**Acceptance**
- Two overlays assigning the same **exclusive** property (weather/time) at equal priority → `SCENE_EXCLUSIVE_CONFLICT` (severity `error`) naming both overlay slugs and the property.
- Two overlays casting the **same slot** to different characters at equal priority → `SCENE_SLOT_CAST_CONFLICT`.
- A conflict only counts when the overlays are **co-satisfiable** (SC-S13): `availability` expressions that can never both be true (`flag X` vs `not flag X`) are not a conflict. Implement a small, documented satisfiability check over the condition grammar; if it cannot decide, treat as co-satisfiable (conservative) and emit a `hint`.
- Report is JSON, stable, ordered — the same format SC-405 (compile failure report) will emit.

- m-61 Conflict detector over sorted overlay groups.
- m-62 Co-satisfiability helper in `contracts/condition` (pure; tests incl. `and`/`or`/`not` nesting).
- m-63 Report formatter + snapshot tests.

---

## SC-305 · Weather resolution with provenance · S · P1 · needs SC-309a, SC-303b

`resolveWeather(composedScene, districtWeather) → { weather: WeatherTag, source: 'scene' | 'overlay:<slug>' | 'district' }`.

**Acceptance (from SC-S5)**
- Scene/overlay value wins; otherwise the district default; the **resolved value is a field of the result**, not recomputed later.
- Takes the district weather as an *argument* — the function never reads a district row (no I/O; compile passes the snapshot).
- `null` and `undefined` both mean "inherit".
- **Unblocked (SC-309 merged):** `districts.weather` is `text NOT NULL DEFAULT 'clear'` (CHECK-constrained, so the snapshot is always a valid `WeatherTag`); compile reads it once per district at revision R. Use `WeatherTag`/`isWeatherTag` from `@las-flores/api-contracts`.

- m-64 Implement + table-driven tests (4 cases).
- m-65 Export through the planning facade.

---

## SC-312 · Flag-gated composition · M · P1 · needs SC-S13, SC-303b

Wire `availability` into composition using the shared `evaluate` — the exit-criterion demo
("the overlay resolves differently as the flag flips") at the *pure-function* level.

**Acceptance**
- `composeScene(base, overlays, { flags })` skips overlays whose `availability` is false for `flags`; behaviour for the compile-time vs. runtime split is whatever SC-S13 chose (if "conditional layers", this task exposes `selectActiveOverlays(overlays, flags)` that runtime will call).
- A test flips one flag and asserts the resolved weather/cast/dialogue_refs differ.
- `api/runtime` gains a trivial consumer of `selectActiveOverlays` or `ResolvedScene` so the "consumer in both modules" DoD (Sprint 02 precedent) holds.

- m-66 Add the `flags` argument and `selectActiveOverlays`.
- m-67 Flag-flip test (true → false → true).
- m-68 Runtime consumer in `api/runtime/src/` + its test.

---

## SC-313 · Composition property + golden tests · M · P1 · needs SC-303b, SC-304

fast-check suite (dependency added in BF-304):

- **Order independence:** shuffling the overlay array never changes the result.
- **Idempotence:** composing the result's own overlay set again yields the same scene.
- **Identity:** zero overlays → result equals base (modulo provenance).
- **Monotonic additivity:** adding an additive overlay never removes base content.
- **Conflict soundness:** every reported conflict has two overlays that really assign the same property; no conflict is reported when priorities differ.
- Golden fixtures live in `api/planning/test-fixtures/` (data only, loadable by F3).

- m-69 Arbitraries for scenes/overlays (bounded size, identifier-valid slugs).
- m-70 The five properties, ≥ 200 runs, deterministic seed in CI.
- m-71 Two golden fixtures + loader.
