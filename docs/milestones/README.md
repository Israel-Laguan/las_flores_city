# Active Milestone Roadmap — Architecture Separation & Story-Engine Authoring

> **Status:** Active planning · **Owner:** story-engine effort
> **Source:** [`ARCHITECTURE_SEPARATION_ANALYSIS.md`](../ARCHITECTURE_SEPARATION_ANALYSIS.md)
> (sequencing §10 + four-moment lifecycle §12–13 + enrichment §15).
>
> This index contains current actionable or explicitly deferred work. Completed milestone
> history belongs in the durable architecture documents and git history, not in this list.

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

## Active Work & Dependency Graph

```text
Foundation/runtime architecture → graph authoring architecture → authoring retirement
                                           │
                                           ├──► M31 (task-graph agent swarm; deferred)
                                           ├──► M42 (asset pipeline test follow-up; open)
                                           └──► M45 (snapshot closeout; planned)
```

| # | Milestone | Phase | Core value | Risk |
|---|-----------|-------|-----------|------|
| **Architecture docs** | Runtime/intake, graph authoring, content delivery, and authoring-retirement contracts | Current | Durable current-state architecture outside milestone planning | — |
| **M31** | Task-graph agent swarm | Deferred | Schedule only if durable jobs, specialized passes, and human review prove insufficient | High · doc: M31-deferred.md |
| **M42** | Asset pipeline test follow-up | Open | Add focused generator and validator regression coverage | Low · doc: M42-content-assets-migration.md |
| **M45** | Snapshot closeout | Planned | Reconcile current snapshot evidence and make the M31 decision | Medium · doc: M45-snapshot-closeout.md |

---

## How to run a milestone

1. Create branch `milestone/MM-<short-slug>` following convention.
2. Open the matching current `M##-*.md` doc; follow its **Goal → Scope → Acceptance
   Criteria → Verification** contract and use architecture documents for current-state
   boundaries.
3. Keep the PR focused; split work when complexity or risk makes a single change hard to
   review.
4. Move durable architecture decisions into `docs/` rather than retaining completed
   milestone transcripts.
