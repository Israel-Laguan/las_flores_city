#!/usr/bin/env bash
# ============================================================
# M48 Valentina Quan posture playtest seeder.
#
# Seeds user_relationships + player_states flags for each of the
# 7 playtest scenarios against a dedicated dev-login player.
#
# Usage:
#   ./scripts/seed-vq-playtest.sh <1..7> [variant]
#     5 re  -> scenario 5 re-engagement state
#     6 re  -> scenario 6 warm re-engagement state
#     7 low -> scenario 7 low-romance check
#   ./scripts/seed-vq-playtest.sh clean   # remove test rows
#
# Requires the Podman stack (postgres-oltp container) running.
# Player UUID is dedicated to this playtest (collision-safe).
# ============================================================
set -euo pipefail

USER_ID="${VQ_PLAYTEST_USER:-00000000-0000-0000-0000-000000000001}"
VQ_ID="670eea6f-3983-4d5a-8195-b08be6c81661"
SCENE_ID="550e8400-e29b-41d4-a716-446655440002"

psql_run() {
  podman exec -i las-flores-postgres-oltp psql -U las_flores -d las_flores -v ON_ERROR_STOP=1 "$@"
}

ensure_player() {
  psql_run -q <<SQL
INSERT INTO users (id, email, username, display_name)
VALUES ('$USER_ID', 'vq_playtest@test.com', 'vq_playtest', 'VQ Playtest')
ON CONFLICT (id) DO NOTHING;
INSERT INTO player_states (user_id, current_location_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, state, stats)
VALUES ('$USER_ID', '$SCENE_ID', 48, 100, 0, 1, 'prologue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW();
SQL
}

seed_rel() {
  # trust fam align tension debt vis bond vibe romance friendship status
  local t=$1 f=$2 al=$3 te=$4 vibe=$5 rom=$6 st=$7
  ensure_player
  psql_run -q <<SQL
INSERT INTO user_relationships (
  user_id, character_id, friendship_level, romance_level,
  trust, familiarity, alignment, tension, debt, visibility,
  bond_level, daily_vibe, status, memory, flags, last_interaction_day, last_decay_day
) VALUES (
  '$USER_ID', '$VQ_ID', 0, $rom,
  $t, $f, $al, $te, 0, 0,
  0, $vibe, '$st', '{}'::jsonb, '{}'::jsonb, 1, 1
)
ON CONFLICT (user_id, character_id) DO UPDATE SET
  romance_level = $rom, trust = $t, familiarity = $f,
  alignment = $al, tension = $te, daily_vibe = $vibe,
  status = '$st', memory = '{}'::jsonb, flags = '{}'::jsonb,
  last_interaction_day = 1, last_decay_day = 1, updated_at = NOW();
-- Pin decay bookkeeping to the player's current day so the decay
-- worker cannot shift daily_vibe/tension mid-playtest.
UPDATE user_relationships SET last_interaction_day = (SELECT current_day FROM player_states WHERE user_id = '$USER_ID'),
  last_decay_day = (SELECT current_day FROM player_states WHERE user_id = '$USER_ID')
WHERE user_id = '$USER_ID' AND character_id = '$VQ_ID';
SQL
}

set_flags() {
  psql_run -q -c "UPDATE player_states SET flags = flags || '$1'::jsonb WHERE user_id = '$USER_ID';"
}

clear_arc_flags() {
  set_flags '{"vq_met": false, "vq_intro_done": false, "vq_layover_done": false, "vq_push_done": false, "vq_father_revealed": false, "vq_gave_space": false, "vq_pushed_away": false, "vq_arc": null}'
}

case "${1:-}" in
  1)
    clear_arc_flags
    set_flags '{"vq_met": true, "vq_intro_done": true, "vq_layover_done": true, "vq_push_done": true, "vq_father_revealed": true, "vq_gave_space": true}'
    seed_rel 50 60 0 10 20 30 CONFIDANT
    echo "Scenario 1 seeded: trust=50 fam=60 tension=10 vibe=20 rom=30 CONFIDANT + gave_space"
    ;;
  2)
    clear_arc_flags
    set_flags '{"vq_met": true, "vq_intro_done": true, "vq_layover_done": true, "vq_push_done": true, "vq_father_revealed": true, "vq_gave_space": true}'
    seed_rel 10 40 0 20 10 35 ACQUAINTANCE
    echo "Scenario 2 seeded: trust=10 fam=40 tension=20 vibe=10 rom=35 ACQUAINTANCE + gave_space"
    ;;
  3)
    clear_arc_flags
    set_flags '{"vq_met": true, "vq_intro_done": true, "vq_layover_done": true, "vq_push_done": true}'
    seed_rel 12 15 0 65 0 0 STRANGER
    echo "Scenario 3 seeded: trust=12 fam=15 tension=65 (GUARDED expected)"
    ;;
  4)
    clear_arc_flags
    seed_rel 0 60 -40 65 0 0 STRANGER
    echo "Scenario 4 seeded: fam=60 alignment=-40 tension=65 (CONFRONTATIONAL expected)"
    ;;
  5)
    clear_arc_flags
    set_flags '{"vq_met": true, "vq_intro_done": true, "vq_layover_done": true, "vq_push_done": true, "vq_father_revealed": true, "vq_gave_space": true}'
    if [ "${2:-}" = "re" ]; then
      seed_rel 55 60 0 15 25 30 CONFIDANT
      echo "Scenario 5 (re-engagement) seeded: vibe=25 -> pacing hidden, Grounded back"
    else
      seed_rel 55 60 0 15 -45 30 CONFIDANT
      echo "Scenario 5 (neglect) seeded: vibe=-45 -> pacing fallback shown"
    fi
    ;;
  6)
    clear_arc_flags
    if [ "${2:-}" = "re" ]; then
      set_flags '{"vq_met": true, "vq_intro_done": true, "vq_layover_done": true, "vq_push_done": true, "vq_father_revealed": true, "vq_pushed_away": false}'
      seed_rel 45 60 0 10 20 20 CONFIDANT
      echo "Scenario 6 (warm re-engage) seeded: trust=45 -> shut_out hidden"
    else
      set_flags '{"vq_met": true, "vq_intro_done": true, "vq_pushed_away": true, "vq_gave_space": false}'
      seed_rel 5 30 0 40 0 0 ACQUAINTANCE
      echo "Scenario 6 (pushed-away) seeded: trust=5 + pushed_away -> shut_out shown"
    fi
    ;;
  7)
    clear_arc_flags
    set_flags '{"vq_met": true, "vq_intro_done": true, "vq_layover_done": true, "vq_push_done": true, "vq_father_revealed": true, "vq_gave_space": true, "vq_pushed_away": false}'
    if [ "${2:-}" = "low" ]; then
      seed_rel 50 60 0 10 20 10 CONFIDANT
      echo "Scenario 7 (low romance) seeded: rom=10 -> Grounded hidden"
    else
      seed_rel 50 60 0 10 20 30 CONFIDANT
      echo "Scenario 7 (romantic success) seeded: take branch_grounded -> grounded_accept (ROMANTIC transition)"
    fi
    ;;
  show)
    psql_run -c "SELECT trust, familiarity, alignment, tension, daily_vibe AS vibe, romance_level AS romance, status FROM user_relationships WHERE user_id='$USER_ID' AND character_id='$VQ_ID';"
    psql_run -c "SELECT flags FROM player_states WHERE user_id='$USER_ID';"
    ;;
  clean)
    psql_run -q -c "DELETE FROM user_relationships WHERE user_id='$USER_ID'; DELETE FROM player_states WHERE user_id='$USER_ID'; DELETE FROM users WHERE id='$USER_ID';"
    echo "Playtest player + relationship rows removed."
    ;;
  *)
    echo "Usage: $0 <1|2|3|4|5|5 re|6|6 re|7|7 low|show|clean>" >&2
    exit 1
    ;;
esac
