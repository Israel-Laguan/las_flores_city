-- M49 backfill: copy legacy per-character stats from player_states.stats
-- into the canonical user_relationships columns for Sofia Mendoza.
--
-- Maps: sofia_trust→trust
-- Keeps: sofia_status as a player flag in user_relationships.flags JSONB
--
-- Idempotent: ON CONFLICT DO UPDATE only refreshes updated_at + flags,
-- preserving existing trust values — a player who already earned canonical
-- trust via relationship_effect writes keeps it. Flags are merged so the
-- legacy narrative state machine (alive/dead/romanced/disillusioned) survives.

BEGIN;

INSERT INTO user_relationships (
  user_id, character_id,
  trust, status, flags, updated_at
)
SELECT
  ps.user_id,
  'c3d4e5f6-a7b8-4012-8def-123456789012'::uuid,
  GREATEST(-100, LEAST(100, COALESCE(
    CASE WHEN ps.stats ->> 'sofia_trust' ~ '^-?[0-9]+$' THEN (ps.stats ->> 'sofia_trust')::int END, 0
  ))),
  'STRANGER',
  CASE
    WHEN ps.stats ? 'sofia_status'
    THEN jsonb_set('{}'::jsonb, '{sofia_status}', to_jsonb(ps.stats ->> 'sofia_status'))
    ELSE '{}'::jsonb
  END,
  NOW()
FROM player_states ps
WHERE ps.stats ?| array['sofia_trust', 'sofia_status']
ON CONFLICT (user_id, character_id) DO UPDATE
  SET flags = user_relationships.flags || EXCLUDED.flags,
      updated_at = NOW();

COMMIT;
