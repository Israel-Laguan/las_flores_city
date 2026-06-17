-- Las Flores 2077 - Add mystery_solved OLAP event type (Task 3.3)
-- Extends the player_events.event_type CHECK constraint to include
-- 'mystery_solved' so the Breakthrough state machine can emit analytics
-- events when a player solves a mystery (winner / late solver / latecomer).

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
        'mystery_solved'
    ));

COMMIT;
