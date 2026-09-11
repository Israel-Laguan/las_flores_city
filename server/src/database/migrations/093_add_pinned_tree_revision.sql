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

ALTER TABLE player_dialogue_states ADD COLUMN IF NOT EXISTS pinned_tree_revision INTEGER DEFAULT 0;

COMMENT ON COLUMN player_dialogue_states.pinned_tree_revision IS
  'Player-pinned revision of the active dialogue tree. Set at tree '
  'activation (e.g. /dialogue/start) to the current '
  'dialogue_trees.revision value. Used to scope chunk lookups to the '
  'correct tree revision.';