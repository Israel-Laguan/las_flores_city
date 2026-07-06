-- Las Flores 2077 - Initial OLTP Schema
-- Run this migration to set up the core database tables

BEGIN;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Characters table
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    title VARCHAR(100),
    description TEXT NOT NULL,
    avatar_url VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dialogue trees table
CREATE TABLE dialogue_trees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    start_node_id VARCHAR(100) NOT NULL,
    nodes JSONB NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dialogue overlays table
CREATE TABLE dialogue_overlays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    target_tree_id UUID NOT NULL REFERENCES dialogue_trees(id) ON DELETE CASCADE,
    modifications JSONB NOT NULL DEFAULT '[]',
    conditions JSONB DEFAULT '{}',
    priority INTEGER DEFAULT 0,
    is_nsfw BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scenes/Locations table
CREATE TABLE scenes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    district VARCHAR(50) NOT NULL,
    image_url VARCHAR(500),
    background_url VARCHAR(500),
    ambient_sound_url VARCHAR(500),
    mood VARCHAR(50),
    available_dialogues UUID[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(30) UNIQUE NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255),
    credits INTEGER NOT NULL DEFAULT 0,
    gold_credits INTEGER NOT NULL DEFAULT 0,
    time_blocks INTEGER NOT NULL DEFAULT 48 CHECK (time_blocks >= 0 AND time_blocks <= 48),
    current_node_id VARCHAR(100),
    current_location_id UUID REFERENCES scenes(id),
    last_login TIMESTAMP WITH TIME ZONE,
    current_day INTEGER NOT NULL DEFAULT 1,
    active_dialogue_id UUID REFERENCES dialogue_trees(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User entitlements table
CREATE TABLE user_entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_premium BOOLEAN DEFAULT FALSE,
    is_nsfw_unlocked BOOLEAN DEFAULT FALSE,
    patreon_tier VARCHAR(20) DEFAULT 'none' CHECK (patreon_tier IN ('none', 'supporter', 'premium', 'exclusive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Time blocks table
CREATE TABLE time_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_blocks INTEGER NOT NULL DEFAULT 12 CHECK (current_blocks >= 0 AND current_blocks <= 24),
    max_blocks INTEGER NOT NULL DEFAULT 12 CHECK (max_blocks >= 1 AND max_blocks <= 24),
    last_refresh_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scene-Characters junction table (NPCs present at locations)
CREATE TABLE scene_characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    relationship_level INTEGER NOT NULL DEFAULT 0 CHECK (relationship_level >= 0 AND relationship_level <= 100),
    relationship_type VARCHAR(20) DEFAULT 'acquaintance' CHECK (relationship_type IN ('stranger', 'acquaintance', 'friend', 'close_friend', 'romantic')),
    is_available BOOLEAN DEFAULT TRUE,
    is_permanent BOOLEAN NOT NULL DEFAULT TRUE,
    default_mood VARCHAR(50) NOT NULL DEFAULT 'neutral',
    spawn_conditions JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(scene_id, character_id)
);

-- User relationships table (NPC bond tracking per player)
CREATE TABLE user_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    friendship_level INTEGER NOT NULL DEFAULT 0 CHECK (friendship_level >= 0 AND friendship_level <= 100),
    romance_level INTEGER NOT NULL DEFAULT 0 CHECK (romance_level >= 0 AND romance_level <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, character_id)
);

-- Player state table
CREATE TABLE player_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_location_id UUID REFERENCES scenes(id),
    active_dialogue_id UUID REFERENCES dialogue_trees(id),
    current_node_id VARCHAR(100),
    flags JSONB DEFAULT '{}',
    inventory TEXT[] DEFAULT '{}',
    discovered_locations UUID[] DEFAULT '{}',
    completed_dialogues UUID[] DEFAULT '{}',
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dialogue state tracking per player
CREATE TABLE player_dialogue_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dialogue_tree_id UUID NOT NULL REFERENCES dialogue_trees(id) ON DELETE CASCADE,
    current_node_id VARCHAR(100) NOT NULL,
    choices_made JSONB DEFAULT '[]',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, dialogue_tree_id)
);

-- Bank transactions table
CREATE TABLE bank_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('debit', 'credit', 'transfer')),
    amount INTEGER NOT NULL,
    description VARCHAR(200) NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Player SMS threads table (for phone messages)
CREATE TABLE player_sms_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_id VARCHAR(100) NOT NULL,
    messages JSONB NOT NULL DEFAULT '[]',
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, thread_id)
);

