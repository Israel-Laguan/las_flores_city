# Aisha Al-Sayed — Relationship Gate Audit (M49)

Target character: `c1000013-e29b-41d4-a716-446655440013`
Stat prefix: `aisha`
Contract: `required_relationship` / `hidden_if_relationship` / `relationship_effect`
Canonical store: `user_relationships`
Files: `content/dialogues/dialogue_aisha_al_sayed.yaml`

## Outcome

Manual review completed as part of the M49 relationship rollout.
Aisha was an **audit-only** arc — no `required_stats` / `hidden_if_stats` relationship
gates existed, so no gates were added. The only legacy surface was a generic
`stat_set: aisha_relationship` affinity meter (rejection −5, farewell +5).

## Legacy surface converted

| Legacy | Canonical mapping | Clamp | Notes |
|---|---|---|---|
| `stat_set: aisha_relationship: -5` (rejection end) | `relationship_effect.axes.trust: -5` | -100..100 | + `state_set.last_aisha_encounter_at: NOW`; add `flag_set: aisha_rejected` preserved |
| `stat_set: aisha_relationship: 5` (farewell end) | `relationship_effect.axes.trust: 5` | -100..100 | + `state_set.last_aisha_encounter_at: NOW` |

**Mapping note (drift surfaced):** the conversion PROMPT's generic rule for a bare
`<prefix>_relationship` meter defaults it to `relationship_effect.friendship`. This audit
deliberately diverges: Aisha's meter is a trust-flavored affinity (rejection/farewell
semantics) and her whole arc is a trust system, so it maps to `axes.trust` and backfills
into `trust`. The backfill migration documents the same choice. No mechanic change beyond
this mapping.

### Per-file result (`dialogue_aisha_al_sayed.yaml`)
- Entry: `start` — 3 choices, all ungated (no empty-list risk).
- `node_aisha_rejection` (end): `stat_set aisha_relationship:-5` → `relationship_effect.axes.trust:-5`
  + `state_set.last_aisha_encounter_at: NOW`. Keeps `flag_set: { aisha_contact_made, aisha_rejected }`.
  Negative delta stays ungated.
- `farewell` (end): `stat_set aisha_relationship:5` → `relationship_effect.axes.trust:5`
  + `state_set.last_aisha_encounter_at: NOW`. Keeps `flag_set: aisha_contact_made`.
- No choice carries a `relationship_effect`; no `romance`/`friendship` deltas exist —
  romance-without-gate rule N/A.
- `metadata.flags` kept unchanged (player-flag documentation; `aisha_relationship` retained as a
  historical flag entry).
- Non-relationship `flag_set` state machine (`aisha_work_mentioned`, `aisha_has_documentation`,
  `aisha_help_offered`, etc.) untouched.
- Result: PASS.

## Conflict cases
- None. No romance, no gates, no relationship_change. The meter maps cleanly to a single axis.

## Backfill
`082_relationship_backfill_aisha.sql` copies legacy `player_states.stats->aisha_relationship`
into `user_relationships.trust` (idempotent ON CONFLICT; preserves existing earned trust).
