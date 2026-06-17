-- Las Flores 2077 - Player State Schema Changes
-- Adds missing columns for player state tracking

BEGIN;

-- ============================================================
-- 1.1.1a: The users Table - add missing columns if not exist
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_node_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gold_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS time_blocks INTEGER NOT NULL DEFAULT 48 CHECK (time_blocks >= 0 AND time_blocks <= 48);

-- ============================================================
-- 1.1.1b: Migration Script - indexes for new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_current_node ON users(current_node_id);
CREATE INDEX IF NOT EXISTS idx_users_current_location ON users(current_location_id);

-- ============================================================
-- Seed test user with all new columns
-- ============================================================

-- Create required scenes first (before user that references them)
INSERT INTO scenes (id, name, description, district, image_url, background_url, ambient_sound_url, mood, available_dialogues, metadata)
VALUES 
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'The Apartment', 'A small, sterile apartment in the N&M LTD residential block.', 'Downtown', NULL, '/assets/scenes/apartment/background.png', '/assets/scenes/apartment/ambient.mp3', 'tense', '{}', '{"type": "starting_location", "accessible": true, "is_sleep_location": true}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO scenes (id, name, description, district, image_url, background_url, ambient_sound_url, mood, available_dialogues, metadata)
VALUES 
  ('e5f6a7b8-c9d0-1234-efab-345678901234', 'Old Town Cafe', 'A cozy cafe tucked away in the old quarter.', 'Old Town', NULL, '/assets/scenes/old_town_cafe/background.png', '/assets/scenes/old_town_cafe/ambient.mp3', 'cozy', '{}', '{"type": "social_hub", "accessible": true}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO scenes (id, name, description, district, image_url, background_url, ambient_sound_url, mood, available_dialogues, metadata)
VALUES 
  ('550e8400-e29b-41d4-a716-446655440002', 'Welcome Center', 'The official welcome center for new arrivals in Las Flores.', 'Downtown', NULL, '/assets/scenes/welcome_center/background.png', NULL, 'neutral', '{}', '{"type": "starting_location", "accessible": true}')
ON CONFLICT (id) DO NOTHING;

-- Create required characters
INSERT INTO characters (id, name, title, description, avatar_url, metadata)
VALUES 
  ('550e8400-e29b-41d4-a716-446655440004', 'The Handler', 'N&M Supervisor', 'A behavioral handler from Nakamura & Morgan LTD. Professional, cold, and strictly metrics-driven.', NULL, '{"type": "human", "role": "quest_giver", "personality": "professional", "faction": "Nakamura & Morgan LTD", "first_appearance": "dialogue_awakening"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO characters (id, name, title, description, avatar_url, metadata)
VALUES 
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'The Barista', 'Barista', 'A barista at the local Old Town café. Deeply connected to the neighborhood, highly observant, and secretly cynical about corporate expansion.', NULL, '{"type": "human", "role": "social", "personality": "observant"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO characters (id, name, title, description, avatar_url, metadata)
VALUES 
  ('550e8400-e29b-41d4-a716-446655440001', 'ARIA', 'Welcome Bot', 'A welcoming AI assistant at the Welcome Center.', NULL, '{"type": "ai", "role": "guide", "personality": "helpful"}')
ON CONFLICT (id) DO NOTHING;

-- Create test user (now that scenes exist)
INSERT INTO users (id, email, username, display_name, password_hash, credits, gold_credits, current_location_id, current_node_id, time_blocks, current_day, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'dev@example.com', 'devuser', 'Dev User', '$2a$10$test', 0, 0, '550e8400-e29b-41d4-a716-446655440002', NULL, 48, 1, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

UPDATE users SET
  time_blocks = 48,
  gold_credits = 0,
  current_node_id = NULL,
  last_login = NOW()
WHERE id = '00000000-0000-0000-0000-000000000001';

-- ============================================================
-- Link NPCs to locations (scene_characters) - only insert if not exists
-- ============================================================

-- Handler in The Apartment
INSERT INTO scene_characters (scene_id, character_id, relationship_level, relationship_type, is_permanent, default_mood)
VALUES ('c3d4e5f6-a7b8-9012-cdef-123456789012', '550e8400-e29b-41d4-a716-446655440004', 0, 'stranger', TRUE, 'neutral')
ON CONFLICT (scene_id, character_id) DO NOTHING;

-- Barista in Old Town Cafe
INSERT INTO scene_characters (scene_id, character_id, relationship_level, relationship_type, is_permanent, default_mood)
VALUES ('e5f6a7b8-c9d0-1234-efab-345678901234', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 0, 'stranger', TRUE, 'neutral')
ON CONFLICT (scene_id, character_id) DO NOTHING;

-- ARIA in Welcome Center
INSERT INTO scene_characters (scene_id, character_id, relationship_level, relationship_type, is_permanent, default_mood)
VALUES ('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 0, 'stranger', TRUE, 'neutral')
ON CONFLICT (scene_id, character_id) DO NOTHING;

COMMIT;
