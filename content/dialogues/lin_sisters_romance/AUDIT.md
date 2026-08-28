# Lin Sisters — M48 Phase 6 conversion audit (2026-08-25)

Targets: Lin Mei `6298f8f3-7df3-4fad-ac57-8b4a520d1726` (tree anchor),
Lin Xiu `33333333-4444-4555-8666-777777770001` (romance scenes).
Contract: `effects.relationship_effect` + per-sister `last_lin_mei_encounter_at` /
`last_lin_xiu_encounter_at` bookkeeping + `required_relationship` gates on romance beats.
Canonical store: `user_relationships`.

## Files

- `lin_sisters_encounter/dialogue_lin_sisters_encounter.yaml` — dual-sister intro;
  Xiu-side friendship/romance deltas and Mei-side friendship deltas, all with
  encounter bookkeeping; the Xiu romance choice carries
  `required_relationship: { friendship: "gte:N" }`.
- `lin_sisters_romance/dialogue_xiu_language.yaml` — private Hokkien confession scene;
  both confession choices (`playful_translate`, `playful_accept`) gated
  `required_relationship: { friendship: "gte:15" }` with `romance: +2` and
  `last_lin_xiu_encounter_at: NOW`; scene outcomes set
  `lin_xiu_romance_status: confessed_slang`.
- `lin_sisters_parents/dialogue_lin_sisters_parents.yaml` — family-legacy dinner;
  mid-arc romance beat gated on `friendship gte:N` (+2 romance, Mei encounter bookkeeping);
  other deltas are friendship with `last_lin_xiu/mei_encounter_at: NOW`.
- `lin_sisters_test/dialogue_lin_sisters_classroom.yaml` — internship-conflict beat;
  Mei-side friendship delta with `last_lin_mei_encounter_at: NOW`.

| Field | Content |
|---|---|
| Posture assumptions | CURIOUS (Xiu) / GUARDED (Mei) → WARM as family trust accrues |
| Gates | All romance-bearing choices require `friendship gte:15–20` (no romance-without-gate risk) |
| Fallback | Every entry node retains at least one ungated conversational choice; gated romance choices degrade to the non-romantic branch |
| Visual coverage | Expression cues in `thought` (flushed/giggling/playful smirk for Xiu; guarded posture family signature for Mei) |
| Conflict cases | A low-friendship player sees the language/family scenes but cannot bank romance deltas — the confession degrades to playful deflection |
| Result | PASS |

## Notes

- Cross-sister writes do not use `target_character_id` here: each tree anchors to one
  speaker and only mutates that speaker's row (unlike Layla/Wen), so the default-target
  rule suffices.
- `lin_xiu_romance_status` remains a player `state_set` (arc state machine), not a
  relationship axis — consistent with the VQ audit's flag/state retention rule.
