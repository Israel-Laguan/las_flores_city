-- Las Flores 2077 - Character Portrait URLs
-- Adds portrait_urls JSONB column to characters table for multi-expression portrait support

BEGIN;

-- ============================================================
-- 1. Add portrait_urls column to characters
-- ============================================================

ALTER TABLE characters ADD COLUMN IF NOT EXISTS portrait_urls JSONB DEFAULT '[]';

-- ============================================================
-- 2. Index for potential future queries on portrait data
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_characters_portrait_urls ON characters USING gin(portrait_urls);

COMMIT;