-- ============================================================
-- 057_dialogue_ownership.sql
--
-- Adds formal ownership links to dialogue_trees:
--   character_id — which character owns this dialogue (nullable)
--   scene_id — which scene this dialogue is tied to (nullable)
--   mission_id — which mystery/mission this dialogue serves (nullable)
--   dialogue_scope — enumerates the dialogue's purpose/taxonomy
--
-- Also adds available_dialogues to characters for reverse lookup.
-- Idempotent: safe to re-run.
-- ============================================================

BEGIN;

-- Add ownership and scope columns to dialogue_trees
ALTER TABLE dialogue_trees
  ADD COLUMN IF NOT EXISTS character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES mysteries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dialogue_scope VARCHAR(30) DEFAULT 'character'
    CHECK (dialogue_scope IN ('character', 'scene', 'mission', 'onboarding', 'system'));

-- Add available_dialogues to characters for reverse lookup
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS available_dialogues UUID[] DEFAULT '{}';

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_dialogue_trees_character_id ON dialogue_trees(character_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_trees_scene_id ON dialogue_trees(scene_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_trees_mission_id ON dialogue_trees(mission_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_trees_scope ON dialogue_trees(dialogue_scope);
CREATE INDEX IF NOT EXISTS idx_characters_available_dialogues ON characters USING GIN (available_dialogues);

-- Add updated_at trigger for dialogue_trees (in case it was missed)
DROP TRIGGER IF EXISTS update_dialogue_trees_updated_at ON dialogue_trees;
CREATE TRIGGER update_dialogue_trees_updated_at BEFORE UPDATE ON dialogue_trees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;