# Vance Nakamura — Relationship Gate Audit (M49)

Target character: `3b2b8000-e29b-41d4-a716-446655440001`
Contract: `required_relationship` / `hidden_if_relationship` / `relationship_effect`
Canonical store: `user_relationships`
Files: `content/dialogues/dialogue_finale.yaml` · `content/dialogues/dialogue_awakening.yaml`

## Outcome

Manual review (previously `review` status). Vance is a **system/meta-plot** arc: the Arbor
finale already used `alignment_change` (`loyalist`/`fugitive`), `state_set.final_alignment`,
and `story_beat: finale_complete`. It had no numeric legacy stat. The conversion adds
canonical `relationship_effect` plumbing while leaving every existing mechanic unchanged.

## Mapping (design decision — surfaced)

The spec asked to map `final_alignment` / `alignment_change` to the "romance axis." The
canonical `relationship_effect` has NO `romance` axis — `romance` is a **top-level** delta
while the six-axis model has a dedicated **`alignment`** axis. Per review, we do **both**:

- **Mechanic (alignment):** each finale ending writes `relationship_effect.axes.alignment`
  (`loyalist +10`, `fugitive −10`) — semantically faithful and meta-friendly.
- **Bond (romance):** each ending adds a **small gated** `relationship_effect.romance`
  (`loyalist +5`, `fugitive +8`) to represent the resolved player↔Vance bond. These sit at
  **node level** and are gated on the leading choice. **Constraint surfaced:** the canonical
  `user_relationships.romance_level` is DB-bounded to non-negative (`CHECK`), so a `lt:0`
  hidden-gate is unreachable and would be dead code. The romance is instead gated with the
  documented **`required_relationship: { neutral_default: true, romance: "gte:0" }`** floor —
  fail-open for a no-row / first-time finale player (never strands the ending), while still
  satisfying the "no romance-without-gate" rule by requiring a non-negative bond.

## Per-file results

### dialogue_finale.yaml
- Entry: `finale_root` — 1 choice (`finale_hear_more`), ungated (no empty-list risk).
- `finale_reveal`:
  - `finale_loyalist_choice` / `finale_fugitive_choice` keep `alignment_change` (meta contract
    for `users.alignment` + overlay gating) exactly as before. Added
    `required_relationship: { neutral_default: true, romance: "gte:0" }` to each (romance floor
    gate — fail-open for no-row players, never hides the endings).
- `finale_loyalist_ending` (end): adds `relationship_effect:{ axes:{alignment:10}, romance:5 }`
  and `state_set.last_vance_encounter_at: NOW`. `final_alignment:"loyalist"` and
  `story_beat: finale_complete` preserved.
- `finale_fugitive_ending` (end): adds `relationship_effect:{ axes:{alignment:-10}, romance:8 }`
  and `state_set.last_vance_encounter_at: NOW`. `final_alignment:"fugitive"` and
  `story_beat: finale_complete` preserved.
- Result: PASS.

### `dialogue_awakening.yaml` (onboarding)
- Uses canonical `story_beat: act1_awakening` + `state_set.awakening_path` only — no
  relationship stat, no gates to add, no `relationship_effect` needed. Untouched.

## Conflict cases
- **Romance without trust/earned bond:** the finale's romance deltas are node-level and sit
  behind the `required_relationship { neutral_default: true, romance: "gte:0" }` floor gate, so
  the anti-surprise rule holds while the finale still resolves (neutral_default → fail-open on a
  missing/zero romance row). A negative-threshold gate was impossible: `romance_level` is
  DB-bounded to non-negative.
- **No empty-list risk:** the entry node `finale_root` has an ungated single choice; the two
  alignment endings are not the entry node.
- The finale was `dialogue_scope: "system"`; relationship writes target `character_id`
  (Vance) by default — no `target_character_id` override needed.

## Backfill
`083_relationship_backfill_vance.sql` seeds a canonical `user_relationships` row for existing
saves that already carry `player_states.state.final_alignment` (`loyalist` → alignment 10,
`fugitive` → alignment −10), mirroring the resolved flag into `user_relationships.flags`
(idempotent ON CONFLICT, merged flags). Vance legacy had no numeric stat to copy.