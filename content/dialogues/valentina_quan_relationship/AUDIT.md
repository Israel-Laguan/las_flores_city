# Valentina Quan — Relationship Gate Audit (M48)

Target character: `670eea6f-3983-4d5a-8195-b08be6c81661`
Contract: `required_relationship` / `hidden_if_relationship` / `required_posture` / `hidden_if_posture`
Canonical store: `user_relationships` (axes, bond, vibe, romance, friendship, status, flags, memory)
Legacy fallback (kept live): `required_stats` / `hidden_if_stats` on `<slug>_trust` for `adeyemi_/aisha_/petra_/sofia_`.

## Per-file results

### dialogue_vq_intro.yaml (Act 1)
- Arc: First contact. Entry: `vq_intro_start` (3 branches: smalltalk/flirt/observant).
- Effects migrated: `flirt_play` romance +4 → `relationship_effect.romance`; `observant_coffee` romance +3 → `relationship_effect.romance`; `flirt_home`/`observant_end` `stat_set.vq_trust` → `relationship_effect.axes.trust` (2 / 10).
- Gates: none added on first play (per plan — "no gate change needed for first play"). Arc flags `vq_met`/`vq_intro_done`/`vq_arc` kept as player-state flags/state.
- Fallback: `vq_intro_smalltalk` → `vq_intro_cold_end` (always available, no gate). Entry node keeps ≥1 ungated choice.
- Visual coverage: default/focused/smirk/happy/shocked/vulnerable/tender.
- Result: PASS — no relationship row required for first play; romance now tracked.

### dialogue_vq_layover.yaml (Act 2)
- Arc: The Facade. Entry: `vq_layover_start` (3 branches) → phone → end.
- Effects migrated: tease +5, empathize +15, why +8, mother +8, space +5, end +5 trust → `relationship_effect.axes.trust`. Added romance +3 (empathize) and +2 (space).
- Gates: no hard required_relationship added (kept posture-gate optional per plan). Empathize remains the highest-trust payout.
- Fallback: `vq_layover_phone` has two choices (`phone_ask` → mother, `phone_space` → space); both ungated, so node never empties.
- Result: PASS.

### dialogue_vq_push.yaml (Act 3)
- Arc: The Wall. Entry: `vq_push_start` → `vq_push_wall` (3 branches).
- Effects migrated: `wall_push_harder` romance -10 → `relationship_effect.romance:-10`; `wall_back_off` added romance +5; `wall_vulnerable_first` romance +8 → `relationship_effect.romance:8`. `stat_set.vq_trust` (-5/20/12) → `relationship_effect.axes.trust`.
- Gates: `wall_vulnerable_first` (intimate path) gated `required_relationship: { axes: { trust: "gte:15" } }` so it is not offered to a low-trust re-engagement. `vq_push_start` → `vq_push_wall` (`push_ask`) stays ungated (entry point). The three `vq_push_wall` branches all remain reachable.
- Fallback: `vq_push_start` has exactly one choice (`push_ask`) and it is ungated.
- Result: PASS.

### dialogue_vq_father.yaml (Act 4)
- Arc: The Father Wound. Entry: `vq_father_start` (3 branches).
- Effects migrated: open_trust +5, open_deep +10, breakthrough_2 +15, probe -10, recover +5, quiet +8, end +5 trust → `relationship_effect.axes.trust`.
- Gates:
  - `entry_trust` converted `required_stats: vq_trust gte:30` → `required_relationship: { axes: { trust: "gte:30" } }` (keeps `hidden_if: vq_gave_space`).
  - `entry_shallow` got `required_relationship: { neutral_default: true }` (always-pass guard) so a first-time player with no relationship row still gets the guarded version (fail-closed would wrongly hide it).
  - `entry_deep` keeps `required_flags: vq_gave_space` (player flag, not relationship).
  - `tuition_pattern` (leads to breakthrough) gated `required_relationship: { axes: { trust: "gte:20" } }` so the deepest reveal only fires on an earned relationship.
- Fallback: `vq_father_start` always has `entry_shallow` (ungated) available.
- Result: PASS.

### dialogue_vq_endings.yaml (Act 5) — compatibility matrix
- Arc: Runways. Entry: `vq_endings_start` (5 branches).
- Effects migrated: grounded +20, departed +10, shut_out -10 trust → `relationship_effect.axes.trust`. `grounded_accept` romance +15 → `relationship_effect: { romance: 15, status: ROMANTIC }`.
- Gates:
  - `branch_grounded`: `required_flags: vq_gave_space`, `hidden_if: vq_pushed_away`, `required_relationship: { axes: { trust: "gte:40" }, romance: "gte:25" }`, plus `hidden_if_relationship: { vibe: "lt:-30" }` (pacing guard).
  - `branch_departed`: `required_relationship: { axes: { trust: "gte:15" }, romance: "gte:15" }`, `hidden_if_relationship: { vibe: "lt:-30" }`, `hidden_if: { vq_pushed_away, vq_gave_space }`.
  - `branch_shut_out`: `required_flags: vq_pushed_away`, `hidden_if_relationship: { axes: { trust: "gte:20" } }` (never the only option when trust is high).
  - `branch_friends`: NO relationship gate — always available default fallback.
  - `branch_pacing` (new): `required_relationship: { vibe: "lt:-30" }`, `hidden_if: vq_pushed_away` — non-advancing end node when she is raw tonight.
- Fallback: `branch_friends` is always available; `branch_pacing` covers the low-vibe re-engagement case. Entry node retains ≥1 ungated choice.
- Result: PASS — the 7-scenario compatibility matrix is satisfiable (see tests/integration).

## Conflict cases
- Romance without trust: a `relationship_effect.romance` (e.g. grounded +15) now requires the `branch_grounded` trust+romance gate, so a low-trust re-engagement never reaches the romantic Grounded ending. No contradictory "you pushed" on a warm relationship — `branch_shut_out` is keyed on `vq_pushed_away` and additionally hidden when trust ≥ 20.
- `normalizeDelta` couples romance→tension (+trunc(romance/2)); the Grounded ending's +15 romance also adds ~+7 tension, consistent with "volatile romance." Thresholds account for this.

## Backfill
`078_relationship_backfill_valentina.sql` copies legacy `player_states.stats->vq_trust` into `user_relationships.trust` for existing saves (idempotent ON CONFLICT). Romance/friendship levels already existed from legacy `upsert_user_relationship`.
