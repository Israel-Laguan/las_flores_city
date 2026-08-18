# M39 — Scoped Entity Intake Wizard (reuse the free-form intake flow)

> **Status:** Planned (exploration) · **Branch:** `milestone/39-scoped-intake-wizard` · **PR size target:** ~25 files
> **Phase:** after M31 (admin nav completion) · **Source:** lessons from the retired mission wizard
> (`admin/src/app/(admin)/missions/new/*`, deleted in M31 consolidation) + the canonical story-builder
> intake flow (`server/src/routes/admin-story-builder-*.ts`, `server/src/services/Plan*`,
> `StoryBuilderFileWriter.ts`, `migrateContent`).
> **Type:** product exploration — do NOT build yet; this doc scopes the approach and open questions.

## Goal

Explore a **scoped entity intake wizard** that authors one entity at a time (location, mission,
character, overlay, gig, …) but **internally reuses the exact same flow as the free-form story-builder
intake** — plan generation → review → solidify → file write → migrate → verify. The wizard is a
*tighter, pre-scaffolded entry point* into that pipeline, not a parallel authoring path.

**The core idea:** the free-form intake takes a free-text prompt and parses it into a plan. A scoped
wizard instead starts from an entity-shaped scaffold (title, description, status, linked entities,
sub-items) and feeds that into the same plan-generation machinery, so the user gets structure "from the
get go" without re-implementing the pipeline.

**Why this milestone exists:** the retired mission wizard (`useMissionWizard`, `useMissionForm`,
`useMissionGenerator`, `useMissionEntityLists`, `MissionResultView`) was exactly this idea, but built as a
**broken parallel path** — it hand-rolled YAML and wrote it via `PUT /admin/content/file` **without ever
calling `migrateContent`**, kept dead character/scene/dialogue selections, and did client-side
UUID/slug/escaping. It was superseded by the story-builder and deleted in M31. This milestone explores how
to capture the *intent* (scoped entry) through the *mature* pipeline instead of reviving the prototype.

## Current state (verified 2026-08-10)

1. **Free-form intake is the mature, working path.** `StoryBuilder` (`admin/src/app/(admin)/story-builder/`
   `StoryBuilder.tsx`) drives `DescribeStep` (free text) → `useStoryBuilder.handleGeneratePlan` →
   `POST /admin/story-builder/plans` (`admin-story-builder-plans.ts:11`). Approve calls
   `handleApproveAndSolidify` → orchestrator runs plan generation → `StoryBuilderFileWriter` →
   `migrateContent` → `PlanVerificationService`. Plans persist (`content_plans`), support refine,
   templates, clone, drafts, asset generation.

2. **Templates already exist.** `DescribeStep` renders a template picker (`templates` prop,
   `onSelectTemplate`). `server/src/services/PlanTemplates.ts` + `PlanTemplateBuilders.ts` define the
   template catalog. A "Mission" template would slot directly into this picker — the wizard's "scoped
   from the get go" without a separate surface.

3. **The retired wizard's good ideas, and why they broke:**
   - **Good:** scoped scaffold (title/description/status), linked entities, sub-items (vault/overlay).
   - **Broken:** direct YAML write without migrate (`useMissionGenerator.writeYaml` → `PUT /admin/content/file`);
     dead character/scene/dialogue selections (never emitted into YAML); client-side UUID/slug/escaping
     duplicating the server pipeline; no persisted plan → no review/refine/verify loop.

4. **Entity coverage gap.** The general intake is free-form; there is no per-entity scaffolded entry.
   The per-entity list/detail admin views (M31) let you *browse/edit existing* content, but authoring new
   content routes through the free-form story-builder (or manual YAML). A scoped wizard closes that gap.

## Scope decision (exploration)

