# Sprint 02 — Flags & Conditions

**Milestone:** SC-M1 (closes it) · **Dates:** 2026-09-21 → 2026-10-04 (2 weeks)
· **Status: FIRM** (completed in this session)

> **Status Update:** All committed tickets (SC-201 through SC-206) are now **Done**. The flag
definition shape, flag registry storage, condition grammar, condition evaluator, flag tracking,
and threshold-crossing mechanism are all implemented. The spike answers (SC-S1 through SC-S6) are
committed and reproducible.

**Sprint goal:** flags and conditions exist as real, shared primitives — a flag can be
declared with its latching semantics, and a condition referencing it evaluates identically
in `planning/` and `runtime/` through `contracts/`.

**Why this next.** F1 and F2 sit at the head of the critical path
(`features.md` §3): `F10 → F1 → F2 → F3 → F4 → F5`. Nothing about the scene model can be
built until a condition means something, and the condition grammar is what four separate
subsystems will later share. Getting it wrong is expensive; it is also small enough to get
right in one sprint.

**Capacity.** ~6 days planned across 10 calendar days. Load below is ~6 days plus whatever
sprint 1 spilled. Spillover is absorbed by cutting from §5, not by extending the sprint.

---

## 1. Committed tickets

### SC-201 · Flag definition shape · S · `contracts/flags`
The shape a flag declaration takes. **First-class authored object, not a string appearing
inside text** — today a typo in one of two places is undetectable.

**Acceptance**
- Type and schema define at minimum: `slug`, human-readable `meaning`, and
  `semantics: 'latching' | 'tracking'`.
- `semantics` is **required**, no default. An undeclared flag silently means different
  things in different places (`proposal.md` §3.3 rule 1).
- Schema rejects a slug that is not a stable identifier.
- Lives in `contracts/`, importable by both modules; imports nothing from either.

### SC-202 · Flag registry storage and repository · M · `planning/canon`
**Acceptance**
- Migration creates the registry table in the `planning` schema.
- Repository supports create, read, list, and retire — **retire, never delete**, matching
  the existing vocabulary-ageing pattern.
- Unique constraint on slug; a duplicate declaration fails at the database, not in
  application code (R8/R9 — make invalid states unrepresentable).
