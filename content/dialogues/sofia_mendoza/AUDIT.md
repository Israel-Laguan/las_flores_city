# Sofia Mendoza — Relationship Gate Audit (M49)

Target character: `c3d4e5f6-a7b8-4012-8def-123456789012`
Stat prefix: `sofia`
Contract: `required_relationship` / `hidden_if_relationship` / `required_posture` / `hidden_if_posture`
Canonical store: `user_relationships` (axes: trust, etc.) + `flags` JSONB for `sofia_status`

## Legacy surface converted

| Legacy stat | Canonical mapping | Clamp |
|---|---|---|
| `sofia_trust` | `relationship_effect.axes.trust` | -100..100 |
| `sofia_status` | preserved as player flag in `state_set` + `flags` JSONB | n/a |
| `stat_set.*` (non-relationship) | preserved as `state_set` / `stat_set` | n/a |
| arc flags (`beat_sofia_*`, `story_beat`) | preserved as `flag_set` / `state_set` | n/a |

## Per-file results (5 files)

### dialogue_beat_sofia_intro.yaml
- Entry: `node_sofia_harassment_scene` — 3 choices, all ungated. Fallback available.
- Effects migrated: 3 `stat_set:{sofia_trust:N}` → `relationship_effect.axes.trust` + `state_set.last_sofia_encounter_at: NOW`.
  - `trust:10` → `axes.trust:10`; `trust:20` → `axes.trust:20`; `trust:-50` → `axes.trust:-50`
- `node_ignore_path` end node: original `state_set:{sofia_status:"disillusioned"} + stat_set:{sofia_trust:-50}` → `relationship_effect.axes.trust:-50` + `state_set:{sofia_status:"disillusioned", last_sofia_encounter_at: NOW}`. `sofia_status` preserved (PROMPT artifact fix applied).
- `metadata.required_stats: { sofia_trust:"gt:50" }` → `metadata.required_relationship: { axes: { trust: "gt:50" }`.
- Result: PASS

### dialogue_beat_sofia_corruption_network.yaml
- Entry: `node_sofia_discovery` — 2 choices, all ungated.
- `metadata.required_stats: { sofia_trust:"gt:0" }` → `required_relationship: { axes: { trust: "gt:0" }`.
- Effects migrated: `stat_set:{sofia_trust:20}` → `relationship_effect.axes.trust:20` + `last_sofia_encounter_at: NOW`; `stat_set:{sofia_trust:-50}` → `axes.trust:-50`.
- `node_low_trust_end` end node: `state_set:{sofia_status:"disillusioned"}` preserved alongside `last_sofia_encounter_at`.
- Result: PASS

### dialogue_beat_sofia_trust_building.yaml
- Mission-scoped tree (`dialogue_scope: "mission"`, `mission_id` set). Metadata `required_stats: { sofia_trust:"gt:50" }` → `required_relationship: { axes: { trust: "gt:50" }`.
- Entry: `node_food_stand_approach` — 1 choice, ungated.
- `node_romance_unlock` end node: `state_set:{sofia_status:"romanced"} + stat_set:{sofia_trust:10}` → `state_set:{sofia_status:"romanced", last_sofia_encounter_at: NOW}` + `relationship_effect.axes.trust:10`. `sofia_status` preserved (PROMPT artifact fix applied — model initially dropped it and over-converted to `status:"ROMANTIC"` in relationship_effect; restored).
- `node_neutral_path`: `stat_set:{sofia_trust:5}` → `relationship_effect.axes.trust:5` + `state_set.last_sofia_encounter_at: NOW` (quote normalization: `"NOW"` → `NOW` fix applied).
- `node_insufficient_trust`: original `conditions: { sofia_trust:"lte:50" }` preserved as `conditions: { axes: { trust: "lte:50" } }` (PROMPT artifact fix — model initially deleted this node-level condition; restored).
- Result: PASS

### dialogue_beat_sofia_alberto_risk.yaml
- Entry: `node_sofia_contact` — 3 choices. `choice_intercept_reason` gated `required_relationship: { axes: { trust: "gt:0" }`; other 2 ungated (`choice_sell_out`, `choice_lethal_force`).
- Effects migrated: `stat_set:{sofia_trust:-100}` → `axes.trust:-100` + `last_sofia_encounter_at: NOW`.
- `state_set:{sofia_status:"disillusioned"}` preserved in both end nodes and condition blocks.
- `conditions: { sofia_trust:"lte:50" }` on `node_insufficient_trust` → `conditions: { axes: { trust: "lte:50" } }`.
- `conditions: { alberto_status:"gang_member" }` preserved (non-relationship condition).
- Result: PASS

### dialogue_beat_sofia_resolution.yaml
- Entry: `node_resolution_check` — 4 choices. `check_high_trust` gated `required_relationship: { axes: { trust: "gte:75" }`; others ungated. Fallback available.
- `description` text references `sofia_trust` in prose — preserved unchanged (narrative documentation, not a gate).
- All `sofia_status` branches (`alive`, `dead`, `romanced`, `disillusioned`) preserved in `state_set` and `conditions`.
- Result: PASS

## Conflict cases
- `sofia_status` is a narrative state flag (alive/dead/romanced/disillusioned), not a relationship axis. Per plan, it is kept as a player flag — NOT converted to `relationship_effect.status`. The model initially over-converted `sofia_status:"disillusioned"` → `status:"DISTANCED"` and `"romanced"` → `status:"ROMANTIC"`; this was corrected in review.
- Negative trust deltas (e.g. -100 on player rejection) stay ungated — players can always make things worse.
- Sofia has no `romance` deltas — only `trust` axis. No romance-gate conflicts.

## Backfill
`080_relationship_backfill_sofia.sql` copies legacy `player_states.stats->sofia_trust` into `user_relationships.trust` via idempotent ON CONFLICT (preserves existing trust on conflict; merges `sofia_status` into `flags` JSONB).
