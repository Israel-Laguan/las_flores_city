# Layla / Wen — M48 Phase 6 conversion audit (2026-08-25)

## What changed

- **Stat → axis migration**: all `layla_trust/familiarity/alignment/tension/visibility`
  and `wen_zhao_trust/tension/alignment` player-stats are now canonical
  `user_relationships` writes via `effects.relationship_effect.axes.*`. Every
  choice-level effect carries `state_set.last_layla_encounter_at: NOW`
  (`last_wen_encounter_at: NOW` on Wen's own trees).
- **`wen_thrill` is intentionally NOT migrated** — it is Wen-specific mood
  escalation, not a relationship axis; it stays a player stat via `stat_set`.
- **Dead grammar removed**: the legacy `condition:`/`AND`/`OR`/`NOT` +
  `hidden: true` router blocks (`layla_act3_branch`, `wen_act3_branch`,
  `wen_act3_endings_branch`, `wen_act3_layla_surface`, `wen_aftermath_branch`)
  were never evaluated at runtime (not part of `DialogueChoiceSchema`;
  `filterChoices` never reads them). They are now supported gates:
  - `layla_act3_branch`: LOVERS = intermediary flag + trust≥50 + alignment≥40;
    FRIENDS = familiarity≥30 + trust<30; BREAKUP = tension≥40 + trust<20;
    STAGNANT = first_contact flag + familiarity<20, hidden if girlfriend;
    ungated fallback routes to LOVERS check.
  - `wen_act3_branch`: DISTANT = dare_refused, hidden if first_kiss;
    ENEMY = layla_ending_lovers + manipulation_seed; engaged fallback ungated.
  - `wen_act3_endings_branch`: LOVER/TRAGIC as flag conjunctions;
    FRIEND = confronted + hidden if intimate scene; ungated fallback → TRAGIC.
  - `wen_aftermath_branch`: LOVERS = layla_ending_lovers flag; single fallback.

## Cross-target effects

Wen-speakered choices that mutate Layla's row use
`relationship_effect.target_character_id` (new optional field on
`RelationshipDeltaSchema`; honored by `applyRelationshipEffect`).
Covered by `server/tests/integration/crossTargetRelationship.test.ts`.

## Enemy-ending Layla fallout

The old `wen_ending_enemy_final` wrote `layla_tension: 30` cross-character
alongside Wen's own delta. A single `effects.relationship_effect` targets one
row, so the Layla-side spike is now deferred to Layla's fallout scene keyed on
the existing `layla_community_tipped` flag (per the tree's own notes).

## Save-compatibility note

Pre-existing saves' accumulated `layla_*` player-stats are orphaned by this
migration (dev-mode game; no production data). The Act 3 router now reads the
canonical rows, so fresh playthroughs accumulate axes from Act 1 onward.
