-- ============================================================
-- 093_add_pinned_tree_revision.sql
--
-- Adds a player-pinned revision tracker to player_dialogue_states.
-- Set at tree activation (when a player starts/dialects a tree),
-- reflecting the dialogue_trees.revision value of the active tree.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS makes re-runs safe.
-- Default 0 means "no revision pinned yet".
-- ============================================================

ALTER TABLE player_dialogue_states ADD COLUMN IF NOT EXISTS pinned_tree_revision INTEGER NOT NULL DEFAULT 0;

-- Backfill for any active dialogues at the time this column is added.
-- Without this, players who started before 093 would have pinned=0 (the default)
-- even if their tree's revision was already >0; on next boundary cross they would
-- fall through to the *current* tree revision instead of the one pinned at their
-- activation. We snapshot only the currently-active ones (joined via
-- player_states.active_dialogue_id, which owns this column post-029) so
-- historical finished-dialogue rows keep 0 and will be (re)pinned on their
-- next /dialogue/start.
UPDATE player_dialogue_states pds
   SET pinned_tree_revision = COALESCE(dt.revision, 0)
  FROM player_states ps
  JOIN dialogue_trees dt ON dt.id = ps.active_dialogue_id
 WHERE pds.user_id = ps.user_id
   AND pds.dialogue_tree_id = ps.active_dialogue_id
   AND pds.pinned_tree_revision = 0;

COMMENT ON COLUMN player_dialogue_states.pinned_tree_revision IS
  'Player-pinned revision of the active dialogue tree. Set at tree '
  'activation (e.g. /dialogue/start) to the current '
  'dialogue_trees.revision value. Used to scope chunk lookups to the '
  'correct tree revision. 0 means not yet pinned (use latest on next start).';