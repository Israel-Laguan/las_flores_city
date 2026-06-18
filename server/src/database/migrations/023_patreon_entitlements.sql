BEGIN;

-- Add Patreon OAuth fields to user_entitlements.
-- is_nsfw_unlocked and patreon_tier already exist from migration 001.
ALTER TABLE user_entitlements
  ADD COLUMN IF NOT EXISTS patreon_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS patreon_access_token TEXT,
  ADD COLUMN IF NOT EXISTS patreon_refresh_token TEXT;

-- Unique index on patreon_id (skip rows with NULL to avoid multiple-NULL violations)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_entitlements_patreon_id
  ON user_entitlements (patreon_id)
  WHERE patreon_id IS NOT NULL;

COMMIT;
