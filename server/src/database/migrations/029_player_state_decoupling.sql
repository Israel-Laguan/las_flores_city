-- Las Flores 2077 - Player State Decoupling
-- Moves all volatile gameplay state from users into player_states.
-- Pre-production hard reset: no backward-compatible shims.

BEGIN;

-- 1. Add missing volatile columns to player_states (the new authoritative home)
ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS time_blocks INTEGER NOT NULL DEFAULT 48
    CHECK (time_blocks >= 0 AND time_blocks <= 48),
  ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  ADD COLUMN IF NOT EXISTS gold_credits INTEGER NOT NULL DEFAULT 0 CHECK (gold_credits >= 0),
  ADD COLUMN IF NOT EXISTS current_day INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS story_beat VARCHAR(100) NOT NULL DEFAULT 'prologue',
  ADD COLUMN IF NOT EXISTS alignment VARCHAR(20) NOT NULL DEFAULT 'neutral'
    CHECK (alignment IN ('neutral','loyalist','fugitive'));

-- 2. Backfill: copy current values from users -> player_states (idempotent)
--    COALESCE keeps the player_states copy when one was already written by
--    dev-login, else falls back to the users value.
UPDATE player_states ps
SET time_blocks           = u.time_blocks,
    credits               = u.credits,
    gold_credits          = u.gold_credits,
    current_day           = u.current_day,
    alignment             = COALESCE(u.alignment, 'neutral'),
    current_node_id       = COALESCE(ps.current_node_id, u.current_node_id),
    active_dialogue_id    = COALESCE(ps.active_dialogue_id, u.active_dialogue_id),
    current_location_id   = COALESCE(ps.current_location_id, u.current_location_id)
FROM users u
WHERE ps.user_id = u.id;

-- 3. Ensure every user has a player_states row (defensive, for legacy users)
INSERT INTO player_states (user_id, current_location_id)
SELECT u.id, u.current_location_id
FROM users u
LEFT JOIN player_states ps ON ps.user_id = u.id
WHERE ps.user_id IS NULL;

-- 4. Drop volatile columns + their now-pointless indexes from users
DROP INDEX IF EXISTS idx_users_current_node;
DROP INDEX IF EXISTS idx_users_current_location;
DROP INDEX IF EXISTS idx_users_current_day;

ALTER TABLE users
  DROP COLUMN IF EXISTS time_blocks,
  DROP COLUMN IF EXISTS credits,
  DROP COLUMN IF EXISTS gold_credits,
  DROP COLUMN IF EXISTS current_node_id,
  DROP COLUMN IF EXISTS active_dialogue_id,
  DROP COLUMN IF EXISTS current_location_id,
  DROP COLUMN IF EXISTS current_day,
  DROP COLUMN IF EXISTS alignment;

COMMIT;
