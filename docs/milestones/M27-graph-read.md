# M27 — Graph Authoring Canvas: Seed + Delta Model (Read Path)

> **Status:** Planned · **Branch:** `milestone/27-graph-read` · **PR size target:** ~25 files
> **Phase:** 7 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §8; decision locked in M19 (Neo4j)

## Goal

Stand up the Neo4j authoring canvas as the front-end for plan authoring. Seed a production
base graph, express plans as deltas tagged with `plan_id`, and support merged-view queries.
**Read path only** — the write/merge path is M28.

## Scope

| Item | Detail |
|---|---|
| **Neo4j service** | container in `docker-compose.yml` + `Neo4jClient` driver wrapper |
| **Seed/import script** | content/ YAML + DB FKs → graph base (`plan_id=NULL`) |
| **Delta model** | `ADD` / `MODIFY`(shadow) / `DELETE`(tombstone) deltas tagged `plan_id` referencing `content_plans.id` |
| **Merged-view query** | live preview of "lore if approved" for a plan |
| **Impact analysis traversal** | `"What links to character X?"`, 1-hop edits, cycle detection |
| **Shared schemas** | `GraphDeltaSchema` (+ `ADD/MODIFY/DELETE`, shadow/tombstone) |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| Infra | `docker-compose.yml` (neo4j service), new `Neo4jClient.ts` |
| Scripts | new seed/import script (`scripts/`) |
| New service | `GraphDeltaService.ts`, `GraphQueryService.ts` |
| Shared schemas | `graph-delta.ts` (+ node/edge types) |
| Authoring | begin re-pointing plan authoring from `plan_json` to graph deltas |
| Tests | integration for seed + delta-write + merged-view |

## Risks & verification

- **Risk:** High. This is the largest conceptual shift; graph→ContentLink mapping must be
  designed carefully so edge types map back to `field` names. Keep a feature-flag so
  `plan_json` authoring still works until M28 lands.
- **Verify:** seed the graph from existing content; write a plan as deltas; merged-view
  reflects the post-approve state; impact queries work.
- **Accept:** authoring reads work against Neo4j while `plan_json` write path remains
  functional (dual-path during migration).

## Definition of Done

- [x] Neo4j running; base graph seeded from content/ + DB FKs
- [x] Plan authored as `ADD/MODIFY/DELETE` deltas tagged `plan_id`
- [x] Merged-view query previews post-approve state
- [x] Impact-analysis traversal works; existing `plan_json` path still functional (flag)

## Implementation notes

- **Neo4j Community constraint**: the graph uses `neo4j:5-community`, which does
  **not** support composite `NODE KEY` constraints (Enterprise-only). Canon
  `(:Content)` + `(:ContentDelta)` uniqueness is enforced with a surrogate
  `key` property (`nodeType:nodeId` / `nodeType:nodeId:planId`) under
  single-property `UNIQUE` constraints. `MERGE` keys on `key`.
- **Delta fields**: Neo4j properties cannot be maps, so `ContentDelta.fields` is
  stored as a JSON string (`fieldsJson`) and parsed back in the service/query.

### M27-b readiness (substrate this milestone leaves in place)

M27-b (AI critique into the graph) reads the following seams; all exist here:

1. **`(:Content)` base nodes keyed on `(nodeType, nodeId)`** — every canon entity
   (Character, Scene, Dialogue, Mission, Overlay, Location) seeds as a
   `:Content` node carrying `nodeType`, `nodeId`, `name` + canon fields.
   M27-b links `(:Conflict)-[:FLAGGED_IN]->(:Content)` and its
   `Neo4jNeighborhoodProvider` traverses exactly this shape.
2. **`Neo4jClient`** (`server/src/services/Neo4jClient.ts`) — lazy singleton bolt
   driver wrapper (`getDriver()`/`session()`/`runNeo4jQuery()`/`closeNeo4j()`),
   reused by M27-b and M28.
3. **`NEO4J_ENABLED` flag default OFF, non-fatal boot** — when off/unreachable,
   existing Postgres paths + M26's `PostgresExistingNeighborhoodProvider` keep
   working; the intake-worker logs a warning and never aborts boot.
4. **Env + compose wiring** — `NEO4J_*` in `.env.example`, `neo4j` service
   in `docker-compose.yml` (internal-only, service-name reachable).
5. **`ExistingContentContext` adjacency documented** in `NeighborhoodProvider.ts`
   so the M27-b provider reproduces the exact shape with no LLM/prompt/hash
   changes.

**How to seed the base graph**

```bash
npm run seed:graph --workspace=server        # requires NEO4J_ENABLED=true
```