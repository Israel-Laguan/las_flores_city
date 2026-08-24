-- Canonical player-character social relationship state.
-- Existing friendship/romance values remain API compatibility fields.
BEGIN;

ALTER TABLE user_relationships
  ADD COLUMN IF NOT EXISTS trust INTEGER NOT NULL DEFAULT 0 CHECK (trust BETWEEN -100 AND 100),
  ADD COLUMN IF NOT EXISTS familiarity INTEGER NOT NULL DEFAULT 0 CHECK (familiarity BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS alignment INTEGER NOT NULL DEFAULT 0 CHECK (alignment BETWEEN -100 AND 100),
  ADD COLUMN IF NOT EXISTS tension INTEGER NOT NULL DEFAULT 0 CHECK (tension BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS debt INTEGER NOT NULL DEFAULT 0 CHECK (debt BETWEEN -100 AND 100),
  ADD COLUMN IF NOT EXISTS visibility INTEGER NOT NULL DEFAULT 0 CHECK (visibility BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS bond_level INTEGER NOT NULL DEFAULT 0 CHECK (bond_level BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS daily_vibe INTEGER NOT NULL DEFAULT 0 CHECK (daily_vibe BETWEEN -100 AND 100),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'STRANGER'
    CHECK (status IN ('STRANGER', 'ACQUAINTANCE', 'CONFIDANT', 'ROMANTIC', 'PARTNER', 'DISTANCED', 'ENDED')),
  ADD COLUMN IF NOT EXISTS last_interaction_day INTEGER,
  ADD COLUMN IF NOT EXISTS last_decay_day INTEGER,
  ADD COLUMN IF NOT EXISTS last_milestone_day INTEGER,
  ADD COLUMN IF NOT EXISTS memory JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS flags JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_user_relationships_decay
  ON user_relationships (last_interaction_day, last_decay_day)
  WHERE status NOT IN ('ENDED');

-- Keep the legacy four-argument API, but make it update the canonical fields.
CREATE OR REPLACE FUNCTION upsert_user_relationship(
  p_user_id UUID,
  p_character_id UUID,
  p_friendship_delta INTEGER DEFAULT 0,
  p_romance_delta INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_relationships (
    user_id, character_id, friendship_level, romance_level,
    familiarity, visibility, trust, tension, bond_level,
    last_interaction_day
  )
  SELECT p_user_id, p_character_id,
    GREATEST(0, LEAST(100, p_friendship_delta)),
    GREATEST(0, LEAST(100, p_romance_delta)),
    GREATEST(0, LEAST(100, p_friendship_delta)),
    GREATEST(0, LEAST(100, p_friendship_delta + p_romance_delta)),
    GREATEST(-100, LEAST(100, p_friendship_delta / 2)),
    GREATEST(0, LEAST(100, p_romance_delta / 2)),
    GREATEST(0, LEAST(100, p_friendship_delta + p_romance_delta)),
    ps.current_day
  FROM player_states ps WHERE ps.user_id = p_user_id
  ON CONFLICT (user_id, character_id) DO UPDATE SET
    friendship_level = GREATEST(0, LEAST(100, user_relationships.friendship_level + EXCLUDED.friendship_level)),
    romance_level = GREATEST(0, LEAST(100, user_relationships.romance_level + EXCLUDED.romance_level)),
    familiarity = GREATEST(0, LEAST(100, user_relationships.familiarity + EXCLUDED.familiarity)),
    visibility = GREATEST(0, LEAST(100, user_relationships.visibility + EXCLUDED.visibility)),
    trust = GREATEST(-100, LEAST(100, user_relationships.trust + EXCLUDED.trust)),
    tension = GREATEST(0, LEAST(100, user_relationships.tension + EXCLUDED.tension)),
    bond_level = GREATEST(0, LEAST(100, user_relationships.bond_level + EXCLUDED.bond_level)),
    last_interaction_day = EXCLUDED.last_interaction_day,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

UPDATE user_relationships
SET bond_level = GREATEST(friendship_level, romance_level),
    familiarity = friendship_level,
    visibility = GREATEST(friendship_level, romance_level),
    status = CASE
      WHEN romance_level >= 75 THEN 'PARTNER'
      WHEN romance_level > 0 THEN 'ROMANTIC'
      WHEN friendship_level >= 50 THEN 'CONFIDANT'
      WHEN friendship_level > 0 THEN 'ACQUAINTANCE'
      ELSE 'STRANGER'
    END
WHERE bond_level = 0
  AND familiarity = 0
  AND visibility = 0
  AND status = 'STRANGER';

COMMIT;
