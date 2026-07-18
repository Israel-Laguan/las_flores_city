---
status: planned
goal: Story Builder authors "missions" as scene → character → dialogue-tree decision that grants an item or money; foundation for future paid content
background:
  - The current `/missions/new` wizard creates a flat mission YAML (see `admin/src/app/missions/new/`) and hand-rolls YAML via `useMissionGenerator.ts` — does NOT go through the Story Builder pipeline
  - `EffectsSchema` (dialogue.ts:46-55) is `.strict()` and allows only: `flag_set`, `story_beat`, `location_discovered`, `app_opened`, `message_read` — **no "grant item / grant credits" effect exists today**
  - `DialogueChoiceSchema` already has reward effects: `vault_unlock: uuid`, `mystery_solve: uuid` — precedent for choice-level grants
  - Scene→dialogue relationship exists: `YAMLSceneSchema.available_dialogues` → dialogue tree → node.speaker_id → choice with reward, but NOT modeled as one "mission" unit
  - Paid-content infrastructure is live: `user_entitlements` table, Patreon OAuth, `premium_cg` vault type (vault.test.ts), `requires_signed_url`, `ENTITLEMENT_REVOKED`/`ACCESS_DENIED_OR_NOT_OWNED` errors
  - Mission schema & DB: `YAMLMissionSchema` (yaml-content.ts:105-113), `mysteries` table (migration 017_mystery_state.sql), `mysteries.status` CHECK constraint is `ACTIVE`/`RESOLVING`/`ARCHIVED` (021_leaderboards.sql:49-53)
scope:
  in:
    - Story Builder template for "mission from scene + character" that creates: scene + character + dialogue with a choice that grants a vault item or credits
    - Extend `EffectsSchema` OR add a mission-specific field to `DialogueChoiceSchema` for item/credit grants
    - Model mission tracking: completion/fail conditions via flags or a new mission-progress table (TBD)
    - Connect to entitlement system for paid-gated missions (premium content can gate on `user_entitlements`)
  out:
    - Deprecating `/missions/new` — resolved by M13: redirects to `/story-builder`
    - Multi-language missions (out of scope)
approach:
  - Evaluate schema change: (a) extend `EffectsSchema` with `grant_item: string`, `grant_credits: { amount: number; type: 'credits'|'gold_credits' }` – OR (b) add mission fields to choices directly; list tradeoffs
  - If (a): update `DialogueNodeSchema` and `recordChoiceAndEffects()` in dialogue-helpers.ts; update `IronGateValidator.ts` to apply grants atomically
  - If (b): add `is_mission` and `mission_reward` to `DialogueChoiceSchema`, keep `EffectsSchema` unchanged
  - Add a new template in `PlanTemplates.ts`: "add-mission-from-scene" with: scene + character (with role=faction='mission-giver') + dialogue tree with a "grant item/money" choice
  - Model completion: use `flag_set` to mark a mission as complete, OR add a `missions_progress` table (open sub-question)
  - Paid gate: when a dialogue choice has `grant_premium_cg`, check `user_entitlements.is_premium_unlocked` – existing pattern
risks:
  - Extending `EffectsSchema` may affect existing dialogue validation – mitigation: add new optional fields; existing YAMLs unaffected
  - Grant effects could be gamed – mitigation: all effects applied in `withOLTPTransaction`; server-side validation of reward values
  - Overlap with vault system – mitigation: mission rewards are vault unlocks or direct currency grants, not new inventory logic
files:
  - shared/src/schemas/dialogue.ts (EffectsSchema or DialogueChoiceSchema extension)
  - shared/src/schemas/yaml-content.ts (potential YAMLDialogueOverlaySchema.nodes change – see migrate.ts:148-178)
  - server/src/routes/dialogue-helpers.ts (recordChoiceAndEffects)
  - server/src/services/IronGateValidator.ts (apply grant effects)
  - server/src/services/PlanTemplates.ts (new mission-from-scene template)
  - server/src/services/ContentSkeletonGenerator.ts (mission-as-dialogue template if needed)
  - admin/src/app/story-builder/components/ReviewStep.tsx (mission-choice review)
  - server/src/content/upsert.ts (mission/vault upserts)
verification:
  - Unit: DialogueChoiceSchema with new grant effect validates real values
  - Integration: POST /admin/story-builder/plan with "add a mission that gives credits", then inspect generated dialogue YAML contains choice with grant_credits
  - Manual: Story Builder "add-mission-from-scene" template produces a working choice that grants credits (inspect /editor YAML)
dependencies:
  - M13 must ship first — unified intake is the delivery vehicle for the add-mission-from-scene template
  - M07 StoryBuilderOrchestrator must be stable
  - Existing vault/unlock flow must work (vault.test.ts)
open-sub-questions:
  - Schema choice: extend `EffectsSchema` (`.strict()` today) with grant effects, OR add mission-specific fields to `DialogueChoiceSchema`? Extend EffectsSchema keeps all effects in one place but adds new columns; DialogueChoice adds redundancy but isolates mission logic
  - Mission progress tracking: use `flag_set` + convention (e.g., `mission_completed_<slug>`) or a dedicated `missions_progress` table? Flags are lighter; table enables queries/stats but requires migration
  - Relationship to `YAMLMissionSchema`/`mysteries` table: converge (one source of truth), keep both (mysteries for DB state, dialogue for narrative), or fold mysteries into dialogue trees? The current `mysteries` table has status CHECK; if dialogue trees become the mission source, status may need rethinking
  - `/missions/new` wizard: resolved by M13 — deprecated, redirects to `/story-builder`; `/missions` list stays browse-only
  - Paid-gate hook: grant effects check `is_premium_unlocked` flag (vault pattern) or a new `requires_entitlement` field? Vault uses `is_nsfw_unlocked`; premium missions could reuse a similar field
  - Mission naming: should the LLM or author decide the mission slug/title? LLM proposes; author edits in Review step