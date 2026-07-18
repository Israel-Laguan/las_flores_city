-- Las Flores 2077 - Scene/Location Asset Cascade (Milestone 07)
-- Adds JSONB arrays for env-aware asset resolution on scenes/locations.

BEGIN;

-- Scenes: cascade array for the background image.
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS background_urls JSONB;

-- Scenes: cascade array for the location image.
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS image_urls JSONB;

COMMIT;
