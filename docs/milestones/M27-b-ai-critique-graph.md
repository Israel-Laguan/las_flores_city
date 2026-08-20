# M27-b — AI Critique into the Graph (follow-up to M26)

> **Status:** Shipped (defers the Neo4j write from M26) · **Branch:** `milestone/27b-ai-critique-graph` · **PR size target:** ~25 files
> **Phase:** 7 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §12 Moment 3, §13; `M26-ai-critique.md`

## Goal

Lift the M26 AI-critique annotations into the Neo4j authoring graph once M27 has stood up the
graph substrate. M26 persists `:Conflict` / `:Suggestion` annotations to Postgres
(`critique_annotations`) with the portable node contract; this milestone writes them as
real graph nodes + edges and reads the overlays back from the graph.

## Scope

| Item | Detail |
|---|---|
| **`Neo4jNeighborhoodProvider`** | replace the M26 `PostgresExistingNeighborhoodProvider` with a bounded Cypher traversal per entity (swap the same `NeighborhoodProvider` seam — no LLM/parse/persist changes) |
| **Write annotations as nodes** | `critique_annotations` rows → `(:Conflict)` / `(:Suggestion)` nodes with `ai_model` + `input_hash` + `status`, linked `-[:FLAGGED_IN]-> (:Content)` |
| **Backfill / promotion** | one-off script promoting existing M26 Postgres rows into graph nodes; graph write on each new `analyze` |
| **Read overlays from graph** | admin overlays read the graph rather than Postgres |
| **`markAddressed`** | set `status='addressed'` on the graph conflict when M29's `apply-delta` resolves it |
| **Cache via graph** | `(ai_model, input_hash)` cache key stays; hits query the graph |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| Neo4j seam | `server/src/services/NeighborhoodProvider.ts` (`Neo4jNeighborhoodProvider`) |
| Graph service | `Neo4jClient.ts`, `GraphCritiqueService.ts` (write/read annotations) |
| Scripts | backfill script `scripts/` (Postgres rows → graph nodes) |
| Routes | `admin-story-builder-actions.ts` (analyze/annotations now graph-backed) |
| M26 service | `AICritiqueService.ts` — persist graph nodes via the swapped seam |
| Shared schemas | `critique-annotation.ts` (no change to contract) |
| Tests | integration for a single (optionally Neo4j-backed) critique run |

## Risks & verification

- **Risk:** Medium. Requires M27's Neo4j seed + `Neo4jClient` to exist. The graph is a
  disposable authoring IR, so a failed write only leaves annotations stale (rebuildable
  from Postgres rows). No impact on the game hot path.
- **Verify:** run analyze on a plan with a known narrative contradiction; confirm a
  `(:Conflict)` node with evidence + provenance is written in Neo4j; confirm re-analyze on
  an unchanged subgraph is cached (graph-based). Confirm existing M26 Postgres rows
  backfill into graph nodes.
- **Accept:** contradictions surface as graph annotation nodes with evidence + provenance;
  no false blocking; M26 Postgres rows migrate without re-deriving the critique.

## Definition of Done

- [x] `Neo4jNeighborhoodProvider` drives critique neighborhood queries via Cypher
      (`server/src/services/NeighborhoodProvider.ts`; degrades to the Postgres
      gatherer when `NEO4J_ENABLED` is off, so the input-hash/prompt logic is unchanged)
- [x] `analyze` writes `(:Conflict)` / `(:Suggestion)` nodes `-[:FLAGGED_IN]-> (:Content)`
      (`server/src/services/GraphCritiqueService.ts`, wired from `AICritiqueService`)
- [x] Admin overlays read annotations from the graph (`getAnnotations`/`findCached`
      route through `GraphCritiqueService` when enabled, Postgres fallback)
- [x] Backfill promotes M26 Postgres rows (`scripts/backfill-critique-graph.ts`);
      `markAddressed` wired to M29 `apply-delta` (`GraphCritiqueService.markAddressed`)

## Implementation notes

- Postgres `critique_annotations` rows remain the durable source of truth; the graph is a
  disposable authoring IR. `analyze` writes both (graph write best-effort, never false-blocks),
  and reads/cache come from the graph when `NEO4J_ENABLED`, falling back to Postgres when the
  graph is off or a graph read fails.
- This milestone ships the **M27-graph-read substrate foundation** inlined (the `neo4j` compose
  service, `Neo4jClient`, base `(:Content)` seed, `NEO4J_*` env, `neo4j-driver` dep) because M27-b
  depends on it; M27's full delta-model authoring canvas remains documented under `M27-graph-read.md`.

