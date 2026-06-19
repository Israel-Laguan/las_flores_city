-- Las Flores 2077 - Meta-Plot Finale Alignment (Task 5.3)
--
-- Adds the two capabilities required for the meta-plot finale
-- "loyalist vs. fugitive" alignment split:
--
--   1. OLTP: `users.alignment` — ENUM column defaulted to 'neutral',
--      set by /dialogue/choose when a YAML choice carries an
--      `alignment_change` directive. Drives overlay unlock
--      gating (`loyalist_only` / `fugitive_only`) in the
--      DialogueResolver.
--
--   2. OLAP: `player_events.event_type` CHECK extended to allow
--      `'alignment_locked'`, emitted post-commit by
--      /dialogue/choose when an alignment change is applied.
--      The same event feeds the meta-plot leaderboard (Task 5.3
--      finale). Final lock event in the player's life — they
--      cannot change alignment after the finale choice.
--
-- This file is registered in BOTH the `oltp` and `olap` arrays
-- of migration-targets.json and uses `current_database()` to
-- dispatch the right section at apply time. The version
-- (`028`) is keyed once per database in `schema_migrations`
-- (separate rows per `database_name`).
--
-- Drift #13 from the spec: the spec's `alignment_locked` event
-- type is not in the existing CHECK constraint (added by
-- 020_add_mystery_solved_event_type.sql), so this migration
-- rewrites the CHECK with the full canonical event list plus
-- the new value.

BEGIN;

DO $$
DECLARE
    current_db TEXT := current_database();
BEGIN
    IF current_db = 'las_flores' THEN
        -- OLTP: faction_alignment enum + users.alignment column
        CREATE TYPE faction_alignment AS ENUM ('neutral', 'loyalist', 'fugitive');
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS alignment faction_alignment NOT NULL DEFAULT 'neutral';
        -- Task 5.3: unlock_condition gate on dialogue_overlays.
        -- nullable because existing overlay rows have no gate;
        -- 'none' and 'patreon_nsfw' are the only pre-existing
        -- values; 'loyalist_only' and 'fugitive_only' are new.
        ALTER TABLE dialogue_overlays
            ADD COLUMN IF NOT EXISTS unlock_condition VARCHAR(50) DEFAULT 'none';
    ELSIF current_db = 'las_flores_analytics' THEN
        -- OLAP: extend player_events.event_type CHECK
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
    ELSE
        RAISE EXCEPTION 'Unknown database for migration 028: %', current_db;
    END IF;
END$$;

COMMIT;
