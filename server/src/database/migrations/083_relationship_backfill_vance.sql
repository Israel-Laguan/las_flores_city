-- M49 backfill: create a canonical user_relationships row for Vance Nakamura
-- from a mega-plot-generated final_alignment on existing saves.
--
-- Vance's legacy content stored NO numeric relationship stat — it holds only
-- `player_states.state.final_alignment` ('loyalist' | 'fugitive') plus the
-- `users.alignment` faction. The finale used to be a pure meta switch; starting
-- in M49 the endings additionally write a canonical `alignment` delta + a small
-- romance bond. This backfill seeds those rows so a player who already resolved
-- a prior finale keeps a sensible canonical axis on re-engagement.
--
-- Maps: final_alignment 'loyalist' -> alignment 10, 'fugitive' -> alignment -10.
-- Mirrors the resolved flag into user_relationships.flags (merged on conflict).

BEGIN;

INSERT INTO user_relationships (user_id, character_id, alignment, status, flags, updated_at)
SELECT
  ps.user_id,
  '3b2b8000-e29b-41d4-a716-446655440001'::uuid,
  CASE ps.state ->> 'final_alignment'
    WHEN 'loyalist' THEN 10
    WHEN 'fugitive' THEN -10
    ELSE 0
  END,
  'STRANGER',
  CASE
    WHEN ps.state ? 'final_alignment'
    THEN jsonb_build_object('final_alignment', ps.state ->> 'final_alignment')
    ELSE '{}'::jsonb
  END,
  NOW()
FROM player_states ps
WHERE ps.state ? 'final_alignment'
ON CONFLICT (user_id, character_id) DO UPDATE
  SET flags = user_relationships.flags || EXCLUDED.flags,
      updated_at = NOW();

COMMIT;