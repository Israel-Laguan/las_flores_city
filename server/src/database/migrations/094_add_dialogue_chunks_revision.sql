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
-- IMPORTANT (nontransactional): the unique index must be built with
-- CREATE UNIQUE INDEX CONCURRENTLY (cannot run inside a transaction
-- and must not take long ACCESS EXCLUSIVE lock on a live table).
-- We create the index, attach it as a constraint via USING INDEX
-- (short lock), then drop the old constraint. This file is listed in
-- nontransactional in migration-targets.json so the runner executes
-- its statements in autocommit mode.
--
-- This column is written at compile time (compiler.ts) and read
-- in revision-scoped lookups (start, choose, resolver, dialogue route).
-- ============================================================

ALTER TABLE dialogue_chunks ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;

-- Create the new 3-column unique index CONCURRENTLY first (outside tx).
-- This is the backing index for the constraint we will attach.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS dialogue_chunks_tree_id_chunk_key_revision_key
  ON dialogue_chunks (tree_id, chunk_key, revision);

-- Attach the index as the unique constraint (quick catalog update).
-- Only after the index is fully built and attached do we drop the old constraint.
ALTER TABLE dialogue_chunks
  ADD CONSTRAINT dialogue_chunks_tree_id_chunk_key_revision_key
  UNIQUE USING INDEX dialogue_chunks_tree_id_chunk_key_revision_key;

-- Drop the old 2-column constraint (from 030) only after the replacement is live.
ALTER TABLE dialogue_chunks DROP CONSTRAINT IF EXISTS dialogue_chunks_tree_id_chunk_key_key;

-- Non-unique supporting index for common lookup patterns.
CREATE INDEX IF NOT EXISTS idx_dialogue_chunks_tree_key_rev
  ON dialogue_chunks (tree_id, chunk_key, revision);

COMMENT ON COLUMN dialogue_chunks.revision IS
  'Monotonic revision of the owning dialogue_tree at compile time. '
  'Players pin a revision at /dialogue/start; chunk resolution uses the '
  'pinned value so active sessions are unaffected by later recompiles.';

-- Note: no outer BEGIN/COMMIT — this file runs non-transactionally.
