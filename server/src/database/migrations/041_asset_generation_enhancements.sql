BEGIN;

-- Enhance asset_bases with full generation metadata
ALTER TABLE asset_bases ADD COLUMN IF NOT EXISTS asset_type TEXT;
ALTER TABLE asset_bases ADD COLUMN IF NOT EXISTS prompt_text TEXT;
ALTER TABLE asset_bases ADD COLUMN IF NOT EXISTS negative_prompt TEXT;
ALTER TABLE asset_bases ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE asset_bases ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE asset_bases ADD COLUMN IF NOT EXISTS final_path TEXT;

-- Enhance asset_variants with full generation metadata
ALTER TABLE asset_variants ADD COLUMN IF NOT EXISTS prompt_text TEXT;
ALTER TABLE asset_variants ADD COLUMN IF NOT EXISTS negative_prompt TEXT;
ALTER TABLE asset_variants ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE asset_variants ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE asset_variants ADD COLUMN IF NOT EXISTS final_path TEXT;

-- Add index for final_path lookups
CREATE INDEX IF NOT EXISTS idx_asset_bases_final_path ON asset_bases(final_path) WHERE final_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_variants_final_path ON asset_variants(final_path) WHERE final_path IS NOT NULL;

COMMIT;