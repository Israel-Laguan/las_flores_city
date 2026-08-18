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

- **Graph store: Neo4j.** Finalized in the M19 analysis stage (see
  `M19-foundation.md§Analysis`). Rationale: Bloom/Neodash visual editing is a
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
M19 (foundation: boundaries + content-read pool + analysis)
   │
   └──► M20 (intake hardening: deterministic gate + conflict scan)
            │
            └──► M21 (process split: intake-worker / B1)
                     │
                     ├──► M22 (durable/resumable/idempotent jobs)
                     │
                     ├──► M23 (content externalization → CDN)
                     │
                     └──► M24 (patch versioning + claims/evidence)
                              │
                              ├──► M25 (entity identity + bounded conflict detection)
                              │         │
                              │         └──► M26 (AI Critique Service ↗️ nodes)
                              │
                              └──► M27 (graph authoring: seed + delta model)
                                       │
                                       └──► M28 (graph merge + exporter)
                                                │
                                                └──► M29 (chat assistant + review queue)
                                                         │
M30 (pre-resolved overlay snapshots ── endgame, deferred) │
M31 (task-graph agent swarm ────────── optional, deferred)┘
                                        │  after M28 + M29 flip flags
                                        ▼
                                       M32 (authoring-path retirement: Pin → Prove → Prune)
```

| # | Milestone | Phase | Core value | Risk |
|---|-----------|-------|-----------|------|
| **M19** | Foundation: module boundaries + content-read pool + AGE-vs-Neo4j analysis | 0 | Code reflects the data decoupling; content reads leave the gameplay pool; graph decision locked | Low |
| **M20** | Intake hardening: deterministic validation harness + intake conflict scan | 1 | "Never let fuzzy extraction mutate canon" pre-approve gate | Medium |
| **M21** | Process split: extract `intake-worker` (B1) | 2 | AI/generation never starves the game event loop | Med-High |
| **M22** | Durable, resumable, idempotent job runtime | 3 | Jobs survive failures; resume from partial state | Medium |
| **M23** | Content externalization phase 1 (chunks + dialogues → CDN) | 4 | OLTP content reads drop to ~zero on the hot path | Medium |
| **M24** | Patch-level versioning + claims/evidence store | 5 | Rollback = lookup; deliberation is persisted | Medium |
| **M25** | Entity identity resolution + bounded conflict detection | 5 | Stable identity, no silent LLM best-guess | Medium |
| **M26** | AI Critique Service + `:Conflict`/`:Suggestion` nodes | 6 | Semantic critique as graph annotations | Medium |
| **M27** | Graph authoring canvas: seed + delta model (read path) | 7 | Neo4j becomes the authoring front-end | High |
| **M28** | Graph merge + graph→ContentPlan exporter (write path) | 7 | Approve triggers graph-merge → existing materialize | High |
| **M29** | Chat assistant (chatExplain/chatPropose) + `needs_review` queue | 8 | Human-in-the-loop review & fix loop | Medium |
| **M32** | Authoring-path retirement: Pin → Prove → Prune | 7/8 | Delete the superseded `plan_json` authoring surface + legacy LLM methods the same PR that flips the flags | Medium |
| **M30** | Pre-resolved per-state overlay snapshots | Phase A in progress | Kill the Redis merge step | Med (Phase A in progress) |
| **M31** | Task-graph agent swarm | optional | 80% benefit already covered by M21–M22 + M29 | High (deferred) |

---

## How to run a milestone

1. Create branch `milestone/MM-<short-slug>` following convention, e.g.
   `milestone/19-foundation`.
2. Open the matching `M##-*.md` doc; follow **Goal → Scope → Key changes →
   Verification → Definition of Done**.
3. Keep the PR at ~25 files. If it grows past that, split into two (see the deferred
   note in the milestone doc).
4. On merge, update the doc header **Status → Shipped** and mark resolved decisions in
   `ARCHITECTURE_SEPARATION_ANALYSIS.md` §11.