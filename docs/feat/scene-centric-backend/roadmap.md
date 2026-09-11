# Roadmap — Scene-Centric Backend

**Status:** Living document. Milestones SC-M1 and SC-M2 are firm; SC-M3 onward are
provisional and revised at each retro (§5).

**Track naming.** `SC-M*` deliberately does not continue the existing `M50–M54` sequence.
This is a parallel track, not the next item in the intake-pipeline series — the same
precedent `docs/DIALOGUE_CACHING_AND_CHARACTER_CASTING.md` sets for M54, which runs
outside the M50–M53 sequence.

**Cadence assumption.** One developer, two-week sprints, and roughly **60% of a sprint
available for planned work** — the rest absorbs interruptions, the existing `server/`, and
being wrong. A roadmap that assumes 100% is a roadmap that lies at the first retro.

---

## 1. Milestones

### SC-M1 — Foundation

*Sprints 1–2. The skeleton plus the two primitives everything gates on.*

| Contents | Feature |
|---|---|
| `api/{contracts,planning,runtime}` skeleton, no-import lint rule, CI wiring | F10 |
| Separate `planning.*` / `runtime.*` schemas and DB roles (rung 2 of §9.4) | F10 |
| Flag registry: definition, latching vs. tracking, set/read tracking | F1 |
| Condition grammar: expression type, evaluator, one shared implementation | F2 |
| D1/D2 fixes in the current `server/` | — |
| Spikes confirming the datastore assumptions | — |

**Exit criteria**
- A flag can be declared, and a condition referencing it evaluates against a fixture
  player state in both `planning/` and `runtime/` via `contracts/`.
- The no-import rule fails CI when violated (proven with a deliberate violation).
- D1 and D2 have regression tests that fail against the old behaviour.
- Every spike has a written answer in `spikes/`, including the ones that answer "no."

### SC-M2 — Scene model and compile

*Sprints 3–4. The unit exists and becomes an artifact.*

| Contents | Feature |
|---|---|
| Scene entity: location, time, weather, participants, items, dialogue references | F3 |
| Base + overlay composition; exclusive vs. additive resolution; priority precedence | F3 |
| Dialogue three-way keying and the specificity ladder | F7 |
| Compile step: content-addressed artifacts, manifest, atomic revision-pointer flip | F4 |
| Weather source decision (A6, resolved) and implementation: SC-305 (scene override field) + **SC-309, new** (`districts.weather` column, seed defaults, admin tooling) | F3 |

**Exit criteria**
- Two hand-authored scenes at one location — a base and a flag-gated overlay — compile to
  artifacts and resolve to different results as the flag flips.
- Equal-priority conflict on an exclusive property fails the compile.
- The revision pointer flips atomically and rolls back by flipping it again.
- A personality pool shared by two characters resolves correctly for both.

### SC-M3 — Runtime resolver

*Sprints 5–6. The slice is playable.*