- The `runtime` role cannot read this table (asserted by SC-106's negative test extended).

### SC-203 · Condition grammar type · M · `contracts/condition`
The single grammar that scene selection, dialogue availability, item unlock, and mission
win conditions will all use (`proposal.md` §4.3).

**Acceptance**
- Expression type supports: flag test, negation, `and`, `or`, and a literal
  always-true/always-false.
- **No continuous-value comparison is representable.** Not "discouraged" — absent from the
  type. This is what keeps reachability decidable (`proposal.md` §3.1); if a condition can
  read `trust >= 3.5`, tier-3 checking dies.
- Serializes to and from JSON stably — the same expression yields the same string, so it
  can participate in content hashing.
- A statically extractable list of referenced flag slugs, for edge projection and tier-3.

### SC-204 · Condition evaluator · M · `contracts/condition`
**Acceptance**
- One implementation, consumed by both `planning/` and `runtime/`. Two evaluators would
  drift, and the drift would be a gameplay bug.
- Evaluates against a plain flag-set input; no database access, no I/O.
- Pure and total: every expression the type permits evaluates without throwing.
- Property test: for any expression and any flag set, evaluation terminates and returns a
  boolean.
- Unit tests cover each operator plus nesting to at least three levels.

### SC-205 · Flag set/read tracking · M · `planning`
Record which entities set a flag and which read it — the input tier-3 needs to answer
"orphan flag" and "dead end" (`features.md` S1).

**Acceptance**
- Given an entity payload containing conditions and effects, the set of flags it *sets* and
  the set it *reads* are both extractable.
- Extraction uses SC-203's static flag-slug list rather than a second parser.
- Stored in a form the later `entity_edges` projection can consume without rework.
- **Shape depends on SC-S1.** If the spike found the edge projection unnatural, this ticket
  is re-planned at the retro rather than built as written.

### SC-206 · Threshold crossing sets a flag as an event (fixture-backed mechanism) · M
When a relationship stat crosses a declared threshold, a flag is **set and persisted** —
not derived by querying the stat at read time.

**Acceptance**
- Crossing is recorded as an event that sets the flag.
- Nothing in the read path queries a stat to decide whether a flag holds. Deriving it at
  read time smuggles continuous reads back into resolution and voids the decidability
  property (`proposal.md` §3.3 rule 2).
- `latching` flags persist after the stat falls back below the threshold; `tracking` flags
  clear. Both behaviours are tested against a **fixture stat source** (no real
  relationship-stat table or delta wiring required in this sprint).
- **Readiness scope:** this ticket is **Ready** only as the fixture-backed mechanism.
  Real relationship-stat integration (reading actual `relationship_stats` / emitted deltas,
  `SC-E8` S3) remains **blocked on S3** and is not part of this sprint's commitment —
  it is tracked as a follow-up (SC-811) blocked on SC-M6. This ticket's tests
  MUST pass without a live stat pipeline.

> **Backlog alignment:** `backlog.md` SC-206 is marked Ready for the fixture-backed
> mechanism; the real-stat wiring is the blocked follow-up. Only the fixture-backed
> shape is committed to sprint 02.

---

## 2. Stretch — only if the committed set lands early

| ID | Story | Why stretch |
|---|---|---|
| SC-S3 | Overlay view spike, if it slipped from sprint 1 | Feeds SC-M5, not SC-M2 |
| SC-S4 | `pg_trgm` spike, if it slipped | Feeds SC-M5 |
| SC-S6 | Serving baseline, if it slipped | Needed by SC-M3 |

Do not pull SC-E3 (scene model) stories forward. SC-301 is blocked on SC-204 landing and
being *used* once; starting the scene entity in the same sprint the grammar is written
means designing against an interface that is still moving.

## 3. Exit criteria — these close SC-M1

From `roadmap.md` SC-M1:

- [ ] A flag can be declared, and a condition referencing it evaluates against a fixture
      player state in **both** `planning/` and `runtime/` via `contracts/`.
- [ ] The no-import rule fails CI when violated *(sprint 1)*.
- [ ] D1 and D2 have regression tests failing against old behaviour *(sprint 1)*.
- [ ] Every sprint-1 spike has a written answer in `spikes/`, including the ones that
      answer "no."

If the fourth item is not met, **SC-M1 does not close** even if every ticket here is done.
Unanswered spikes are what make SC-M2's plan fiction.

## 4. Definition of done

As sprint 1 §4. Additionally, for anything landing in `contracts/`: a consumer in both
`planning/` and `runtime/` must exist, even if trivial. A contract with one consumer is not
yet proven to be a contract.

## 5. If capacity runs short — cut in this order

1. **SC-206** — the mechanism can wait for SC-M6 when relationship stats are real. Cutting
   it does not block the critical path.
2. **SC-205** — needed by SC-M5, four sprints out, and its shape may change at retro anyway.
3. **Property test in SC-204** — keep the unit tests; the property test is the luxury.

**Do not cut:** SC-201, SC-203, SC-204. These three *are* the sprint goal, and every SC-E3
story is blocked behind them.

## 6. Known risk

**The condition grammar is the highest-leverage design decision in the sprint and the
easiest to get subtly wrong.** Four subsystems will depend on it and it participates in
content hashing, so a later change invalidates every compiled artifact.

Mitigation: keep it minimal. Flag tests and boolean composition only. Anything richer —
relative time comparisons, counting, quantifiers — is added later behind a version field
on the serialized form. Resist adding an operator because a future feature *might* need it;
R7 applies to grammar operators exactly as it does to columns.
