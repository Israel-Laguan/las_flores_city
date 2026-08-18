# M26 — AI Critique Service + `:Conflict`/`:Suggestion` Nodes

> **Status:** Shipped · **Branch:** `milestone/26-ai-critique` · **PR size target:** ~25 files
> **Phase:** 6 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §12 Moment 3, §13

> **Design note (decided before implementation):** the graph substrate (Neo4j) ships in
> M27/M27-b, so this milestone persists annotations to Postgres (`critique_annotations`)
> with the exact shape of the future Neo4j node contract. See below.

## Goal

Add the **AI semantic critique** layer (Moment 3) that writes `:Conflict`/`:Suggestion`
annotation nodes into the Neo4j graph, neighborhood-scoped per entity. This is a service
composition, not a new provider method.

## Scope

| Item | Detail |
|---|---|
| **`AICritiqueService`** | query graph neighborhood (not full dump) → LLM → parse structured JSON → write `:Conflict`/`:Suggestion` nodes with `ai_model` + provenance |
| **`POST .../plans/:id/analyze`** | new endpoint; triggers on-save (event), manual "Analyze," and a pre-approve gate |
| **Two-model split** | cheap model for per-entity scans (most conflicts local); stronger model for cross-entity/cross-mission scans |
| **Annotation caching** | `ai_model` + input-hash so unchanged subgraphs aren't re-analyzed |
| **Admin UI** | `:Conflict` overlays + "Copy to Chat" affordance (pairs with M29) |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| New service | `server/src/services/AICritiqueService.ts` |
| Route | `server/src/routes/admin-story-builder-verification.ts` (analyze endpoint) |
| Neo4j client | `server/src/services/Neo4jClient.ts` (reused by M27+) |
| LLM | `LLMPrompts.ts`, `LiteLLMProvider.ts` (structured-output parse) |
| Admin UI | analyze panel + conflict overlays (+ tests) |
| Tests | integration for a single Neo4j-backed critique run |

## Risks & verification

- **Risk:** Medium. LLM hallucination (false positives/negatives) — mitigated by always
  showing evidence text excerpts and only gating approval on `error` severity; cost/latency
  of nested loops mitigated by cheap-model + caching.
- **Verify:** run analyze on a plan with a known narrative contradiction; confirm a
  `:Conflict` node with evidence is written; confirm re-analyze on unchanged subgraph is
  cached.
- **Accept:** contradictions surface as annotation nodes with evidence + provenance; no
  false blocking.

## Definition of Done

- [x] AICritiqueService writes `:Conflict`/`:Suggestion` nodes with provenance
- [x] `analyze` endpoint + pre-approve gate wired
- [x] Two-model split + annotation caching
- [x] Admin shows overlays + "Copy to Chat" (stub until M29)
## Implementation notes

- **Postgres-first, Neo4j deferred to M27-b.** In absence of the Neo4j substrate, the
  `:Conflict` / `:Suggestion` annotation nodes are persisted durably to the
  `critique_annotations` Postgres table (migration `070_critique_annotations.sql`). The
  schema is the portable node contract — it maps 1:1 onto `(:Conflict)` / `(:Suggestion)`
  graph nodes with `-[:FLAGGED_IN]->` edges. M27-b migrates rows into the graph.
- **`NeighborhoodProvider` seam** (`server/src/services/NeighborhoodProvider.ts`), so the
  canon gatherer is swappable without touching the LLM/parse/persist logic:
  - M26: `PostgresExistingNeighborhoodProvider` (wraps `ContentPlanService.gatherContext()`)
  - M27-b: `Neo4jNeighborhoodProvider` (bounded Cypher traversal)
- **Caching:** cached on `(ai_model, input_hash)` — a SHA-256 over serialized plan items +
  existing canon + scope. Re-analyzing an unchanged subgraph returns `{cached: true}` with
  the existing annotations (no LLM call); editing plan items or canon changes the hash.
- **Two-model split:** per-entity scans use the default (`LLM_MODEL`); cross-entity /
  cross-mission audits use `LLM_DEEP_MODEL` when set, falling back to `LLM_MODEL`.
- **Live overrides:** `PATCH .../annotations/:id {status}` lets authors dismiss
  false-positives (`dismissed`); M29's `apply-delta` sets `addressed`.
- **Anti-hallucination:** every annotation requires at least one evidence text excerpt;
  only `error`-severity conflicts surface in the pre-approve caution.
- **New files delivering this:** `AICritiqueService.ts`, `NeighborhoodProvider.ts`,
  `shared/src/schemas/critique-annotation.ts`, migration `070`,
  `server/tests/{unit,integration}` for the critique run + endpoints.
