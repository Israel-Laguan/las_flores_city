# Valentina Reyes — Relationship Gate Audit (M49)

Target character: `c51348ce-c575-4895-b17b-811af6869903`
Stat prefix: `valentina`
Contract: `required_relationship` / `hidden_if_relationship` / `required_posture` / `hidden_if_posture`
Canonical store: `user_relationships` (axes, friendship, romance, etc.)

## Legacy surface converted

| Legacy stat | Canonical mapping | Clamp |
|---|---|---|
| `valentina_relationship` | `relationship_effect.friendship` | 0..100 (clamped; -5 → 0) |
| `valentina_relationship` | kept as player flag in `metadata.flags` | n/a |
| arc flags (`valentina_contact_made`, `valentina_rejected`, etc.) | preserved as `flag_set` | n/a |

**Phase 1 decision**: the generic `valentina_relationship` overall-affinity meter maps to
`relationship_effect.friendship` with same sign and magnitude. The `flag_set: valentina_relationship`
entry in `metadata.flags` is preserved as a player flag (not dropped). Bookkeeping `last_valentina_encounter_at: NOW`
added alongside the effect.

## Per-file results (1 file)

### dialogue_valentina_reyes.yaml
- Entry: `val_intro` — 3 choices (`approach_val`, `observe_val`, `reject_val`), all ungated.
  Entry node retains ≥1 ungated choice (fail-closed safe).
- `node_val_rejection` end node: original
  ```
  effects:
    flag_set:
      valentina_contact_made: true
      valentina_rejected: true
    stat_set:
      valentina_relationship: -5
  ```
  converted to
  ```
  effects:
    flag_set:
      valentina_contact_made: true
      valentina_rejected: true
    relationship_effect:
      friendship: -5
    state_set:
      last_valentine_encounter_at: NOW
  ```
  — `friendship: -5` is a negative delta, so per safety rules it stays UNGATED (players can
  always make things worse). No romance or required_relationship gates needed.
- `metadata.flags` retains `valentina_relationship` as a player flag (unchanged).
- All narrative `text`, `thought`, node ids, `next_node_id` wiring, `is_end` preserved.
- No `conditions`/`required_stats`/`hidden_if_stats` in the original — no gate conversions needed.
- Result: PASS

## Conflict cases
- The only legacy stat is `valentina_relationship: -5` (negative). Per the M49 safety rules,
  negative deltas are ungated — the player can always reject Valentina.
- `valentina_relationship` appears in BOTH `stat_set` (the meter write) and `metadata.flags`
  (the player flag). The stat_set write was converted to `relationship_effect.friendship`;
  the metadata flag was left as-is. No conflict between the two representations.

## Backfill
`081_relationship_backfill_valentina.sql` copies legacy `player_states.stats->valentina_relationship`
into `user_relationships.friendship_level` via idempotent ON CONFLICT (only `updated_at` refreshed
on conflict, preserving existing canonical friendship for players who already earned it).
