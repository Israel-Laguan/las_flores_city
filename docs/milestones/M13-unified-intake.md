---
status: implemented
goal: Collapse all content intake into one trustworthy path (Story Builder); fix plan-edit fidelity and conflict detection.
background: |
  - The `/missions/new` wizard hand-rolls YAML client-side and bypasses Story Builder (no validate/migrate/lore/assets).
  - `/missions/new` produces layout-invalid YAML (old flat layout) and schema-invalid vault items (missing `media_path`).
  - M15 open-sub-question #51 asks to deprecate/redirect/keep `/missions/new`; unification resolves this.
  - Author edits in ReviewStep are ephemeral; handleRefine/approveAndSolidify reload plan_json from DB and discard edits.
  - ContentPlanSchema does not enforce unique (type,slug); duplicate items silently overwrite files.
  - updateExistingFile does shallow merge - nested keys (metadata, nodes, asset_paths) are replaced.
scope:
  in:
    - Deprecate `/missions/new`: redirect to `/story-builder`, remove create button
    - Persist author edits before refine/approve-and-solidify via PUT to DB
    - ContentPlanSchema.superRefine rejects duplicate (type,slug) and conflicting cross-links
    - Stage-time hard error on `action:'create'` targeting existing file
    - updateExistingFile deep-merges known nested keys (metadata, asset_paths, conditions); arrays (including nodes) are replaced wholesale
  out:
    - Scoped/async throughput (M18)
    - DB rollback on verify-after-migrate failure
    - Mission grant effects (M15)
    - LLM field filling (M14)
approach: |
  - UI unification: redirect `/missions/new` to `/story-builder`, reframe heading as "Add / Update Content"
  - Edit fidelity: PUT plan in useStoryPlanApiHandlers before refine/ship
  - Conflict detection: superRefine on schema; error in stagePlan on create-over-existing
  - Update hardening: deep-merge for known nested keys (metadata, asset_paths, conditions) in updateExistingFile; arrays replaced
risks:
  - Removing `/missions/new` breaks author muscle memory - redirect preserves landing path
  - Deep-merge could surprise authors - document merge semantics, only merge known keys
files:
  - admin/src/app/missions/new/ (redirect)
  - admin/src/app/missions/page.tsx (remove create button)
  - admin/src/app/story-builder/components/DescribeStep.tsx (reframe copy)
  - admin/src/app/story-builder/StoryBuilder.tsx (heading)
  - admin/src/app/story-builder/hooks/useStoryPlanApiHandlers.ts (persist before refine/ship)
  - shared/src/schemas/story-builder.ts (superRefine)
  - server/src/services/StoryBuilderPlanOps.ts (create-over-existing error)
  - server/src/services/StoryBuilderFileWriter.ts (deep-merge)
verification:
  - Unit: schema rejects duplicate (type,slug)
  - Unit: updateExistingFile deep-merges without dropping data
  - Integration: edit→refine→assert edit in DB
  - Unit/UI: `/missions/new` redirects to `/story-builder`
dependencies:
  - None on M14/M15/M16 – M13 is prerequisite for them