# Ana Villanueva — M48 Phase 6 conversion audit (2026-08-25)

Target character: `6a8b13c0-7e61-419b-98f5-b772e0c238fa`
Contract: `required_relationship` gates + `effects.relationship_effect` + `last_ana_encounter_at` bookkeeping.
Canonical store: `user_relationships`.

| Field | Content |
|---|---|
| Arc | Ana Villanueva investigative-partner arc: `dialogue_ana_intro.yaml`, `dialogue_ana_midgame_tacos.yaml`, `dialogue_ana_endings.yaml` |
| Entry points | Library intro (`ana_intro`); repeatable taco-stand midgame; endings hub after case resolution |
| Target character | Ana (tree `character_id`; speaker = target) |
| Posture assumptions | GUARDED → CURIOUS (analytical reply is the only friendship-positive opening) → WARM on confrontation |
| Relationship effects | `friendship` +5 (analytical intro), +5 (agree_cold), −10 (angry_reject); `romance` +1 on `confront_flaw` |
| Gates | `confront_flaw` requires `required_relationship: { friendship: "gte:20" }` — the mid-arc romance beat only fires after genuine warmth |
| Fallback | Intro entry node: `ask_news`/`ask_directions` both ungated. Midgame entry: `react_save` ungated. Endings hub: all four trigger choices ungated router |
| Visual coverage | Expression tags in `thought` cues: default → calculating → vulnerable → tender → happy/sad/angry endings |
| Conflict cases | Low-friendship player cannot reach the romance beat (`confront_flaw` gated); `agree_cold` (+5 friendship) locks out the Lover ending per tree notes; `angry_reject` initiates Enemy/Ex path |
| Result | PASS — every entry node keeps ≥1 ungated choice; every `relationship_effect` carries `last_ana_encounter_at: NOW` |

## Notes

- Endings hub (`ana_endings`) is a dev/test router with bracketed trigger labels; branches are
  keyed on prior-choice consequences rather than relationship gates — acceptable because the
  friendship/romance deltas above are what the follow-up case content keys on.
- Romance delta (+1) sits behind the `friendship gte:20` gate, satisfying the
  romance-without-gate validation rule.
