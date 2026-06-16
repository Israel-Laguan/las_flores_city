-- Las Flores 2077 - Sprint 1 Schema Changes
-- Adds missing columns per Task 1.1 spec, scene_characters, auth support

BEGIN;

-- ============================================================
-- 1.1.1a: The users Table - add missing columns
-- ============================================================

-- Already exists from Sprint 0: id, email, username, display_name, created_at, updated_at
-- Added in previous migration: credits, password_hash, current_location_id

-- Add current_node_id (tracks where they are in a conversation)
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_node_id VARCHAR(100);

-- Add gold_credits (premium currency)
ALTER TABLE users ADD COLUMN IF NOT EXISTS gold_credits INTEGER NOT NULL DEFAULT 0;

-- Add last_login timestamp
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- Add time_blocks directly to users table (inline, not separate table)
ALTER TABLE users ADD COLUMN IF NOT EXISTS time_blocks INTEGER NOT NULL DEFAULT 48 CHECK (time_blocks >= 0 AND time_blocks <= 48);

-- ============================================================
-- 1.1.1b: Migration Script - indexes for new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_current_node ON users(current_node_id);

-- ============================================================
-- Seed test user with all new columns
-- ============================================================

UPDATE users SET
  time_blocks = 48,
  gold_credits = 0,
  current_node_id = NULL,
  last_login = NOW()
WHERE id = '00000000-0000-0000-0000-000000000001';

-- ============================================================
-- Scene-Characters junction table (NPCs present at locations)
-- ============================================================

CREATE TABLE IF NOT EXISTS scene_characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    relationship_level INTEGER NOT NULL DEFAULT 0 CHECK (relationship_level >= 0 AND relationship_level <= 100),
    relationship_type VARCHAR(20) DEFAULT 'acquaintance' CHECK (relationship_type IN ('stranger', 'acquaintance', 'friend', 'close_friend', 'romantic')),
    is_available BOOLEAN DEFAULT TRUE,
    spawn_conditions JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(scene_id, character_id)
);

-- ============================================================
-- Dialogue state tracking per player
-- ============================================================

CREATE TABLE IF NOT EXISTS player_dialogue_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dialogue_tree_id UUID NOT NULL REFERENCES dialogue_trees(id) ON DELETE CASCADE,
    current_node_id VARCHAR(100) NOT NULL,
    choices_made JSONB DEFAULT '[]',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, dialogue_tree_id)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_current_location ON users(current_location_id);
CREATE INDEX IF NOT EXISTS idx_scene_characters_scene_id ON scene_characters(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_characters_character_id ON scene_characters(character_id);
CREATE INDEX IF NOT EXISTS idx_player_dialogue_states_user_id ON player_dialogue_states(user_id);
CREATE INDEX IF NOT EXISTS idx_player_dialogue_states_dialogue_tree_id ON player_dialogue_states(dialogue_tree_id);

-- ============================================================
-- Triggers
-- ============================================================

CREATE TRIGGER update_scene_characters_updated_at BEFORE UPDATE ON scene_characters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_player_dialogue_states_updated_at BEFORE UPDATE ON player_dialogue_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Link NPCs to locations (scene_characters)
-- ============================================================

-- Handler in The Apartment
INSERT INTO scene_characters (scene_id, character_id, relationship_level, relationship_type)
VALUES ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 0, 'stranger')
ON CONFLICT (scene_id, character_id) DO NOTHING;

-- Barista in Old Town Cafe
INSERT INTO scene_characters (scene_id, character_id, relationship_level, relationship_type)
VALUES ('e5f6a7b8-c9d0-1234-efab-345678901234', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 0, 'stranger')
ON CONFLICT (scene_id, character_id) DO NOTHING;

-- ARIA in Welcome Center (from Sprint 0)
INSERT INTO scene_characters (scene_id, character_id, relationship_level, relationship_type)
VALUES ('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 0, 'stranger')
ON CONFLICT (scene_id, character_id) DO NOTHING;

COMMIT;
