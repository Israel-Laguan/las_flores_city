-- ============================================================
-- 063_content_url.sql
--
-- M23: Content Externalization Phase 1 (chunks + tree nodes → CDN)
--
-- Adds `content_url` reference columns to the content tables whose
-- heavy JSONB blobs (dialogue nodes / chunk sub-graphs) are now
-- externalized to MinIO/CDN. `ResolvedDialogueTree` fetches the
-- actual content by `content_url`, so the game hot path stops
-- reading the heavy JSONB from the DB pool.
--
-- The heavy JSONB columns (`nodes` / `leaves`) are intentionally
-- KEPT for Phase 1 (dual-write) so the resolver can gracefully fall
-- back to in-DB content when `content_url` is NULL/empty or the CDN
-- fetch fails — and so the many existing integration tests and tools
-- that seed/read those columns keep working. Physical column drop is
-- a Phase-2 cleanup tracked in docs/milestones/M23-content-cdn.md.
--
-- Idempotent: safe to re-run.
-- ============================================================

BEGIN;

ALTER TABLE dialogue_chunks
  ADD COLUMN IF NOT EXISTS content_url TEXT;

ALTER TABLE dialogue_trees
  ADD COLUMN IF NOT EXISTS content_url TEXT;

COMMIT;