---
status: planned
goal: LLM fills free-text fields in content skeletons, producing reviewable draft content instead of TODO placeholders
background: |
  - `ContentSkeletonGenerator.ts` uses pure templates with `TODO: Add …` placeholders for description/text/mood/history fields
  - `LLMService.ts` already generates lore stubs (`generateLore`) but does not fill YAML fields directly
  - Current `stagePlan()` in `StoryBuilderPlanOps.ts` relies solely on template output
  - The Review step UI (`ReviewStep.tsx`) already shows items as plain JSON; no distinction between template vs LLM-filled fields
  - `LLMPrompts.ts` contains the plan-generation prompt; no separate "fill field" prompt exists
scope:
  in:
    - Add `ContentFillService.ts` to fill free-text YAML fields via LLM after skeleton generation
    - Extend `ExistingContentContext` with character role/faction/personality, scene mood (Q1 enriched context)
    - Add `lore_ref` suggestions to plan items (Q2 auto-suggest)
    - Expand `PlanTemplates.ts` with 2–3 additional templates (Q5)
    - Mark LLM-filled fields in Review UI (highlight vs TODO)
  out:
    - Structural field generation (UUIDs, refs, slugs) remains template-driven
    - Multi-language content (Q7, out of scope)
approach:
  - Create `ContentFillService.ts` with `fillFields(item: ContentPlanItem, context: ExistingContentContext): Promise<Partial<Record<string, string>>>`
  - Refactor `ContentPlanService.gatherContext()` to include character role/faction/personality, scene mood
  - Add `lore_refs?: string[]` to `ContentPlanItem.fields` (optional, inferred from LLM fill; stored as a separate typed field, not part of the string-valued fill result)
  - Update `LLMPrompts.ts` with a follow-up prompt that fills description/text/mood/history given the item and context
  - Modify `stagePlan()` to call `fillFields` for each item before writing YAML, then merge filled values into the template output
  - Update the Review UI: show LLM-filled values distinct from TODO placeholders (e.g., muted styling for TODO)
risks:
  - LLM may fabricate invalid values for constrained fields – mitigation: fill only free-text fields; run validate() after; human Review gate remains
  - Filled content may be too generic – mitigation: prompt-tune with few-shot examples from existing good content
files:
  - shared/src/schemas/story-builder.ts (optional lore_refs on plan items – typed as string[], separate from fillFields result)
  - server/src/services/ContentFillService.ts (new)
  - server/src/services/ContentPlanService.ts (gatherContext enrichment)
  - server/src/services/LLMPrompts.ts (fill-fields prompt)
  - server/src/services/PlanTemplates.ts (2–3 new templates)
  - server/src/services/StoryBuilderPlanOps.ts (stagePlan integration)
  - admin/src/app/story-builder/components/ReviewStep.tsx (UI distinction)
  - admin/src/app/story-builder/components/FieldDefinitions.ts (field handling)
verification:
  - Unit test: ContentFillService with mocked LLM returning known values, verify merge into skeleton
  - Integration test: POST /admin/story-builder/plan then GET /admin/story-builder/plans/:id, assert certain fields are filled (not TODO)
  - Manual: Describe "a noir detective character" and verify description/text/mood are description-aware, not placeholder
dependencies:
  - M13 must ship first — author-edit persistence is required before LLM field filling (otherwise filled fields are lost on refine)
  - M07 `LLMService` must be stable (it shipped)
  - `LLMPrompts.ts` must have the plan-generation prompt (exists)
open-sub-questions:
  - Which free-text fields are fill-targets? (recommendation: character.description, character.metadata.personality, scene.mood, scene.description, location.daytime/nightlife/history, dialogue node text)
  - Prompt-engineering style: separate prompt per type or one unified prompt with type-specific instructions? (recommendation: one unified prompt, type-specific instructions in system template)
  - Should lore_ref be auto-suggested or left to author discretion? (tie to Q2 decision: auto-suggest in refine, manual confirm in Review)