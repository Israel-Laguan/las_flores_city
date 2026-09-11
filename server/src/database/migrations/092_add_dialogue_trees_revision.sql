-- ============================================================
-- 092_add_dialogue_trees_revision.sql
--
-- Adds a monotonic revision counter to dialogue_trees.
-- bumped ONLY on chunk recompile in server/src/content/compiler.ts
-- (following migration 089's monotonicity rule: bump on exactly the
-- events claimed, never on unrelated column touches).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS makes re-runs safe.
-- Default 0 means "initial revision" for existing trees.
-- ============================================================

ALTER TABLE dialogue_trees ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN dialogue_trees.revision IS
  'Monotonic revision counter, bumped +1 by compileDialogueTree() on every chunk recompile. '
  'Used to scope chunk lookups to the player\'s active tree revision. '
  'Never bumped on unrelated column touches (status, metadata, etc.).';