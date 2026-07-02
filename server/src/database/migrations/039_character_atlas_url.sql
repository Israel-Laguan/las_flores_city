-- Las Flores 2077 - Character Atlas URL
-- Adds atlas_url TEXT column to characters table for sprite atlas support

BEGIN;

-- ============================================================
-- 1. Add atlas_url column to characters
-- ============================================================

ALTER TABLE characters ADD COLUMN IF NOT EXISTS atlas_url TEXT;

-- ============================================================
-- 2. Index for potential future queries on atlas data
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_characters_atlas_url ON characters(atlas_url) WHERE atlas_url IS NOT NULL;

COMMIT;