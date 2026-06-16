-- Las Flores 2077 - Add user_relationships table
-- This table tracks friendship and romance levels between users and characters

BEGIN;

-- User relationships table
CREATE TABLE IF NOT EXISTS user_relationships (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
    friendship_level INTEGER DEFAULT 0,
    romance_level INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, character_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_relationships_user_id ON user_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_character_id ON user_relationships(character_id);

-- Apply updated_at trigger
CREATE TRIGGER update_user_relationships_updated_at 
    BEFORE UPDATE ON user_relationships 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;