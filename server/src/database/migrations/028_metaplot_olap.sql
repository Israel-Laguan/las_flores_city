-- Las Flores 2077 - Meta-Plot Finale Alignment: OLAP (Task 5.3)
--
-- Split out of the former dual-target `028_metaplot_alignment.sql` so this file
-- targets ONLY the OLAP (analytics) database. It follows the one-file-per-DB
-- convention used by every other migration in this repo — no `current_database()`
-- guard (the runner knows which database it targets via the `olap` array).
--
-- The version prefix stays `028` (matching the parent migration) so databases
-- that already recorded version `028` for `las_flores_analytics` are skipped by
-- the runner's `isAppliedOn` version check.
--
-- OLAP: extend `player_events.event_type` CHECK to allow `'alignment_locked'`,
-- emitted post-commit by /dialogue/choose when an alignment change is applied.
-- The same event feeds the meta-plot leaderboard (Task 5.3 finale). Final lock
-- event in the player's life — they cannot change alignment after the finale
-- choice. Drift #13: the spec's `alignment_locked` type wasn't in the existing
-- CHECK (added by 020_add_mystery_solved_event_type.sql), so this migration
-- rewrites the CHECK with the full canonical event list plus the new value.

BEGIN;

ALTER TABLE player_events DROP CONSTRAINT IF EXISTS player_events_event_type_check;
ALTER TABLE player_events ADD CONSTRAINT player_events_event_type_check
    CHECK (event_type IN (
        'dialogue_start',
        'dialogue_choice',
        'dialogue_end',
        'location_enter',
        'location_exit',
        'time_block_spent',
        'item_acquired',
        'item_used',
        'flag_set',
        'mystery_progress',
        'move',
        'sleep',
        'gig_completed',
        'post_liked',
        'sms_received',
        'sms_reply_submitted',
        'vault_item_unlocked',
        'mystery_solved',
        'iap_completed',
        'shop_purchase',
        'alignment_locked'
    ));

COMMIT;