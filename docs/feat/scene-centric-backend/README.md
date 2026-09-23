# Scene-Centric Backend

A proposal for a new backend — planning, compilation/migration, and runtime — built
around the **scene** as the unit of composition rather than the character. Built in a new
`api/` tree alongside the existing `server/`, `scripts/`, and `content/`, which keep
working until each old component's kill condition is met.

**Status:** SC-M1 complete; SC-M2+ not started. Sprint 1 is firm; everything past sprint 2 is
provisional and revised at retro.

---

## Planning documents

Read these to know what is being built, in what order.

| Document | What it covers |
|---|---|
| [features.md](features.md) | Primary vs. secondary features, the priority test, the dependency graph and critical path, what is explicitly out of scope, and the known prerequisite gaps |
| [roadmap.md](roadmap.md) | Milestones SC-M1→SC-M6 with contents and exit criteria, timeline shape, old-path retirement kill conditions, and **the retro contract** that keeps all of this honest |
| [architecture.md](architecture.md) | The buildable shape: module layout, the enforced planning↔runtime boundary, schema and role ownership, the artifact/revision-pointer seam, technology decisions, and the concrete setup steps |
| [backlog.md](backlog.md) | Product backlog — 9 epics, ~60 stories with blockers and sizes, 6 spikes, 2 defects |
| [sprint-01.md](sprint-01.md) | **FIRM.** Foundation and spikes: module tree, boundary lint rule, schemas and roles, the two live defect fixes, six spikes |
| [sprint-02.md](sprint-02.md) | **PROVISIONAL.** Flags and conditions — the head of the critical path. Becomes firm at sprint 1's retro |
| [spikes/](spikes/) | Spike write-ups, with the template and index |

## Reference and technical documents

Read these to know *why*. These are the source of the decisions above.

| Document | What it covers |
|---|---|
| [proposal.md](proposal.md) | The core proposal and its reasoning: runtime model (scene composition, character tiers, dialogue keying), the flag/relationship contract, the planning model and three checking tiers, coexistence strategy |
| [plan-graph-in-postgres.md](plan-graph-in-postgres.md) | Whether Postgres replaces Neo4j for plan diffing, overlay, traversal, conflict and similarity — proposed schema shape, capability comparison, and the three-workload separation (planning OLTP / runtime serving / existing OLAP) |
| [lessons-from-current-code.md](lessons-from-current-code.md) | What earned its place in the current code, what caused the pathologies this redesign fixes, and the **14 invariants (R1–R14)** the new backend is built to satisfy |
| [brief-activity-and-assets.md](brief-activity-and-assets.md) | The brief sent for independent review on the two subsystems left unspecified — activity and assets — **plus the reviewer's answer** in §6 |

## Where to start

- **Building this week?** `sprint-01.md`, then `architecture.md` §7.
- **Deciding whether to build it at all?** `proposal.md` §1, then `features.md` §1.
- **Reviewing the design?** `proposal.md`, then `lessons-from-current-code.md` §3 for the
  rules it must satisfy.
- **Questioning the datastore?** `plan-graph-in-postgres.md`.

## Open decisions

Eight architectural decisions are open, each with a milestone by which it must be settled —
`architecture.md` §9. Four prerequisite gaps have no owner yet — `features.md` §6. The most
consequential unsettled question is **A1: file-canonical (YAML) vs. DB-canonical content**,
due by SC-M4.

## Prior work this supersedes

- `docs/CHARACTER_DATA_MODEL.md` — the earlier character-schema-first direction. Superseded
  in framing; its corpus diagnosis (182 personality snowflakes, 55 `faction: independent`,
  three-way expression drift) still holds and is reproduced here.
- The earlier character-data-model-and-intake strategy / context-brief (not in this
  checkout) — internal critique that overturned the character-first framing; the
  diagnosis is reproduced in this pack rather than linked as a live path.
