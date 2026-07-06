-- Las Flores 2077 - Stories content type
-- A story groups a mission with all its associated content (characters,
-- scenes, dialogues, overlays, vault items) into a single manifest.
-- Also renames 'mystery' to 'mission' in migration_log CHECK constraint.

CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  mission_id UUID REFERENCES mysteries(id) ON DELETE SET NULL,
  characters UUID[] DEFAULT '{}',
  scenes UUID[] DEFAULT '{}',
  dialogues UUID[] DEFAULT '{}',
  overlays UUID[] DEFAULT '{}',
  vault_items UUID[] DEFAULT '{}',
  written_by VARCHAR(255),
  lore_ref VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_mission_id ON stories(mission_id);

-- Update migration_log.content_type CHECK to use 'mission' and add 'story'
-- First, migrate existing 'mystery' rows to 'mission' before tightening the constraint
UPDATE migration_log SET content_type = 'mission' WHERE content_type = 'mystery';

ALTER TABLE migration_log
    DROP CONSTRAINT IF EXISTS migration_log_content_type_check;

ALTER TABLE migration_log
    ADD CONSTRAINT migration_log_content_type_check
    CHECK (content_type IN (
        'character',
        'dialogue',
        'overlay',
        'scene',
        'gig',
        'vault',
        'mission',
        'story',
        'shop_item',
        'location',
        'map_tile',
        'story_beat'
    ));
