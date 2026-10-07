-- M103: Add rich description fields to characters table.
-- This migration adds fields for enhanced character depth:
--   - physical_description: detailed physical appearance
--   - psychological_description: personality and mental traits
--   - background_and_role: array of background info and roles
--   - birth_year: character's birth year for age calculation
--
-- These fields align with CharacterSchema in shared/src/schemas/character.ts
-- and YAMLCharacterSchema in shared/src/schemas/yaml-content.ts.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS physical_description TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS psychological_description TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS background_and_role TEXT[];
ALTER TABLE characters ADD COLUMN IF NOT EXISTS birth_year INTEGER;

-- Index for efficient querying on birth_year (e.g., age-based filtering)
CREATE INDEX IF NOT EXISTS idx_characters_birth_year ON characters (birth_year) WHERE birth_year IS NOT NULL;

-- GIN index for array-based queries on background_and_role
CREATE INDEX IF NOT EXISTS idx_characters_background_and_role ON characters USING GIN(background_and_role);