**Recommended direction: templates, not a new wizard route.** Add per-entity templates to the existing
`PlanTemplates.ts` / `PlanTemplateBuilders.ts` and surface them in the story-builder template picker.
This reuses the free-form pipeline end-to-end (plan → file → migrate → verify) and keeps a single intake
surface. Do **not** re-create `missions/new` or a parallel `wizard` route that writes YAML directly.

Per-entity templates to consider (each a `PlanTemplateBuilders` builder + a template entry):
- **mission** — mission item (title, description, status, expires, sub-items: vault items, overlays).
- **location** — scene item with `metadata.type='location'` + district link.
- **character** — character item (name, title, portrait).
- **overlay** — overlay item (target_tree_id, mission_id, priority).
- **gig** — gig item (time block cost, credit/reputation payout, location restriction).

## Open questions (resolve during the milestone, not now)

1. **Template granularity:** one template per entity, or a single "entity" template with a type selector?
2. **Linked entities:** the retired wizard's character/scene/dialogue selections were dead. In a template,
   should these become real plan items (which the pipeline writes/migrates) or field hints for the LLM?
3. **Migration UX:** after a scoped wizard generates files, should it auto-run `migrateContent` (the
   story-builder solidify does) or leave files staged for the author to migrate? Auto-migrate matches the
   free-form flow; verify the wizard should not create ghost files like the retired one did.
4. **Verification:** reuse `PlanVerificationService` for the same guardrails as free-form intake.
5. **Scope of "entity":** start with 1–2 templates (e.g. mission + location) to prove the pattern, then
   extend. Keep the PR at ~25 files.

## Steps (proposed — execute during the milestone)

### 1. Add a mission template (prove the pattern)
- Add a `mission` builder to `PlanTemplateBuilders.ts` that scaffolds a plan with a mission item
  (title, description, status, expires_at) and optional vault/overlay sub-items.
- Register it in `PlanTemplates.ts` so it appears in the story-builder template picker.
- Reuse the existing solidify → `StoryBuilderFileWriter` → `migrateContent` → verify path. No new route.

### 2. Add a location template
- Scaffold a scene item with `metadata.type='location'` + district link, mirroring `processLocationData`
  (`server/src/content/upsert.ts:110-129`).

### 3. (Optional) character / overlay / gig templates
- Extend the same builder pattern once steps 1–2 are green.

### 4. Retire the direct-YAML pattern for good
- Confirm no new code calls `PUT /admin/content/file` to author entities without a migrate step.
- Add a code comment or guard documenting that authored content must go through the plan → migrate path.

## Acceptance criteria

- [ ] A **mission** template appears in the story-builder template picker and generates a plan whose
      solidify produces migrated mission content (no ghost files; `mysteries` row created).
- [ ] A **location** template produces a migrated scene row with `metadata.type='location'` + district link.
- [ ] The flow reuses `StoryBuilderFileWriter` + `migrateContent` + `PlanVerificationService` — no new
      authoring route, no hand-rolled YAML writer.
- [ ] No dead selections: every template field maps to a real plan item / migrated column.
- [ ] Story-builder tests updated for the new template(s); full suite green.

## Verification

```bash
npm run test --workspace=server          # story-builder + verification suites
npm run test --workspace=admin           # template picker UI tests
npm run build --workspace=server && npm run build --workspace=admin
npm run validate:content                 # generated YAML passes schema
# Manual: story-builder → pick Mission template → describe → generate → review → solidify →
# confirm /admin/missions shows the new row (migrated), breadcrumb resolves to its title.
```

## Relationship to other work

- **M31 (done):** consolidated Missions/Mysteries; deleted the broken mission wizard. This milestone
  recaptures that intent correctly.
- **M32 retirement:** if M39 lands before M32, coordinate so templates are not caught in the
  plan_json retirement sweep (templates feed the same plan→file→migrate path M32 preserves).
- **AGENTS.md content-layering contract:** content/ = file DB, server/ = sole mediator, scripts/ =
  file-to-file only. This milestone keeps the server as the only sanctioned write path.