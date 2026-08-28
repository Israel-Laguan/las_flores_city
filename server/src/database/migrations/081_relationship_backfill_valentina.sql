-- M49 backfill: copy legacy per-character stats from player_states.stats
-- into the canonical user_relationships columns for Valentina Reyes.
--
-- Maps: valentina_relationship→friendship_level (Phase 1 decision: overall
--       affinity meter → friendship axis, same sign/magnitude; negative values
--       clamp to 0 since friendship_level CHECK is >= 0).
--
-- Idempotent: ON CONFLICT DO UPDATE only refreshes updated_at, preserving
-- existing saves — a player who already earned canonical friendship via
-- relationship_effect writes keeps it.

BEGIN;

INSERT INTO user_relationships (
  user_id, character_id, friendship_level, status, updated_at
)
SELECT
  ps.user_id,
  'c51348ce-c575-4895-b17b-811af6869903'::uuid,
  GREATEST(0, LEAST(100, COALESCE(
    CASE WHEN ps.stats ->> 'valentina_relationship' ~ '^-?[0-9]+$' THEN (ps.stats ->> 'valentina_relationship')::int END, 0
  ))),
  'STRANGER',
  NOW()
FROM player_states ps
WHERE ps.stats ? 'valentina_relationship'
ON CONFLICT (user_id, character_id) DO UPDATE
  SET updated_at = NOW();

COMMIT;
