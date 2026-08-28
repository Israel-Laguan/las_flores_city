# Garcia Sisters — M48 Phase 6 conversion audit (2026-08-25)

Targets: Isabella Garcia `c2000004-e29b-41d4-a716-446655440004`,
Sofia Garcia `c2000005-e29b-41d4-a716-446655440005`.
Contract: `effects.relationship_effect` + `last_<slug>_encounter_at` bookkeeping.

## Isabella — `dialogue_isabella_encounter.yaml`

| Field | Content |
|---|---|
| Arc | Single-encounter hedgehog defense with 3 endings (True Ally / Enemy / Pragmatic Ally) |
| Entry points | Father's house encounter (character-scoped) |
| Posture assumptions | CONFRONTATIONAL on entry → RECONCILIATORY or BROKEN depending on response |
| Relationship effects | `friendship` +5 (`sympathize_art`), −5 (`mention_sofia`); both carry `last_isabella_encounter_at: NOW` |
| Gates | None on the entry node — both opening choices ungated (fail-closed safe) |
| Fallback | Both entry choices always visible; branch outcome is authored downstream, not gate-filtered |
| Visual coverage | default → vulnerable / angry / sad / determined expression cues in `thought` |
| Conflict cases | Pity path (`pity_isabella`, `defend_sofia`) routes to Enemy ending; no romance deltas exist, so no romance-gate risk |
| Result | PASS |

## Sofia — `dialogue_sofia_encounter.yaml`

| Field | Content |
|---|---|
| Arc | Single-encounter boundary test with 3 endings (Community Ally / Enemy / Sisterly Bridge) |
| Entry points | Old Las Flores street encounter (character-scoped) |
| Posture assumptions | GUARDED on entry (accessibility boundary) → WARM on respect |
| Relationship effects | `friendship` +5 (`face_direct`), −5 (`look_away`); both carry `last_sofia_encounter_at: NOW` |
| Gates | None needed — entry choices ungated |
| Fallback | Both entry choices always visible |
| Visual coverage | default → happy / sad / determined expression cues |
| Conflict cases | Disrespect path (`look_away`) hard-routes to Enemy ending regardless of later state; no romance deltas |
| Result | PASS |

## Notes

- The sisters' arcs are family/trust arcs, not romance arcs: all `relationship_effect`
  deltas are `friendship` only, so the romance-without-gate validation rule does not apply.
- ⚠ Name collision note: `dialogue_beat_sofia_*.yaml` (Sofia Mendoza, mission questline,
  `sofia_trust` player-stat) is a DIFFERENT character and is intentionally retained on the
  legacy per-stat contract per the Valentina audit's keep-legacy decision
  (`adeyemi_/aisha_/petra_/sofia_` scoped stats).