-- Public profiles table
CREATE TABLE public_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cosmetics JSONB DEFAULT '{}',
    badges JSONB DEFAULT '{}',
    display_settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration log table
CREATE TABLE migration_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_path VARCHAR(500) NOT NULL,
    file_checksum VARCHAR(64) NOT NULL,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('character', 'dialogue', 'overlay', 'scene', 'gig', 'vault')),
    content_id UUID NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_by UUID REFERENCES users(id)
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_current_node ON users(current_node_id);
CREATE INDEX idx_users_current_location ON users(current_location_id);
CREATE INDEX idx_users_current_day ON users(current_day);
CREATE INDEX idx_user_entitlements_user_id ON user_entitlements(user_id);
CREATE INDEX idx_time_blocks_user_id ON time_blocks(user_id);
CREATE INDEX idx_dialogue_trees_name ON dialogue_trees(name);
CREATE INDEX idx_dialogue_overlays_target_tree_id ON dialogue_overlays(target_tree_id);
CREATE INDEX idx_scenes_district ON scenes(district);
CREATE INDEX idx_scenes_mood ON scenes(mood);
CREATE INDEX idx_player_states_user_id ON player_states(user_id);
CREATE INDEX idx_player_states_location_id ON player_states(current_location_id);
CREATE INDEX idx_player_sms_threads_user_id ON player_sms_threads(user_id);
CREATE INDEX idx_public_profiles_user_id ON public_profiles(user_id);
CREATE INDEX idx_migration_log_file_path ON migration_log(file_path);
CREATE INDEX idx_migration_log_checksum ON migration_log(file_checksum);
CREATE INDEX idx_scene_characters_scene_id ON scene_characters(scene_id);
CREATE INDEX idx_scene_characters_character_id ON scene_characters(character_id);
CREATE INDEX idx_scene_characters_is_permanent ON scene_characters(is_permanent);
CREATE INDEX idx_player_dialogue_states_user_id ON player_dialogue_states(user_id);
CREATE INDEX idx_player_dialogue_states_dialogue_tree_id ON player_dialogue_states(dialogue_tree_id);
CREATE INDEX idx_user_relationships_user_id ON user_relationships(user_id);
CREATE INDEX idx_user_relationships_character_id ON user_relationships(character_id);
CREATE INDEX idx_user_relationships_user_character ON user_relationships(user_id, character_id);
CREATE INDEX idx_bank_transactions_user_id ON bank_transactions(user_id);
CREATE INDEX idx_bank_transactions_created_at ON bank_transactions(created_at);
CREATE INDEX idx_bank_transactions_user_created ON bank_transactions(user_id, created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers (DROP IF EXISTS for idempotency)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_user_entitlements_updated_at ON user_entitlements;
CREATE TRIGGER update_user_entitlements_updated_at BEFORE UPDATE ON user_entitlements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_time_blocks_updated_at ON time_blocks;
CREATE TRIGGER update_time_blocks_updated_at BEFORE UPDATE ON time_blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_characters_updated_at ON characters;
CREATE TRIGGER update_characters_updated_at BEFORE UPDATE ON characters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_dialogue_trees_updated_at ON dialogue_trees;
CREATE TRIGGER update_dialogue_trees_updated_at BEFORE UPDATE ON dialogue_trees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_dialogue_overlays_updated_at ON dialogue_overlays;
CREATE TRIGGER update_dialogue_overlays_updated_at BEFORE UPDATE ON dialogue_overlays FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_scenes_updated_at ON scenes;
CREATE TRIGGER update_scenes_updated_at BEFORE UPDATE ON scenes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_player_states_updated_at ON player_states;
CREATE TRIGGER update_player_states_updated_at BEFORE UPDATE ON player_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_player_sms_threads_updated_at ON player_sms_threads;
CREATE TRIGGER update_player_sms_threads_updated_at BEFORE UPDATE ON player_sms_threads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_public_profiles_updated_at ON public_profiles;
CREATE TRIGGER update_public_profiles_updated_at BEFORE UPDATE ON public_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_scene_characters_updated_at ON scene_characters;
CREATE TRIGGER update_scene_characters_updated_at BEFORE UPDATE ON scene_characters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_user_relationships_updated_at ON user_relationships;
CREATE TRIGGER update_user_relationships_updated_at BEFORE UPDATE ON user_relationships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_player_dialogue_states_updated_at ON player_dialogue_states;
CREATE TRIGGER update_player_dialogue_states_updated_at BEFORE UPDATE ON player_dialogue_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
