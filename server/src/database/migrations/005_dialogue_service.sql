-- Las Flores 2077 - Dialogue Service Schema (Task 1.3)
-- Adds relationship upsert function, active_dialogue_id to users

BEGIN;

-- ============================================================
-- Add active_dialogue_id to users for quick "in conversation" check
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_dialogue_id UUID REFERENCES dialogue_trees(id);

CREATE INDEX IF NOT EXISTS idx_users_active_dialogue ON users(active_dialogue_id);

-- ============================================================
-- Atomic relationship update function
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_user_relationship(
  p_user_id UUID,
  p_character_id UUID,
  p_friendship_delta INTEGER DEFAULT 0,
  p_romance_delta INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_relationships (user_id, character_id, friendship_level, romance_level)
  VALUES (
    p_user_id,
    p_character_id,
    GREATEST(0, LEAST(100, p_friendship_delta)),
    GREATEST(0, LEAST(100, p_romance_delta))
  )
  ON CONFLICT (user_id, character_id) DO UPDATE SET
    friendship_level = GREATEST(0, LEAST(100,
      user_relationships.friendship_level + EXCLUDED.friendship_level
    )),
    romance_level = GREATEST(0, LEAST(100,
      user_relationships.romance_level + EXCLUDED.romance_level
    )),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Seed: link dialogues to scenes
-- ============================================================

-- Welcome dialogue available at Welcome Center
UPDATE scenes SET available_dialogues = ARRAY['550e8400-e29b-41d4-a716-446655440003']::uuid[]
WHERE id = '550e8400-e29b-41d4-a716-446655440002';

-- Barista dialogue available at Old Town Cafe
UPDATE scenes SET available_dialogues = ARRAY['f6a7b8c9-d0e1-2345-fabc-456789012345']::uuid[]
WHERE id = 'e5f6a7b8-c9d0-1234-efab-345678901234';

COMMIT;
