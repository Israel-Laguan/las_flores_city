# M20 — Intake Hardening: Deterministic Validation Harness + Intake Conflict Scan

> **Status:** Implemented · **Branch:** `milestone/20-intake-hardening` · **PR size target:** ~25 files
> **Phase:** 1 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §12 Moment 1, §15.5 (deterministic harness)

## Goal

Implement the "never let fuzzy extraction mutate canon" guardrail as a **pre-approve
gate**, plus a fast LLM conflict preview at intake. Two additive checks; no process split
needed yet.

## Scope

| Item | Detail |
|---|---|
| **Deterministic validation harness** | `ValidationHarnessService` (module exporting `runValidationHarness(plan, context)` — a function, not a class): cheap rules the LLM can't be trusted to do faithfully — timeline overlap, duplicate slug/name, FK integrity, ordering/succession. Runs inside `approveAndSolidifyPlan` **before** staging; blocks only on `error`-severity |
| **Intake conflict scan (Moment 1)** | New `LLMProvider.analyzeIntakeConflicts(plan, context)` returning `IntakeConflictPreview[]`; reuses `gatherContext()`'s `ExistingContentContext` — no new data plumbing |
| **Shared schemas** | `IntakeConflictPreviewSchema`, harness result types in `shared/src/schemas/` |
| **Admin UI** | `DescribeStep`/`ReviewStep` show "⚠️ N potential conflicts" + `[Generate Full Plan]` / `[Refine Instead]` |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| New service | `server/src/services/ValidationHarnessService.ts` (exports `runValidationHarness`, a function — not a class) |
| LLM seam | `server/src/services/types/LLMTypes.ts`, `LiteLLMProvider.ts`, `MockProvider.ts`, `LLMPrompts.ts` |
| Orchestration | `server/src/services/StoryBuilderOrchestrator.ts`, `ContentPlanService.ts` |
| Shared schemas | `shared/src/schemas/story-builder.ts` (conflict/harness schemas) |
| Admin UI | `admin/src/app/(admin)/story-builder/components/{DescribeStep,ReviewStep,ContentCard,ResultsStep,ConflictPreview}.tsx` (+ `__tests__/` and `.module.css`) |
| Tests | `server/tests/unit/validationHarnessService.test.ts`; integration for pre-approve gate blocking |

## Risks & verification

- **Risk:** Medium. LLM output parsing can be flaky; harness must be strict-deterministic
  and never LLM-dependent for the gate that blocks approval.
- **Verify:** `npm run validate:content`; `npm run test --workspace=server`;
  manual approve path with a known-conflicting plan to confirm the gate blocks.
- **Accept:** a plan with a real timeline/duplicate/FK conflict is blocked at
  `error` severity; intake shows a truthful conflict preview.

## Definition of Done

- [x] `analyzeIntakeConflicts` implemented across provider seam + prompts
- [x] Deterministic harness runs pre-approve and blocks on `error` severities
- [x] Shared schemas + admin UI surfacing the conflict preview
- [x] Tests cover harness rules and the approval-blocking gate

## Implementation notes (two-phase intake)

`POST /admin/story-builder/plan` is now **preview-only** (outline + advisory conflict scan; NO scaffold, NO
DB insert, NO planId). The author commits explicitly via **`POST /admin/story-builder/plan/scaffold`**
("Generate Full Plan"), or refines the in-memory outline via **`POST /admin/story-builder/plan/refine-preview`**
("Refine Instead"). This enforces "never let fuzzy extraction mutate canon": the LLM
proposes, the author commits.