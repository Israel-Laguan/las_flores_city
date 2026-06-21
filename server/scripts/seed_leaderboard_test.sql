-- Task 3.4 End-to-End Seed
-- Creates 4 solvers, 1 expired mystery, and OLAP event rows so the
-- LeaderboardWorker can rank them deterministically.
BEGIN;

-- 4 test users (deterministic UUIDs)
INSERT INTO users (id, email, username, display_name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'solver_a@test', 'solver_a', 'Solver A'),
  ('22222222-2222-2222-2222-222222222222', 'solver_b@test', 'solver_b', 'Solver B'),
  ('33333333-3333-3333-3333-333333333333', 'solver_c@test', 'solver_c', 'Solver C'),
  ('44444444-4444-4444-4444-444444444444', 'solver_d@test', 'solver_d', 'Solver D')
ON CONFLICT (id) DO NOTHING;

INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, alignment)
VALUES
  ('11111111-1111-1111-1111-111111111111', 0, 0, 0, 1, 'prologue', '{}'::jsonb, 'neutral'),
  ('22222222-2222-2222-2222-222222222222', 0, 0, 0, 1, 'prologue', '{}'::jsonb, 'neutral'),
  ('33333333-3333-3333-3333-333333333333', 0, 0, 0, 1, 'prologue', '{}'::jsonb, 'neutral'),
  ('44444444-4444-4444-4444-444444444444', 0, 0, 0, 1, 'prologue', '{}'::jsonb, 'neutral')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public_profiles (user_id, cosmetics, badges, display_settings)
VALUES
  ('11111111-1111-1111-1111-111111111111', '{}', '[]', '{}'),
  ('22222222-2222-2222-2222-222222222222', '{}', '[]', '{}'),
  ('33333333-3333-3333-3333-333333333333', '{}', '[]', '{}'),
  ('44444444-4444-4444-4444-444444444444', '{}', '[]', '{}')
ON CONFLICT (user_id) DO NOTHING;

-- Mystery expired 10 minutes ago, so 2-min grace period is satisfied
INSERT INTO mysteries (id, title, description, status, expires_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Heist at the Marina',
   'A yacht was stolen from the Las Flores marina.',
   'RESOLVING',
   NOW() - INTERVAL '10 minutes')
ON CONFLICT (id) DO UPDATE
  SET status = 'RESOLVING', expires_at = NOW() - INTERVAL '10 minutes';

-- Solve times are 100s, 200s, 300s, and 50s after start
-- All started at the same instant so the OLAP window is well-defined
WITH bounds AS (
  SELECT NOW() - INTERVAL '30 minutes' AS started_at
)
INSERT INTO player_mysteries (user_id, mystery_id, status, started_at, solved_at)
SELECT * FROM (
  VALUES
    ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'SOLVED',
     (SELECT started_at FROM bounds), (SELECT started_at + INTERVAL '100 seconds' FROM bounds)),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'SOLVED',
     (SELECT started_at FROM bounds), (SELECT started_at + INTERVAL '200 seconds' FROM bounds)),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'SOLVED',
     (SELECT started_at FROM bounds), (SELECT started_at + INTERVAL '300 seconds' FROM bounds)),
    ('44444444-4444-4444-4444-444444444444'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'SOLVED',
     (SELECT started_at FROM bounds), (SELECT started_at + INTERVAL '50 seconds'  FROM bounds))
) AS t(user_id, mystery_id, status, started_at, solved_at)
ON CONFLICT (user_id, mystery_id) DO UPDATE
  SET status = EXCLUDED.status,
      started_at = EXCLUDED.started_at,
      solved_at = EXCLUDED.solved_at;

COMMIT;

-- OLAP events: each solver gets a known TB cost summed across
-- the various spendable event types, all within their start..solve window.
INSERT INTO player_events (id, user_id, event_type, event_data, time_blocks_cost, created_at)
SELECT gen_random_uuid(), u, 'move', '{}'::jsonb, 1,
       NOW() - INTERVAL '29 minutes' + (g || ' minutes')::interval
FROM (
  VALUES
    ('11111111-1111-1111-1111-111111111111'::uuid, 5),   -- 5 move events → 5 TB
    ('22222222-2222-2222-2222-222222222222'::uuid, 10),  -- 10 move events → 10 TB
    ('33333333-3333-3333-3333-333333333333'::uuid, 15),  -- 15 move events → 15 TB
    ('44444444-4444-4444-4444-444444444444'::uuid, 100)  -- 100 move events → 100 TB
) AS t(u, g);
