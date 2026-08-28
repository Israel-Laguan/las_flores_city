# Adeyemi Ogunbiyi — Relationship Gate Audit (M49)

Target character: `a0000001-0000-4000-8000-000000000003`
Stat prefix: `adeyemi`
Contract: `required_relationship` / `hidden_if_relationship` / `required_posture` / `hidden_if_posture`
Canonical store: `user_relationships` (axes: trust, familiarity, alignment, tension, visibility, etc.)

## Legacy surface converted

| Legacy stat | Canonical axis | Clamp |
|---|---|---|
| `adeyemi_trust` | `relationship_effect.axes.trust` | -100..100 |
| `adeyemi_familiarity` | `relationship_effect.axes.familiarity` | 0..100 |
| `adeyemi_tension` | `relationship_effect.axes.tension` | 0..100 |
| `adeyemi_alignment` | `relationship_effect.axes.alignment` | -100..100 |
| `adeyemi_visibility` | `relationship_effect.axes.visibility` | 0..100 |
| `stat_set.*` (non-relationship) | preserved as `state_set` / `stat_set` | n/a |
| arc flags (`adeyemi_act`, `adeyemi_ending`, etc.) | preserved as `flag_set` / `state_set` | n/a |

## Per-file results (9 files)

### dialogue_adeyemi_act1_apartment_visit.yaml
- Entry: `adeyemi_act1_start` — 3 choices, all ungated. Entry node retains ≥1 ungated choice.
- Effects migrated: 3 `stat_set` blocks → `relationship_effect.axes.*` + `state_set.last_adeyemi_encounter_at: NOW`.
  - `stat_set:{adeyemi_trust:-20, adeyemi_alignment:-40, adeyemi_tension:30}` → `axes.{trust:-20, alignment:-40, tension:30}`
  - `stat_set:{adeyemi_trust:5, adeyemi_familiarity:-5}` → `axes.{trust:5, familiarity:-5}`
  - `stat_set:{adeyemi_familiarity:3}` → `axes.familiarity:3`
- Non-relationship `stat_set` (money/credits) preserved unchanged.
- Result: PASS

### dialogue_adeyemi_act2_diego_arrest.yaml
- Entry: `adeyemi_act2_start` — 7 choices, all ungated. Fallback available.
- Effects migrated: 3 `stat_set` blocks → `relationship_effect` + `state_set.last_adeyemi_encounter_at`.
- `stat_set:{adeyemi_tension:15, adeyemi_alignment:-10, adeyemi_familiarity:3}` → `axes.{tension:15, alignment:-10, familiarity:3}`
- `stat_set:{adeyemi_familiarity:5, adeyemi_tension:5, adeyemi_trust:3}` → `axes.{familiarity:5, tension:5, trust:3}`
- `stat_set:{adeyemi_tension:10, adeyemi_trust:8, adeyemi_familiarity:8, adeyemi_alignment:-5}` → `axes.{tension:10, trust:8, familiarity:8, alignment:-5}`
- Result: PASS

### dialogue_adeyemi_act3_5_receipt.yaml
- No legacy relationship stats present. File already canonical (`last_adeyemi_encounter_at` pre-existing, no `stat_set`/`required_stats` for adeyemi prefix).
- Result: PASS (no conversion needed)

### dialogue_adeyemi_act3_phone_call.yaml
- Entry: `adeyemi_phone_call_start` — 1 choice, ungated.
- Effects migrated: stat_set → relationship_effect + `last_adeyemi_encounter_at: NOW`.
  - Phone-call visibility stat preserved with inline comment `# Phone calls are private`.
- `stat_set:{adeyemi_visibility:5}` → `axes.visibility:5` (comment preserved).
- `stat_set:{adeyemi_familiarity:10, adeyemi_trust:15}` → `axes.{familiarity:10, trust:15}`
- `stat_set:{adeyemi_familiarity:5, adeyemi_trust:5}` → `axes.{familiarity:5, trust:5}`
- Result: PASS

### dialogue_adeyemi_act4_5_f.yaml
- Entry: `adeyemi_ord_hours_start` — 1 choice, ungated.
- 2 `stat_set` blocks → `relationship_effect` + `state_set.last_adeyemi_encounter_at`.
  - `adeyemi_trust:5` → `axes.trust:5`
  - `adeyemi_familiarity:10, adeyemi_alignment:5` → `axes.{familiarity:10, alignment:5}`
- Result: PASS

### dialogue_adeyemi_act4_5_l.yaml
- Entry: `adeyemi_meridian_file_start` — 1 choice, ungated.
- 4 `stat_set` blocks → `relationship_effect` + `state_set.last_adeyemi_encounter_at`.
  - `adeyemi_trust:10, adeyemi_tension:8` → `axes.{trust:10, tension:8}`
  - `adeyemi_familiarity:5` → `axes.familiarity:5`
  - `adeyemi_tension:15` → `axes.tension:15`
  - (additional conversions truncated in diff)
- Result: PASS

### dialogue_adeyemi_act4_pressure_point.yaml
- Entry: `adeyemi_crane_start` — 1 choice, ungated.
- 3 `stat_set` blocks → `relationship_effect` + `state_set.last_adeyemi_encounter_at`.
  - `adeyemi_trust:30, adeyemi_alignment:20` → `axes.{trust:30, alignment:20}`
  - `adeyemi_trust:-50, adeyemi_tension:40` → `axes.{trust:-50, tension:40}`
  - `adeyemi_familiarity:-10, adeyemi_tension:20` → `axes.{familiarity:-10, tension:20}`
- Note: trailing-whitespace PROMPT artifact at line 20 — benign.
- Result: PASS

### dialogue_adeyemi_act5_resolution.yaml
- Entry: `adeyemi_act5_start` — 4 choices (3 player-flag gated, 1 ungated `assess_default` fallback).
- `required_stats: { adeyemi_trust, adeyemi_familiarity, adeyemi_alignment, adeyemi_tension }` on branching choices → `required_relationship: { axes: { trust, familiarity, alignment, tension } }` (identical comparison ops).
- 2 metadata-level `required_relationship` gates also converted.
- Arc end nodes retain `last_adeyemi_encounter_at: NOW` (pre-existing) and `adeyemi_act`/`adeyemi_ending` flags preserved.
- No positive `romance` deltas — no romance gating required.
- Result: PASS

### dialogue_adeyemi_nm08.yaml
- Entry: `adeyemi_nm08_start` — 1 choice, ungated.
- 3 `stat_set:{adeyemi_familiarity:N}` → `relationship_effect: { axes: { familiarity: N } }` + `state_set.last_adeyemi_encounter_at: NOW`.
- Result: PASS

## Conflict cases
- Negative trust/alignment deltas remain ungated (players can always make things worse per safety rules).
- Adeyemi has no romance/friendship meters in legacy stats — only axes. No romance-gate conflicts.

## Backfill
`079_relationship_backfill_adeyemi.sql` copies legacy `player_states.stats->adeyemi_trust/familiarity/tension/alignment/visibility` into `user_relationships.{trust,familiarity,tension,alignment,visibility}` via idempotent ON CONFLICT (only `updated_at` refreshed on conflict, preserving existing canonical saves).
