# Sprint 01 — Foundation & Spikes

**Milestone:** SC-M1 · **Dates:** 2026-09-07 → 2026-09-20 (2 weeks) · **Status: FIRM**

**Sprint goal:** the skeleton exists with an enforced boundary, the two live correctness
defects are fixed, and every datastore assumption the roadmap rests on has a written
answer.

**Why this shape.** Nothing in this sprint builds a domain feature. That is deliberate —
the scene model depends on the condition grammar, which depends on flags, and the
`entity_edges` design depends on spike outcomes. Building a scene entity now means
rebuilding it in sprint 3. What this sprint buys is a boundary that is expensive to
retrofit, two bugs off the board, and the removal of guesswork from SC-M2 planning.

**Capacity.** ~7.5 working days of planned work assumed across 10 calendar days (75%)
for the **mandatory** scope; total load if no cuts is 4.5 days setup + 4.5 days spikes +
1 day defects = 10 days. **Note:** This exceeds the `roadmap.md` standard assumption of
60% because SC-M1 is foundational infrastructure — the sprint's 7.5-day mandatory load is
tightly sequenced and non-negotiable for SC-M2's success. The 2.5-day buffer is covered
by the cut order in §5 — the three non-mandatory spikes (SC-S3/SC-S4/SC-S6) are the
explicit capacity buffer. See §4 for the mandatory vs cuttable split.

