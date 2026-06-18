-- Las Flores 2077 - Marketplace OLAP event types (Task 4.3)
-- Run this migration on the analytics database (OLAP).
--
-- Extends the player_events.event_type CHECK constraint to include
-- 'iap_completed' (PayPal webhook gold credit grant) and
-- 'shop_purchase' (in-game /shop/buy spend of credits/gold_credits).
-- Pattern from 019_add_vault_event_type.sql and
-- 020_add_mystery_solved_event_type.sql: drop + re-add with the new
-- types appended to the existing enum.

BEGIN;

ALTER TABLE player_events
    DROP CONSTRAINT IF EXISTS player_events_event_type_check;

ALTER TABLE player_events
    ADD CONSTRAINT player_events_event_type_check
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
        'shop_purchase'
    ));

COMMIT;