| Contents | Feature |
|---|---|
| Player state: flags, current resolution, pinned cast, progress | F6 |
| Resolver: revision-scoped artifact lookup, condition evaluation, effect application | F5 |
| Choice-reachability validation before effects (new-backend equivalent of D2) | F5 |
| Scene pinning decision implemented (open question #3) | F3 |
| Serving benchmark baseline (prerequisite gap) | F5 |

**Exit criteria**
- A hand-authored scene slice is playable end to end in the existing client; the intake-authored slice is the SC-M4 exit criterion.
- A player session pins to a revision and is unaffected by a subsequent pointer flip.
- An unreachable choice submission is rejected with no effect applied.
- p50/p95 recorded for scene resolution and artifact fetch.

### SC-M4 — Scene-shaped intake

*Sprints 7–8. Writers can author the slice instead of hand-writing it.*

| Contents | Feature |
|---|---|
| Scene-shaped plan deltas: one description yields scene + participants + dialogue + flags | F8 |
| Tier-1 shape checks, per-tier required fields, live in the review step | F9 |
| Tier-2 reference checks against canon and within-plan | F9 |
| Approval granularity decision (open question #5) | F8 |

**Exit criteria**
- A writer describes a situation in natural language and the resulting plan, once
  approved, compiles and serves without hand-editing YAML.
- Shape and reference errors surface **before** approval, not at stage time.
- A plan referencing a nonexistent location cannot be approved.

### SC-M5 — Validation depth

*Sprints 9–10. The auto-check becomes genuinely useful.*

| Contents | Feature |
|---|---|
| `entity_edges` projection from entity payloads (note: some kinds like `located_in` require hand-authored mappings, per SC-S1) | S1 |
| Tier-3 anti-joins: orphan flags, dead ends, unreachable scenes, unreferenced items | S1 |
| Recursive-CTE reachability from game start | S1 |
| `pg_trgm` alias/duplicate detection | S10 |
| Hint engine over tier-3 results | S2 |

**Exit criteria**
- Tier-3 runs in CI and fails the build on a dead-end flag.
- The four anti-joins find at least one real problem in existing content, or the
  projection is demonstrated correct against a fixture that contains one.
- Reachability query has a recorded `EXPLAIN ANALYZE`.

### SC-M6 — Content model depth

*Sprints 11–13. The things that make content feel authored rather than structural.*

| Contents | Feature |
|---|---|
| Activity: 4-verb catalog, role-slot binding, `completion.type='none'` only | S4 |
| Asset look/expression model, mob pool, explicit signalled fallback chain | S5 |
| `asset_fallback` consumer — compile-time coverage report (prerequisite gap) | S5 |
| Character tier enforcement against asset requirements | S6 |
| Relationship stats and threshold→flag emission | S3 |

**Exit criteria**
- A mob pool serves several characters with no per-character asset rows.
- A named character missing its base look fails the compile; a missing optional
  expression warns and degrades along the documented chain.
- A stat crossing a threshold sets a flag as an event, and gating still reads only flags.

---

## 2. Timeline shape

```mermaid
gantt
  dateFormat YYYY-MM-DD
  axisFormat %b
  section Foundation
  SC-M1 Foundation           :m1, 2026-09-07, 28d
  section Core
  SC-M2 Scene + compile      :m2, after m1, 28d
  SC-M3 Runtime resolver     :m3, after m2, 28d
  section Authoring
  SC-M4 Scene-shaped intake  :m4, after m3, 28d
  SC-M5 Validation depth     :m5, after m4, 28d
  section Depth
  SC-M6 Content model        :m6, after m5, 42d
```

Dates are **shape, not commitment.** SC-M1 and SC-M2 are planned in detail; anything past
SC-M3 is an ordering claim with a duration guess attached.

## 3. What comes after SC-M6

Unordered, unscheduled, revisited when SC-M6 closes: missions (S7), items (S8), casting by
description (S9), lazy asset generation (S11), interactive activity and
`activity_sets_flag` (S12), and the decision on importing existing YAML content (S13).

## 4. Retirement of the old path

Retirement is driven by the coexistence rules in `proposal.md` §7 — vertical slices, one
owner of canon at every moment, a one-way old→new import and never a write-back.

| Old component | Kill condition |
|---|---|
| Old dialogue serving path | SC-M3 exit criteria met **and** all shipped content compiled into the new artifact form |
| `FILL_TARGETS` entity-shaped intake | SC-M4 exit criteria met **and** no plan authored through it for one full sprint |
| Three-registry portrait resolution | SC-M6 exit criteria met **and** the coverage report shows zero silent fallbacks |
| `latency_probe.ts` as ingestion harness | already owned by M54; not this track's concern |

Nothing is deleted before its kill condition is written down and met. A component whose
kill condition slips twice gets re-examined at retro — the parallel-system failure mode is
both paths living forever, and slipping kill conditions is its earliest symptom.

## 5. The retro contract

This is what keeps the roadmap honest rather than decorative.

**Every sprint retro updates, in this order:**

1. **`sprint-NN.md`** — actual vs. planned, and one sentence per item that did not land
   saying why.
2. **`features.md`** — any feature that moved between primary and secondary, and any new
   prerequisite gap discovered. Gaps are the most common finding.
3. **This document** — the milestone the sprint belonged to (contents and exit criteria),
   and the *next* milestone if the sprint changed what is believed about it.
4. **`backlog.md`** — re-order, split, or delete. A story untouched across three retros
   is deleted, not carried.
5. **`sprint-NN+1.md`** — promoted from provisional to firm, with the spike answers folded
   in.

**Rules that make the update real:**

- **Only one sprint is firm at a time.** The next sprint is provisional until its
  predecessor's retro. Two firm sprints is a forecast pretending to be a plan.
- **A spike that answers "no" is a success.** It gets written up in `spikes/` and the
  affected feature is re-planned, not quietly re-attempted.
- **Exit criteria are not renegotiated mid-milestone.** They can be *changed at retro*
  with the reason recorded. Moving them to match what happened is how a roadmap stops
  meaning anything.
- **Estimates are recorded and compared, not defended.** The point of tracking planned vs.
  actual is calibration; a solo dev with no calibration data cannot plan a sixth sprint.
