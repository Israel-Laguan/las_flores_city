-- Las Flores 2077 - Add user_relationships table if not exists
-- This table tracks friendship and romance levels between users and characters

BEGIN;

-- User relationships table - only create if not exists
CREATE TABLE IF NOT EXISTS user_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    friendship_level INTEGER NOT NULL DEFAULT 0 CHECK (friendship_level >= 0 AND friendship_level <= 100),
    romance_level INTEGER NOT NULL DEFAULT 0 CHECK (romance_level >= 0 AND romance_level <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, character_id)
);

-- Create indexes - only if not exists
CREATE INDEX IF NOT EXISTS idx_user_relationships_user_id ON user_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_character_id ON user_relationships(character_id);

-- Trigger is already created in 001_initial_schema.sql, no need to recreate

COMMIT;
