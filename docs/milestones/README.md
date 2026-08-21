# Milestone Roadmap — Architecture Separation & Story-Engine Authoring

> **Status:** Active planning · **Owner:** story-engine effort
> **Source:** [`ARCHITECTURE_SEPARATION_ANALYSIS.md`](../ARCHITECTURE_SEPARATION_ANALYSIS.md)
> (sequencing §10 + four-moment lifecycle §12–13 + enrichment §15).
>
> Each milestone below is a **single pull request** targeting **~25 files** (or smaller
> when high complexity/risk, larger when mechanical). Every milestone is independently
> shippable and leaves the game server functional. The numbering continues the repo's
> existing **M-convention** (`M01–M08`, `M13–M18` are complete).

---

## Locked decisions

- **Graph store: Neo4j.** Finalized during the foundation work (see
  [`GRAPH_AUTHORING_ARCHITECTURE.md`](../GRAPH_AUTHORING_ARCHITECTURE.md)). Rationale: Bloom/Neodash visual editing is a
  game-changer for the admin graph-canvas authoring UX; `plan_json` (JSONB) is the
  baseline being replaced.
- **Production is a build artifact.** Canon lives in the authoring layer (Postgres +
  Neo4j + versions + proposals); the runtime consumes a *compiled* JSON/CDN package.
  Neo4j is an **authoring IR** — never on the game hot path.
- **LLMs propose; the core system commits.** No fuzzy extraction ever mutates canon
  directly; everything lands as a proposable, human-reviewable delta.

---

## Milestone overview & dependency graph

```text
Foundation/runtime architecture → graph authoring architecture → authoring retirement
                                         │
                                          ├──► M30 (pre-resolved overlay snapshots; Phase A in progress)
                                          ├──► M31 (task-graph agent swarm; deferred)
                                          └──► M41 (documentation gap cleanup)
                                                   │
                                                   ├──► M42 (content assets + migration)
                                                   ├──► M43 (plan migration effectiveness)
                                                   ├──► M44 (prompt-variant tooling)
                                                   └──► M45 (snapshot closeout + M31 decision)
```

| # | Milestone | Phase | Core value | Risk |
|---|-----------|-------|-----------|------|
| **Architecture docs** | Runtime/intake, graph authoring, and authoring retirement contracts | Complete | Durable current-state architecture outside milestone planning | — |
| **M30** | Pre-resolved per-state overlay snapshots | Phase A in progress | Kill the Redis merge step | Med (Phase A in progress) · docs: M30-snapshots.md, M30-benchmark-results.md |
| **M31** | Task-graph agent swarm | optional | Most benefit is already covered by the runtime and graph-authoring architecture | High (deferred) · doc: M30-M31-deferred.md |
| **M41** | Documentation gap cleanup and backlog ownership reconciliation | Complete | Keep milestone claims and ownership aligned with current code | Low |
| **M42** | Content assets and migration completion | Planned | Finish missing content images/files, publish assets, and prove content migration is complete | Medium · doc: M42-content-assets-migration.md |
| **M43** | Plan-to-migration effectiveness | Planned | Confirm the authoring plan pipeline produces verified migrated content without a parallel write path | Medium · doc: M43-plan-migration-effectiveness.md |
| **M44** | Prompt-variant tooling reconciliation | Shipped | Align generators and validators with the canonical prompt/asset-variant contract | Medium · doc: M44-prompt-variant-tooling.md |
| **M45** | Snapshot closeout and M31 decision | Planned | Close the M30 evidence loop and record whether deferred task-graph work remains justified | Medium · doc: M45-snapshot-closeout.md |

---

## How to run a milestone

1. Create branch `milestone/MM-<short-slug>` following convention, e.g.
   `milestone/30-snapshots`.
2. Open the matching active `M##-*.md` doc; follow **Goal → Scope → Key changes →
   Verification → Definition of Done**. Use the architecture documents for current-state
   contracts and implementation boundaries.
3. Keep the PR at ~25 files. If it grows past that, split into two (see the deferred
   note in the milestone doc).
4. On merge, update the active milestone header **Status → Shipped** and record durable
   architecture decisions in the relevant document under `docs/`.
