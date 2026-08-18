# M32 — Authoring-Path Retirement & Consolidation

> **Status:** Pin complete · **Branch:** `milestone/32-authoring-retirement` · **PR size target:** ~25 files per PR
> **Phase:** 7 (follows M28 graph write path) / 8 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §8, §12–13, §15; **fixes the orphan gap** across M23/M27/M28/M29
>
> M32 is implemented as a **7-PR workstream** so each PR stays within the
> ~25-file limit.  PR 1 (Pin) lands the frozen ledger and the coverage probe.

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

## Retirement ledger (frozen during **Pin**)

The ledger below was finalised after re-evaluating every candidate against live
code consumers. Three draft classifications changed materially:

1. `ContentSkeletonGenerator.ts` → **Refactor-Reuse**, not Retire: its file-path
   helpers are imported by the materialize pipeline that M32 explicitly keeps.
2. `plan_json` column → **Keep**, not Retire: it is the M28 exporter's
   transport for the same materialize pipeline; dropping it would rewrite the
   very pipeline M32 mandates stays unchanged.
3. `dialogue_overlays.nodes` → **not listed** (kept): overlays are not
   externalised and the resolver still merges them from DB.

| Candidate | Class | Notes / Evidence |
|---|---|---|
| `ContentPlanService.parseDescription` / `generateOutline` / `scaffoldPlanItems` / `refinePlan*` | Refactor-Reuse → Slim | `parseDescription`/`generateOutline`/`refinePlan*` retire with legacy intake; `gatherContext`, identity/claims pieces stay and move to a shared seam |
| `PlanGenerationJob.ts`, `FillPlaceholders.ts`, `ContentFillService` | Retire | async fill / placeholder pipeline; replaced by fill-as-`MODIFY`-deltas |
| `ContentSkeletonGenerator.ts` | Refactor-Reuse | `resolveFilePath`/`generateYaml` kept; imported by `StoryBuilderFileWriter`, `StoryBuilderPlanOps` (stagePlan), `StoryBuilderLore`, `PromptFileGenerator`, `AssetPublishService`, `PlanVerificationService` |
| `OutlineChunking.ts` | Retire + extract | `EntityCandidate` type moves into `LLMTypes.ts` / shared; `chunkDescription`/`mergeCandidates` retire with the outline path |
| `PlanTemplates.ts`, `PlanTemplateBuilders.ts` | Retire | only consumed by legacy template/clone meta routes |
| `ContentPlanValidation.ts` | Retire + extract | `uuidv4` moves to a shared util (used by kept `RevisionService`); `validateAndRepairOutline`/`generateFallbackPlan` retire |
| `StoryBuilderValidation.ts` | Keep | `buildValidationErrors` still feeds the kept `stagePlan` materializer |
| `admin-story-builder-generate.ts`, `admin-story-builder-drafts.ts` | Retire | legacy intake + draft endpoints |
| `admin-story-builder-meta.ts` (templates/clone/execute) | Retire | template/clone endpoints; `execute` verified unused after the UI rewiring |
| `admin-story-builder-actions.ts` `/plans/:id/refine` | Retire | single-turn refine; chat panel replaces it |
| `admin-story-builder-lore.ts` | Slim | rewired to emit `MODIFY` deltas instead of mutating `plan_json` |
| `admin-story-builder-staging.ts` | Keep | `stagePlan` materializer endpoints survive |
| `LLMProvider.parseDescription` (legacy Moment 1) | Retire | replaced by graph-intake + `chatPropose` |
| `LLMProvider.generateOutline` / `refinePlan` / `refinePlanItems` (single-turn) | Retire | superseded by M29 `chatExplain`/`chatPropose` |
| `LLMProvider.extractEntities` | Retire | only used by the outline-chunking intake path |
| `dialogue_trees.nodes`, `dialogue_chunks.nodes` / `leaves` (JSONB) | Retire (column drop) | M23 CDN read path is live; M30 snapshots also read via `content_url`. **Drop gated by `npm run probe:content-urls` passing: every row's `content_url` must resolve.** `SnapshotService` must stop writing the dropped columns. |
| `dialogue_overlays.nodes` (JSONB) | Keep | overlays are not externalised; still merged from DB |
| `plan_json` column | Keep | M28 exporter transport for `approveAndSolidifyPlan` → `stagePlan`/`migrateContent`/`verifyPlan`; the kept materialize pipeline reads it |
| `intake.ts` `resetOrphanedFillJobs` boot call | Retire | `PlanGenerationJob` is removed |
| `server/src/scripts/fillExistingTodos.ts` | Retire | legacy fill CLI |
| Orphan tests across the above | Retire / Port | ~14 test files touch retire candidates; port kept-domain tests, delete tests for retired services |

## Verify / Definition of Done

- [x] **Pin:** retirement ledger frozen (files/routes/methods/columns/tests), classified
      Retire vs Refactor-Reuse / Keep. Ledger delivered in this PR.
- [x] **Coverage probe:** `npm run probe:content-urls` exists and can be run against
      any environment to gate the `dialogue_trees.nodes` / `dialogue_chunks.nodes/leaves`
      column drop (PR 6).
- [ ] **Prove:** full build + test suite + `validate:content` green with new path active;
      in-container health OK on game + intake-worker
- [ ] **Prune:** all Retire rows deleted in the same PR as the last flag flip; retained
      consumers refactored to shared services; dead DB columns/migrations dropped
- [ ] No orphaned `import`/references remain (`grep` for retired symbols returns only
      intentional, documented usages)
- [ ] `ARCHITECTURE_SEPARATION_ANALYSIS.md` §12–§15 updated to reflect which legacy LLM
      methods and services are gone