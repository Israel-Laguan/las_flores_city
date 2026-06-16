-- Triggers
-- ============================================================

CREATE TRIGGER IF NOT EXISTS update_user_relationships_updated_at BEFORE UPDATE ON user_relationships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
=======
-- ============================================================
-- Triggers (already created in 001_initial_schema.sql)
-- ============================================================

-- ============================================================Las Flores 2077 - Scene Payload Schema (Task 1.2)
-- Adds background_url, ambient_sound_url, mood to scenes if not exist
-- Adds is_permanent, default_mood to scene_characters if not exist

BEGIN;

-- ============================================================
-- 1.2.1a: Enhance scenes table with environmental data
-- ============================================================

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS background_url VARCHAR(500);
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS ambient_sound_url VARCHAR(500);
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS mood VARCHAR(50);

-- ============================================================
-- 1.2.1b: Enhance scene_characters with presence metadata
-- ============================================================

ALTER TABLE scene_characters ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE scene_characters ADD COLUMN IF NOT EXISTS default_mood VARCHAR(50) NOT NULL DEFAULT 'neutral';

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_scenes_mood ON scenes(mood);
CREATE INDEX IF NOT EXISTS idx_scene_characters_is_permanent ON scene_characters(is_permanent);
CREATE INDEX IF NOT EXISTS idx_user_relationships_user_id ON user_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_character_id ON user_relationships(character_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_user_character ON user_relationships(user_id, character_id);

-- ============================================================
-- Triggers
-- ============================================================

CREATE TRIGGER IF NOT EXISTS update_user_relationships_updated_at BEFORE UPDATE ON user_relationships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Seed default scene environmental data
-- ============================================================

UPDATE scenes SET
    background_url = '/assets/scenes/apartment/background.png',
    ambient_sound_url = '/assets/scenes/apartment/ambient.mp3',
    mood = 'tense'
WHERE id = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

UPDATE scenes SET
    background_url = '/assets/scenes/welcome_center/background.png',
    ambient_sound_url = NULL,
    mood = 'neutral'
WHERE id = '550e8400-e29b-41d4-a716-446655440002';

UPDATE scenes SET
    background_url = '/assets/scenes/old_town_cafe/background.png',
    ambient_sound_url = '/assets/scenes/old_town_cafe/ambient.mp3',
    mood = 'cozy'
WHERE id = 'e5f6a7b8-c9d0-1234-efab-345678901234';

-- ============================================================
-- Seed default scene_characters metadata
-- ============================================================

UPDATE scene_characters SET is_permanent = TRUE, default_mood = 'neutral'
WHERE scene_id = 'c3d4e5f6-a7b8-9012-cdef-123456789012'
  AND character_id = '550e8400-e29b-41d4-a716-446655440004';

UPDATE scene_characters SET is_permanent = TRUE, default_mood = 'neutral'
WHERE scene_id = 'e5f6a7b8-c9d0-1234-efab-345678901234'
  AND character_id = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

UPDATE scene_characters SET is_permanent = TRUE, default_mood = 'neutral'
WHERE scene_id = '550e8400-e29b-41d4-a716-446655440002'
  AND character_id = '550e8400-e29b-41d4-a716-446655440001';

-- ============================================================
-- Seed test relationships for the dev user
-- ============================================================

INSERT INTO user_relationships (user_id, character_id, friendship_level, romance_level)
VALUES ('00000000-0000-0000-0000-000000000001', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 15, 0)
ON CONFLICT (user_id, character_id) DO NOTHING;

INSERT INTO user_relationships (user_id, character_id, friendship_level, romance_level)
VALUES ('00000000-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440004', 5, 0)
ON CONFLICT (user_id, character_id) DO NOTHING;

INSERT INTO user_relationships (user_id, character_id, friendship_level, romance_level)
VALUES ('00000000-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440001', 10, 0)
ON CONFLICT (user_id, character_id) DO NOTHING;

COMMIT;
