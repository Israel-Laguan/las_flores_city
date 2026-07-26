-- =============================================================================
-- Player seed accounts (available in all non-production environments)
-- =============================================================================
-- These are permanent player accounts for manual testing and development.
-- They are NOT admin accounts — they have the 'player' role and can only
-- access client-facing endpoints.
--
-- Player 1: Fresh start (prologue, day 1)
-- Player 2: Onboarding finished (act1, day 5, some progress)
-- =============================================================================

-- Player 1 — Fresh start
INSERT INTO users (id, email, username, display_name, role, password_hash)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'player1@example.com',
  'player1',
  'Player One',
  'player',
  '$2b$10$yvbOmJPJvnnS8PknuBJ3fueVGdxewAx0KM67dDhWsuOODyB8r2PUK'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_location_id, current_day, story_beat, alignment)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  48, 100, 0,
  '550e8400-e29b-41d4-a716-446655440002',  -- Welcome Center
  1, 'prologue', 'neutral'
)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_entitlements (user_id, is_premium, is_nsfw_unlocked, patreon_tier)
VALUES ('11111111-1111-1111-1111-111111111111', false, false, NULL)
ON CONFLICT (user_id) DO NOTHING;

-- Player 2 — Onboarding finished (act1, some progress)
INSERT INTO users (id, email, username, display_name, role, password_hash)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'player2@example.com',
  'player2',
  'Player Two',
  'player',
  '$2b$10$yvbOmJPJvnnS8PknuBJ3fueVGdxewAx0KM67dDhWsuOODyB8r2PUK'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_location_id, current_day, story_beat, alignment)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  36, 120, 10,
  'a1b2c3d4-e5f6-7890-abcd-ef1234567001',  -- Central Plaza
  5, 'act1', 'neutral'
)
ON CONFLICT (user_id) DO NOTHING;

-- Player 2 has some relationships established
INSERT INTO user_relationships (user_id, character_id, friendship_level, romance_level)
VALUES ('22222222-2222-2222-2222-222222222222', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 10, 0)
ON CONFLICT (user_id, character_id) DO NOTHING;

INSERT INTO user_relationships (user_id, character_id, friendship_level, romance_level)
VALUES ('22222222-2222-2222-2222-222222222222', '550e8400-e29b-41d4-a716-446655440001', 5, 0)
ON CONFLICT (user_id, character_id) DO NOTHING;

INSERT INTO user_entitlements (user_id, is_premium, is_nsfw_unlocked, patreon_tier)
VALUES ('22222222-2222-2222-2222-222222222222', false, false, NULL)
ON CONFLICT (user_id) DO NOTHING;