-- Las Flores 2077 - Player State Schema Changes
-- Adds missing columns for player state tracking

BEGIN;

-- ============================================================
-- 1.1.1a: The users Table - add missing columns if not exist
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_node_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gold_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS time_blocks INTEGER NOT NULL DEFAULT 48 CHECK (time_blocks >= 0 AND time_blocks <= 48);

-- ============================================================
-- 1.1.1b: Migration Script - indexes for new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_current_node ON users(current_node_id);
CREATE INDEX IF NOT EXISTS idx_users_current_location ON users(current_location_id);

COMMIT;
