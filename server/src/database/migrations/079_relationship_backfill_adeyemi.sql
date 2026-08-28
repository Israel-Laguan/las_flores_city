-- M49 backfill: copy legacy per-character stats from player_states.stats
-- into the canonical user_relationships columns for Adeyemi Ogunbiyi.
--
-- Maps: adeyemi_trust→trust, adeyemi_familiarity→familiarity,
--       adeyemi_tension→tension, adeyemi_alignment→alignment,
--       adeyemi_visibility→visibility
-- Romance/friendship not present in legacy sofia_trust writes; left at defaults.
--
-- Idempotent: ON CONFLICT DO UPDATE only refreshes updated_at, preserving
-- existing saves — a player who already earned canonical values via
-- relationship_effect writes keeps them.

BEGIN;

INSERT INTO user_relationships (
  user_id, character_id,
  trust, familiarity, alignment, tension, visibility,
  status, updated_at
)
SELECT
  ps.user_id,
  'a0000001-0000-4000-8000-000000000003'::uuid,
  GREATEST(-100, LEAST(100, COALESCE(
    CASE WHEN ps.stats ->> 'adeyemi_trust' ~ '^-?[0-9]+$' THEN (ps.stats ->> 'adeyemi_trust')::int END, 0
  ))),
  GREATEST(0, LEAST(100, COALESCE(
    CASE WHEN ps.stats ->> 'adeyemi_familiarity' ~ '^-?[0-9]+$' THEN (ps.stats ->> 'adeyemi_familiarity')::int END, 0
  ))),
  GREATEST(-100, LEAST(100, COALESCE(
    CASE WHEN ps.stats ->> 'adeyemi_alignment' ~ '^-?[0-9]+$' THEN (ps.stats ->> 'adeyemi_alignment')::int END, 0
  ))),
  GREATEST(0, LEAST(100, COALESCE(
    CASE WHEN ps.stats ->> 'adeyemi_tension' ~ '^-?[0-9]+$' THEN (ps.stats ->> 'adeyemi_tension')::int END, 0
  ))),
  GREATEST(0, LEAST(100, COALESCE(
    CASE WHEN ps.stats ->> 'adeyemi_visibility' ~ '^-?[0-9]+$' THEN (ps.stats ->> 'adeyemi_visibility')::int END, 0
  ))),
  'STRANGER',
  NOW()
FROM player_states ps
WHERE ps.stats ?| array['adeyemi_trust', 'adeyemi_familiarity', 'adeyemi_alignment', 'adeyemi_tension', 'adeyemi_visibility']
ON CONFLICT (user_id, character_id) DO UPDATE
  SET updated_at = NOW();

COMMIT;
