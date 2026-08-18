# M28 — Graph Merge + Graph→ContentPlan Exporter (Write Path)

> **Status:** Implemented · **Branch:** `milestone/28-graph-write` · **PR size target:** ~25 files
> **Phase:** 7 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §8–§9

## Goal

Complete the graph authoring canvas by adding the **write path**: approve triggers a
graph-merge into the production base, and a graph→ContentPlan exporter feeds the *existing,
unchanged* materialize pipeline (`stagePlan` → `applyLink` → `migrateContent` → `verifyPlan`).

## Scope

| Item | Detail |
|---|---|
| **Graph merge** | promote `plan_id=None` deltas → production; apply tombstones (DELETE); commit plan edges |
| **Graph→ContentPlan exporter** | merged graph → `ContentPlan` (items+links); edge types map back to `field` names (`character_id`, `available_dialogues`, etc.) |
| **Wire into approve** | `approveAndSolidifyPlan` flips to exporter + existing pipeline; `content_plans.status` lifecycle unchanged |
| **Drop dual-path** | remove the `plan_json` authoring flag from M27 once exporter is proven |
| **Re-approval / drift** | guard: graph is now the only authoring entry point; lock direct YAML edits (or add SQL→graph re-sync) |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| New service | `GraphMerger.ts`, `GraphExporter.ts` |
| Orchestration | `StoryBuilderOrchestrator.ts` (approve → exporter + pipeline) |
| Materialize | `stagePlan`, `applyLink`, `migrateContent`, `verifyPlan` — **untouched** |
| Shared schemas | edge-type → field mapping table |
| Guard | direct-file-edit lock / re-sync script |
| Tests | integration: delta plan → graph merge → exporter → migrate → verify == production |

## Risks & verification

- **Risk:** High. Exporter fidelity: the graph can express richer relationships than
  `ContentLink`; mapping must be lossless for the covered types. Re-approval after direct
  production edits must be handled (lock or re-sync).
- **Verify:** create a plan in the graph, approve, confirm the merged graph + exported
  ContentPlan migrate to production and `verifyPlan` passes; confirm no drift if a YAML is
  edited directly.
- **Accept:** `stagePlan`/`applyLink`/`migrateContent`/`verifyPlan` run unchanged on
  exporter output; graph is the sole authoring entry point.

## Definition of Done

- [x] Approve triggers graph-merge → exporter → existing pipeline
- [x] Edge-type → field mapping lossless for covered types
- [x] Dual-path dropped via graph-authoritative-when-enabled (`NEO4J_ENABLED=true` → exporter; disabled → legacy plan_json intact)
- [x] Drift guard: idempotent re-sync + drift check at approve (`npm run resync:graph`); direct plan_json edits rejected in graph mode
- [x] DELETE deltas block at approve (materialize pipeline untouched)
- [x] New services `GraphMerger`/`GraphExporter`, `applyDeltaEdge`/`getDeltaEdgesForPlan`/`DETACH DELETE` clearDeltasForPlan
- [x] Admin routes `GET /admin/graph/plans/:id/merged-view`, `GET /admin/graph/drift`, `POST /admin/graph/resync`; `resync:graph` npm script
- [x] Tests: `graph-write.integration.test.ts` (Neo4j-gated) + `GraphExporter.unit.test.ts`