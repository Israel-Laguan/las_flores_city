# Scene-Centric Backend

A proposal for a new backend — planning, compilation/migration, and runtime — built
around the **scene** as the unit of composition rather than the character. Built in a new
`api/` tree alongside the existing `server/`, `scripts/`, and `content/`, which keep
working until each old component's kill condition is met.

**Status:** SC-M1 complete. SC-M2's four exit criteria each have a passing test: flags & conditions
(SC-201–SC-206), the scene model and composition (SC-301–SC-313), the Postgres adapters and exit
demo (SC-314, SC-316–SC-319), artifact compile and the revision pointer with atomic flip and
rollback (SC-401–SC-406, sprint 4 T1–T2), and shared personality pools with the specificity ladder
(SC-306–SC-308, T3). One caveat: the pool criterion is met at **planning level only**; pools are not
compiled into artifacts yet, so runtime serving is SC-M3's first task. Still open: SC-315 (importer,
deferred), SC-320 (retro is the last step) and the SC-318 clean-checkout dry run. Everything past
SC-M2 is provisional and revised at retro. Per-story states: [backlog.md](backlog.md).

---

## Planning documents

Read these to know what is being built, in what order.

| Document | What it covers |
|---|---|
| [features.md](features.md) | Primary vs. secondary features, the priority test, the dependency graph and critical path, what is explicitly out of scope, and the known prerequisite gaps |
| [roadmap.md](roadmap.md) | Milestones SC-M1→SC-M6 with contents and exit criteria, timeline shape, old-path retirement kill conditions, and **the retro contract** that keeps all of this honest |
| [architecture.md](architecture.md) | The buildable shape: module layout, the enforced planning↔runtime boundary, schema and role ownership, the artifact/revision-pointer seam, technology decisions, and the concrete setup steps |
| [backlog.md](backlog.md) | Product backlog — 11 epics, 98 story rows with blockers and sizes, 13 spikes, 2 defects |
| [sprint-01.md](sprint-01.md) | **FIRM.** Foundation and spikes: module tree, boundary lint rule, schemas and roles, the two live defect fixes, six spikes |
| [sprint-02.md](sprint-02.md) | **COMPLETED.** Flags and conditions — the head of the critical path. SC-201–SC-206 are Done |
| [sprint-03.md](sprint-03.md) · [sprint-03/](sprint-03/README.md) | **Delivered except SC-315 (deferred) and SC-320 (close-out).** Scene model & composition + hygiene/bugfixes + spikes — 32 tasks / 91 mechanical sub-tasks, P0/P1/P2. Exit evidence: [sprint-03/EVIDENCE.md](sprint-03/EVIDENCE.md) |
| [spikes/](spikes/) | Spike write-ups, with the template and index |

## Reference and technical documents

Read these to know *why*. These are the source of the decisions above.

| Document | What it covers |
|---|---|
| [proposal.md](proposal.md) | The core proposal and its reasoning: runtime model (scene composition, character tiers, dialogue keying), the flag/relationship contract, the planning model and three checking tiers, coexistence strategy |
| [plan-graph-in-postgres.md](plan-graph-in-postgres.md) | Whether Postgres replaces Neo4j for plan diffing, overlay, traversal, conflict and similarity — proposed schema shape, capability comparison, and the three-workload separation (planning OLTP / runtime serving / existing OLAP) |
| [lessons-from-current-code.md](lessons-from-current-code.md) | What earned its place in the current code, what caused the pathologies this redesign fixes, and the **14 invariants (R1–R14)** the new backend is built to satisfy |
| [../../SCENE_OVERLAY_AUTHORING.md](../../SCENE_OVERLAY_AUTHORING.md) | How to author scenes and flag-gated overlays: the six ops, merge kinds, conflict rules, and a worked example from the golden fixtures |
| [brief-activity-and-assets.md](brief-activity-and-assets.md) | The brief sent for independent review on the two subsystems left unspecified — activity and assets — **plus the reviewer's answer** in §6 |

## Where to start

- **Building this week?** `sprint-01.md`, then `architecture.md` §7.
- **Deciding whether to build it at all?** `proposal.md` §1, then `features.md` §1.
- **Reviewing the design?** `proposal.md`, then `lessons-from-current-code.md` §3 for the
  rules it must satisfy.
- **Questioning the datastore?** `plan-graph-in-postgres.md`.

## Open decisions

Six architectural decisions are open (A1, A2, A4, A5, A7, A8; A3 and A6 are resolved), each with
a milestone by which it must be settled — `architecture.md` §9. Two prerequisite gaps still have no
owner — `features.md` §6: the `asset_fallback` consumer (A7 / SC-808) and A1. The most consequential
unsettled question is **A1: file-canonical (YAML) vs. DB-canonical content**, due by SC-M4.

## Prior work this supersedes

- `docs/CHARACTER_DATA_MODEL.md` — the earlier character-schema-first direction. Superseded
  in framing; its corpus diagnosis (182 personality snowflakes, 55 `faction: independent`,
  three-way expression drift) still holds and is reproduced here.
- The earlier character-data-model-and-intake strategy / context-brief (not in this
  checkout) — internal critique that overturned the character-first framing; the
  diagnosis is reproduced in this pack rather than linked as a live path.
