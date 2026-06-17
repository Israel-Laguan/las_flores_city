-- Task 3.4 OLAP event seed (run in OLAP database).
-- One event per solver at a hardcoded timestamp that falls inside
-- the test seed's solver window (18:01:14 -> 18:06:14). The worker
-- filter window is min(started_at)..max(solved_at), so 18:03:00 is
-- safely inside all four solvers' [started_at, solved_at] ranges.
DELETE FROM player_events WHERE user_id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444'
) AND event_type IN ('move', 'dialogue_choice', 'gig_completed');

INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost, created_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'move',           '{"loc":"a"}'::jsonb,  5, TIMESTAMP '2026-06-17 18:03:00+00'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'move',           '{"loc":"b"}'::jsonb, 10, TIMESTAMP '2026-06-17 18:03:00+00'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'move',           '{"loc":"c"}'::jsonb, 15, TIMESTAMP '2026-06-17 18:03:00+00'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'dialogue_choice','{"loc":"d"}'::jsonb,100, TIMESTAMP '2026-06-17 18:03:00+00');