**Detail layer.** Full context, dependencies, refined acceptance criteria (checked
against this repo's actual workspaces/CI/migration-runner/pooling setup — not just the
architecture doc's intent), and a ready-to-use execution prompt for each item live in
[`sprint-01/`](sprint-01/) — one folder per ticket/spike. `sprint-01/README.md` also
carries the corrected execution order (dependency-based, not document order — notably
`SC-S1` gates `SC-S2`/`SC-S3` and should run before them, and `SC-S5` has no dependency
and should run on day one rather than mid-sprint). This file stays the sprint-level
narrative: goal, capacity, cut order, DoD, retro.

---

## 1. Setup tasks

| Ticket | Size | Detail |
|---|---|---|
| SC-101 · Create the module tree | S | [sprint-01/SC-101-module-tree/](sprint-01/SC-101-module-tree/) |
| SC-102 · Boundary lint rule | S | [sprint-01/SC-102-boundary-lint/](sprint-01/SC-102-boundary-lint/) |
| SC-103 · Schemas and roles | M | [sprint-01/SC-103-schemas-and-roles/](sprint-01/SC-103-schemas-and-roles/) |
| SC-104 · Migration runner covers new schemas | S (reclassified — see detail) | [sprint-01/SC-104-migration-runner/](sprint-01/SC-104-migration-runner/) |
| SC-105 · CI job | S | [sprint-01/SC-105-ci-job/](sprint-01/SC-105-ci-job/) |
| SC-106 · Negative permission test | S | [sprint-01/SC-106-negative-permission-test/](sprint-01/SC-106-negative-permission-test/) |

**This must actually fail in CI** (SC-102's proof step) — an unenforced architectural
rule is a comment.

---

## 2. Spikes

Every spike produces `spikes/SC-S#-<slug>.md` containing: the question, what was run, the
raw numbers, the answer, and **what it changes**. A spike with no "what it changes"
section is not finished. Full briefs (context, dependencies, exact acceptance wording,
execution prompt) are in the linked folders — **read `sprint-01/README.md` first**, the
build order there is not the table order below.

| Spike | Box | Detail |
|---|---|---|
| SC-S1 · Project `entity_edges` from existing content | 1 day | [sprint-01/SC-S1-entity-edges-projection/](sprint-01/SC-S1-entity-edges-projection/) |
| SC-S2 · Recursive-CTE reachability cost | 0.5 day | [sprint-01/SC-S2-reachability-cost/](sprint-01/SC-S2-reachability-cost/) |
| SC-S3 · Overlay view with ADD + MODIFY | 1 day | [sprint-01/SC-S3-overlay-view/](sprint-01/SC-S3-overlay-view/) |
| SC-S4 · `pg_trgm` alias detection | 0.5 day | [sprint-01/SC-S4-pg-trgm-alias-detection/](sprint-01/SC-S4-pg-trgm-alias-detection/) |
| SC-S5 · Weather source | 0.5 day | [sprint-01/SC-S5-weather-source/](sprint-01/SC-S5-weather-source/) |
| SC-S6 · Serving baseline | 1 day | [sprint-01/SC-S6-serving-baseline/](sprint-01/SC-S6-serving-baseline/) |

---

## 3. Defects

| Defect | Size | Detail |
|---|---|---|
| D1 · Revision-scoped chunk lookup | M | [sprint-01/D1-revision-scoped-chunk-lookup/](sprint-01/D1-revision-scoped-chunk-lookup/) |
| D2 · Choice-reachability validation | M | [sprint-01/D2-choice-reachability-validation/](sprint-01/D2-choice-reachability-validation/) |

> These fix the **current** `server/`, not the new backend. Worth doing anyway: they are
> live player-facing bugs. D1's fix shape informs SC-502 (revision-scoped artifact lookup); D2 informs SC-505 (choice-reachability validation). Both are
> fully isolated from the module-tree work and each other — schedule wherever they fit.

---

## 4. Definition of done

An item is done when: acceptance criteria are met; CI is green; and for spikes, the
write-up exists with a "what it changes" section. Not when the code works locally.

**Sprint is successful if:** SC-101 through SC-106 are done, D1 and D2 are fixed, and at
minimum SC-S1, SC-S2, and SC-S5 have written answers (mandatory load = 4.5 + 1 + 2 =
7.5 days, fitting the 7.5-day capacity). The remaining spikes (SC-S3, SC-S4, SC-S6)
are **not** required for this sprint's success and may slip to sprint 2 per §5 without the
sprint being a failure; if capacity runs short they are cut in the order SC-S4 → SC-S6 → SC-S3
before any mandatory item is deferred. **Critical:** SC-M1's exit criteria require every
sprint-1 spike to have a written answer (`roadmap.md` §1, exit criteria). Spikes that
slip to sprint 2 MUST be completed in sprint 2 before SC-M1 is closed — they cannot remain
open into sprint 3. If sprint 2's capacity cannot accommodate the spillover, SC-M1's
completion is explicitly delayed to sprint 3, noted in that retro.

## 5. If capacity runs short — cut in this order

1. **SC-S4** (`pg_trgm`) — feeds SC-706 in SC-M5, five sprints out.
2. **SC-S6** (serving baseline) — needed by SC-M3, not SC-M2.
3. **SC-S3** (overlay view) — needed by SC-M5.
4. ~~SC-104 rollback documentation~~ — forward-only is an acceptable interim answer. ✅ Done — SC-104/README.md + 095.sql reference corrected to roadmap.md §4.
5. ~~SC-105 CI job~~ — verified against actual ci.yml; no changes needed. ✅ Done — SC-105/README.md corrected (typecheck and api test steps already present in no-migrations job).

**Do not cut:** SC-102 (the boundary is the whole point of the sprint), SC-103/SC-106 (the
role split is the R9 enforcement mechanism), D1/D2 (live bugs), SC-S1/SC-S2 (they gate
SC-M5's entire design), SC-S5 (it blocks SC-M2 via A6).

## 6. Retro checklist

Per `roadmap.md` §5, in order: update this file with actual vs. planned and one sentence
per item that did not land; update `features.md` with any new prerequisite gap — **expect
at least one, spikes usually surface them**; update `roadmap.md` for SC-M1 and, if the
spikes changed what is believed, SC-M2; re-order `backlog.md`, deleting anything untouched
for three retros; promote `sprint-02.md` from provisional to firm with spike answers
folded in.

Also record: **planned vs. actual days per item.** There is no calibration data yet, and
without it sprint 6 cannot be planned honestly.

---

## 7. Not in this sprint

`architecture.md` §8 lists what is deliberately not set up and why. Briefly: no
`entity_edges` table (shape depends on SC-S1/S2), no scene entity, no compile step, no
intake changes, no asset or activity work. The existing `FILL_TARGETS` path keeps running
untouched.
