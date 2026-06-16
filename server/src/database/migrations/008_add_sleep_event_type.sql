-- Las Flores 2077 - Add 'sleep' event type to OLAP analytics
-- Run this migration on the analytics database

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
    'sleep'
));

COMMIT;
