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

-- Backfill NULLs immediately after ADD (before any SET NOT NULL or index build).
-- If a prior partial run (or manual DDL) left the column as nullable, ADD IF NOT EXISTS
-- is a no-op so the NOT NULL DEFAULT from the ADD never took effect. We must backfill
-- first (so SET NOT NULL succeeds), then explicitly SET DEFAULT + SET NOT NULL
-- (both idempotent if already correct). This guarantees the column is always
-- NOT NULL DEFAULT 0 at the end of the file, regardless of prior state.
-- These steps are before the CREATE UNIQUE INDEX CONCURRENTLY so the index
-- is built under the final NOT NULL contract (NULLs would be treated specially
-- by unique semantics and revision= queries would miss NULL rows).
UPDATE dialogue_chunks SET revision = 0 WHERE revision IS NULL;

ALTER TABLE dialogue_chunks ALTER COLUMN revision SET DEFAULT 0;
ALTER TABLE dialogue_chunks ALTER COLUMN revision SET NOT NULL;

-- Clean up any leftover INVALID index from a prior failed CONCURRENTLY build.
-- Without this, IF NOT EXISTS would skip, and the later ADD CONSTRAINT USING INDEX would fail permanently.
-- Use pg_index.indisvalid (not pg_class.relisvalid) for compatibility with PG < 12.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index x ON x.indexrelid = c.oid
    WHERE c.relname = 'dialogue_chunks_tree_id_chunk_key_revision_key'
      AND c.relkind = 'i'
      AND NOT x.indisvalid
  ) THEN
    DROP INDEX IF EXISTS dialogue_chunks_tree_id_chunk_key_revision_key;
  END IF;
END $$;

-- Create the new 3-column unique index CONCURRENTLY first (outside tx).
-- This is the backing index for the constraint we will attach.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS dialogue_chunks_tree_id_chunk_key_revision_key
  ON dialogue_chunks (tree_id, chunk_key, revision);

-- Attach the index as the unique constraint (quick catalog update).
-- Only after the index is fully built and attached do we drop the old constraint.
-- Guarded for resumability: if a prior partial run already attached it (but
-- failed before recording schema_migrations), re-execution must not fail.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'dialogue_chunks'::regclass
       AND conname = 'dialogue_chunks_tree_id_chunk_key_revision_key'
  ) THEN
    ALTER TABLE dialogue_chunks
      ADD CONSTRAINT dialogue_chunks_tree_id_chunk_key_revision_key
      UNIQUE USING INDEX dialogue_chunks_tree_id_chunk_key_revision_key;
  END IF;
END $$;

-- Drop the old 2-column constraint (from 030) only after the replacement is live.
ALTER TABLE dialogue_chunks DROP CONSTRAINT IF EXISTS dialogue_chunks_tree_id_chunk_key_key;

-- Non-unique supporting index for common lookup patterns.
CREATE INDEX IF NOT EXISTS idx_dialogue_chunks_tree_key_rev
  ON dialogue_chunks (tree_id, chunk_key, revision);

COMMENT ON COLUMN dialogue_chunks.revision IS
  'Monotonic revision of the owning dialogue_tree at compile time. '
  'Players pin a revision at /dialogue/start; chunk resolution uses the '
  'pinned value so active sessions are unaffected by later recompiles.';

-- Resume safety (updated for partial-run column-definition case):
-- The backfill + ALTER COLUMN SET DEFAULT + SET NOT NULL (right after ADD)
-- run before index creation. This makes re-runs safe even if a prior partial
-- execution (or manual add) left revision nullable: data is backfilled first,
-- definition is forced to NOT NULL DEFAULT 0, and the unique index is built
-- under the final contract. No late UPDATE remains (would be duplicate).
 
-- Note: no outer BEGIN/COMMIT — this file runs non-transactionally.
