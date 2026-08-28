-- M49 backfill: copy the legacy generic per-character relationship stat
-- (aisha_relationship) into the canonical user_relationships.trust axis.
--
-- Maps: aisha_relationship -> trust.
--
-- Aisha's legacy timer is a generic <prefix>_relationship meter, which the
-- conversion PROMPT defaults to `friendship`. However the manual audit
-- confirmed this character's meter is a trust-flavored affinity (rejection
-- -5, farewell +5) and the tree speaks through the canonical `trust` axis,
-- so it backfills into `trust`, not `friendship`.
--
-- Idempotent: ON CONFLICT DO UPDATE only refreshes updated_at, preserving
-- any canonical trust a player already earned via relationship_effect writes.

BEGIN;

INSERT INTO user_relationships (user_id, character_id, trust, status, updated_at)
SELECT
  ps.user_id,
  'c1000013-e29b-41d4-a716-446655440013'::uuid,
  GREATEST(-100, LEAST(100, COALESCE(
    CASE WHEN ps.stats ->> 'aisha_relationship' ~ '^-?[0-9]+$' THEN (ps.stats ->> 'aisha_relationship')::int END, 0
  ))),
  'STRANGER',
  NOW()
FROM player_states ps
WHERE ps.stats ? 'aisha_relationship'
ON CONFLICT (user_id, character_id) DO UPDATE
  SET updated_at = NOW();

COMMIT;