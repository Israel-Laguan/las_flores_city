-- Las Flores 2077 - Add SMS event types to OLAP analytics
--
-- Adds 'sms_received' (emitted on npc message into a thread) and
-- 'sms_reply_submitted' (emitted when the user posts a reply choice) to the
-- player_events.event_type CHECK constraint.
--
-- Run this migration on the analytics database (OLAP).

BEGIN;

ALTER TABLE player_events DROP CONSTRAINT IF EXISTS player_events_event_type_check;

ALTER TABLE player_events ADD CONSTRAINT player_events_event_type_check CHECK (event_type IN (
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
    'sms_reply_submitted'
));

COMMIT;
