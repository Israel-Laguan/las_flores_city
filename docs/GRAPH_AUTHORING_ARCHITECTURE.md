# Graph Authoring Architecture

This document is the durable architecture reference for the graph authoring, critique,
and conversational review system established during the former M26-M29 work.

## Neo4j Authoring IR

Neo4j is the authoring graph and a disposable intermediate representation, never part of
the game hot path. The graph store decision is Neo4j rather than Apache AGE because the
admin authoring experience benefits from Bloom/Neodash visual relationship editing and
impact traversal. Neo4j is optional at boot: `NEO4J_ENABLED` defaults off and an unavailable
graph must not abort either server process.

The substrate includes the compose service, `Neo4jClient`, graph seed/import support,
`NEO4J_*` configuration, and `neo4j-driver`. Community Neo4j uses a surrogate `key`
property for uniqueness rather than Enterprise-only composite node keys. Delta map fields
are stored as JSON strings because Neo4j properties cannot be maps.

## Base Graph And Deltas

Canon entities seed as `(:Content)` nodes keyed by node type and entity ID. Plan changes are
`ADD`, `MODIFY`, or `DELETE` deltas tagged with `plan_id`:

- `ADD` creates a proposed entity or relationship.
- `MODIFY` stores shadow fields.
- `DELETE` stores a tombstone.

Merged-view queries combine the base graph and plan deltas to preview the post-approval
state. Impact traversal answers relationship questions such as “what links to character
X?” and supports cycle detection.

## Critique Annotations

The critique contract is durable in Postgres `critique_annotations`; Neo4j is the graph
projection and authoring IR. `AICritiqueService` gathers bounded neighborhoods, calls the
appropriate LLM model, requires evidence excerpts, and caches by `(ai_model, input_hash)`.
Only error-severity conflicts participate in the pre-approval caution.

`NeighborhoodProvider` is the seam between critique and graph access:

- The Postgres provider is the safe fallback when Neo4j is disabled or unavailable.
- `Neo4jNeighborhoodProvider` performs bounded Cypher traversal when the graph is enabled.

`GraphCritiqueService` promotes existing Postgres rows into `(:Conflict)` and
`(:Suggestion)` nodes linked with `[:FLAGGED_IN]` to `(:Content)`. Graph writes are
best-effort and never false-block approval. Postgres remains the durable source of truth.
Admin overlays and cache reads use the graph when enabled and fall back to Postgres.

## Graph Write Path

Approval follows this path:

```text
plan deltas -> GraphMerger -> GraphExporter -> ContentPlan ->
stagePlan -> applyLink -> migrateContent -> verifyPlan
```

`GraphMerger` promotes plan deltas into the production graph and applies tombstones.
`GraphExporter` maps covered graph edge types back to `ContentLink` field names. The
materialization pipeline remains unchanged.

`plan_json` is retained only as exporter transport for the existing materialization
pipeline. It is not an independent authoring surface when graph mode is enabled. Direct
edits are rejected when graph deltas are present, and graph resynchronization/drift checks
protect re-approval.

## Chat And Review

The admin chat layer separates explanation from proposal:

- `chatExplain` returns prose and does not trigger structured mutation.
- `chatPropose` returns a validated `GraphDelta`.
- `apply-delta` validates the delta, writes it, marks the addressed conflict, and refreshes
  the merged view.
- `needs_review` presents diff-style previews and keep/accept/merge/edit actions.

Chat history is intentionally ephemeral. The request carries a capped recent message
history; only delta application or discard creates durable writes. Admin/content-authoring
routes run on the intake worker, not the game server.

## Verification

Graph integration tests require a live Neo4j with `NEO4J_ENABLED=true`. The essential
acceptance flow is:

```text
known contradiction -> analyze -> evidence-backed Conflict -> chatExplain ->
chatPropose -> apply-delta -> addressed conflict -> refreshed merged view
```
