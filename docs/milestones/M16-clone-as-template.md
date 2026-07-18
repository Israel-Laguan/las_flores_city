---
status: planned
goal: Clone an existing content entity as a template for a new plan item (e.g., "new character like Diego")
background:
  - `ContentPlanService.gatherContext()` already queries all entity types (characters, scenes, dialogues, missions, stories, overlays, locations) and returns names/ids
  - `PlanTemplates.ts` has 3 templates (add-mystery, add-shopkeeper, add-location) that build fixed skeletons
  - No clone-path exists: the LLM receives context names but cannot ask "does Diego exist?"; it just gets the list
scope:
  in:
    - "Clone existing character/scene/dialogue/story" affordance in DescribeStep
    - Load source YAML via `admin-content.ts` read path, sanitize (strip id, reset asset_paths to `<slug>__default.png`), present as editable plan item
    - Support cloning any content type that has a template in `ContentSkeletonGenerator`
  out:
    - Collaborative editing (deferred per design doc)
approach:
  - New `CloneTemplateService.ts` with `cloneItem(type: ContentType, sourceSlug: string, newName: string): Promise<ContentPlanItem>`
  - Fetch source YAML via a safe path check (reuse `validateContentPath` from admin-content.ts)
  - In `ContentSkeletonGenerator.generateYaml`, detect if fields already exist (from clone) and skip providing defaults for them
  - Add clone dropdown in `DescribeStep.tsx` that queries `/admin/content/tree` for the selected type
  - Sanitize: remove `id`, `created_at`, `updated_at`; reset `asset_paths.portrait`/`biometric` to `<slug>__default.png`; compute new slug from new name
risks:
  - Asset paths inherited from source – mitigation: reset to default placeholders; warn user in Review step
  - LLM context context vs clone – mitigation: clone is author-initiated, not LLM-driven; no conflict
files:
  - admin/src/app/story-builder/components/DescribeStep.tsx (clone dropdown UI)
  - server/src/services/CloneTemplateService.ts (new)
  - admin/src/app/story-builder/hooks/useStoryBuilderApi.ts (clone endpoint proxy)
  - server/src/services/ContentSkeletonGenerator.ts (accept pre-filled fields or skip defaults)
  - admin/src/app/story-builder/hooks/useStoryPlanApi.ts (add clone handler)
verification:
  - Unit: CloneTemplateService returns a plan item with correct type, name, sanitized id/asset_paths
  - Integration: Clone Diego (existing char), verify generated YAML has no id collision, asset_paths point to placeholders
  - Manual: DescribeStep clone dropdown lists existing characters, user can clone and rename
dependencies:
  - M13 must ship first — the update/extend path (deep-merge, create-over-existing guard) must be sound before clone-as-update is reliable
  - `validateContentPath` must exist for safe reads
  - `ContentSkeletonGenerator` must be clone-aware
open-sub-questions:
  - Should cloned items be deep-copied or shallow? (recommendation: deep, but asset_paths reset)
  - How to preview clone before commit? (recommendation: load raw YAML in a modal, user confirms)
  - Should clone preserve lore_path/narrative_path? (recommendation: yes, but they are optional; author can change)
  - Should there be a "clone-and-link" mode that auto-links to the source entity? (e.g., clone a character and link the dialogue to the original character's ID) (open – probably not in v1)