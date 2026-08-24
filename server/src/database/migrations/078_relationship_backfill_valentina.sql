-- M48 backfill: copy legacy player-state `vq_trust` into Valentina's
-- canonical `user_relationships.trust` axis for existing saves.
--
-- Romance / friendship levels were already populated by the legacy
-- `upsert_user_relationship` calls, so we leave those untouched.
-- Idempotent: ON CONFLICT DO UPDATE re-syncs trust on re-run.
-- Preserves existing saves — a player who already earned Valentina
-- trust via the old `stat_set: { vq_trust }` path keeps it.

INSERT INTO user_relationships (user_id, character_id, trust, status, updated_at)
SELECT
  user_id,
  '670eea6f-3983-4d5a-8195-b08be6c81661'::uuid,
  GREATEST(-100, LEAST(100, COALESCE((stats ->> 'vq_trust')::int, 0))),
  'STRANGER',
  NOW()
FROM player_states
WHERE stats ? 'vq_trust'
ON CONFLICT (user_id, character_id) DO UPDATE
  SET trust = EXCLUDED.trust,
      updated_at = NOW();
