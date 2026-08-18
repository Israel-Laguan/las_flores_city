# M32 — Authoring-Path Retirement & Consolidation

> **Status:** Planned · **Branch:** `milestone/32-authoring-retirement` · **PR size target:** ~25 files
> **Phase:** 7 (follows M28 graph write path) / 8 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §8, §12–13, §15; **fixes the orphan gap** across M23/M27/M28/M29

## Goal

Retire the superseded authoring surface **in the same PRs that flip the flags** — after
confirming the new graph-delta path is green. Three-phase discipline: **Pin → Prove →
Prune**. No dead code tail left behind.

> This milestone exists because the original milestone docs treated the migration as purely
> additive (keep the old path under a flag until proven). It explicitly owns the retirement
> that M28's "graph is the sole authoring entry point" implies but never enumerated.

## The three phases

| Phase | What happens | Gate that must pass first |
|---|---|---|
| **Pin** | Enumerate every orphan to be removed: files, routes, LLM methods, DB columns, tests. Freeze their inventory so nothing is deleted by accident and nothing that must survive is missed | Decision tree below |
| **Prove** | Run the full test suite + build with the new path active. Confirm every retained consumer still works and no feature lost value | `npm run test --workspace=server`, `npm run validate:content`, build, in-container health |
| **Prune** | Delete pinned orphans, port/remove their tests, drop dead DB columns/migrations. Merge in the same PR as the last flag flip | Prove passed with zero regressions |

## Pin decision tree

For every candidate, classify **Retire / Refactor-Reuse / Keep**:

- **Retire** if its only consumer is the superseded `plan_json` authoring path.
- **Refactor-Reuse** if it has legs in the new model (e.g. `gatherContext` → shared;
  `checkCreateConflicts` → folded into the M20 deterministic harness; materializers
  `stagePlan`/`applyLink`/`migrateContent`/`verifyPlan` **must be KEPT** — the exporter
  depends on them).
- **Keep** (no change) for anything the game hot path or runtime still reads.

## Retirement ledger (candidates — final list set during **Pin**)

| Candidate | Class | Notes |
|---|---|---|
| `ContentPlanService.generateOutline` / `scaffoldPlanItems` / `refinePlan*` | Refactor-Reuse | identity/claims pieces reused; proposal-authoring superseded by graph deltas |
| `PlanGenerationJob.ts`, `ContentSkeletonGenerator.ts`, `FillPlaceholders.ts`, `OutlineChunking.ts`, `PlanTemplates.ts`, `PlanTemplateBuilders.ts` | Retire | produce `plan_json` output that graph deltas replace |
| `ContentPlanValidation.ts`, `StoryBuilderValidation.ts` | Refactor-Reuse / Retire | structural checks fold into M20 harness or retire |
| `admin-story-builder-{generate,plans,drafts,staging,actions,lore}.ts` | Retire / Slim | keep only endpoints the new flow calls after M27–M29 |
| `LLMProvider.parseDescription` (legacy Moment 1) | Retire | documented legacy |
| `LLMProvider.refinePlan` / `refinePlanItems` (single-turn) | Retire | superseded by M29 `chatExplain`/`chatPropose` |
<!-- M23 Phase 2 (prerequisite for this drop): DialogueResolver now hydrates BOTH
     `nodes` and `leaves` from the CDN `content_url` blob for dialogue_chunks
     (fetchChunkFromContentUrl in loadBaseChunk / loadBaseChunkByKey), and
     `nodes` from CDN for dialogue_trees (fetchNodesFromContentUrl in
     loadBaseTree). The resolver no longer reads the DB `nodes`/`leaves` columns
     on the read path, falling back to them only when `content_url` is
     NULL/empty or the CDN fetch fails. Dropping these columns here is safe once
     every row carries a reachable content_url (M32 verification). -->
| `dialogue_chunks.nodes` / `leaves`, `dialogue_trees.nodes` (JSONB) | Refactor-Reuse | columns dropped after M23 relocates content to CDN; disk keeps compiler. **Drop conditional on explicit row-level coverage check: every `content_url` must resolve to a reachable CDN blob before dropping JSONB fields.** |
| `plan_json` column | Retire | after M28 exporter is sole authoring path |
| Orphan tests across the above | Retire / Port | 118 test files; port retained-domain tests, delete tests for retired services |

## Verify / Definition of Done

- [ ] **Pin:** retirement ledger frozen (files/routes/methods/columns/tests), classified
      Retire vs Refactor-Reuse
- [ ] **Prove:** full build + test suite + `validate:content` green with new path active;
      in-container health OK on game + intake-worker
- [ ] **Prune:** all Retire rows deleted in the same PR as the last flag flip; retained
      consumers refactored to shared services; dead DB columns/migrations dropped
- [ ] No orphaned `import`/references remain (`grep` for retired symbols returns only
      intentional, documented usages)
- [ ] `ARCHITECTURE_SEPARATION_ANALYSIS.md` §12–§15 updated to reflect which legacy LLM
      methods and services are gone