BEGIN;

-- ============================================================
-- 094_add_dialogue_chunks_revision.sql
--
-- Adds revision column to dialogue_chunks so that chunks can be
-- retained across recompiles. Each compile of a tree now records
-- a new revision's chunks (no DELETE of prior revisions).
--
-- The previous UNIQUE(tree_id, chunk_key) is replaced with
-- UNIQUE(tree_id, chunk_key, revision) to allow historical
-- revisions to coexist for players pinned to older snapshots.
--
-- This column is written at compile time (compiler.ts) and read
-- in revision-scoped lookups (start, choose, resolver, dialogue route).
-- ============================================================

ALTER TABLE dialogue_chunks ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;

-- Replace the old 2-column uniqueness (from 030) with a 3-column one.
-- Constraint name for the original UNIQUE(tree_id, chunk_key) is
-- dialogue_chunks_tree_id_chunk_key_key.
ALTER TABLE dialogue_chunks DROP CONSTRAINT IF EXISTS dialogue_chunks_tree_id_chunk_key_key;
ALTER TABLE dialogue_chunks ADD CONSTRAINT dialogue_chunks_tree_id_chunk_key_revision_key
  UNIQUE (tree_id, chunk_key, revision);

CREATE INDEX IF NOT EXISTS idx_dialogue_chunks_tree_key_rev
  ON dialogue_chunks (tree_id, chunk_key, revision);

COMMENT ON COLUMN dialogue_chunks.revision IS
  'Monotonic revision of the owning dialogue_tree at compile time. '
  'Players pin a revision at /dialogue/start; chunk resolution uses the '
  'pinned value so active sessions are unaffected by later recompiles.';

COMMIT;
