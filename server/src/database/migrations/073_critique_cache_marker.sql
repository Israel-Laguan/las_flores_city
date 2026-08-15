-- ============================================================
-- 073_critique_cache_marker.sql
--
-- M26 follow-up fixes for the AI-critique cache:
--
-- 1. `is_marker` — when the LLM finds no conflicts for a (plan, scope, hash),
--    AICritiqueService persists a single marker row so the next unchanged
--    analysis is a cache hit instead of re-calling the LLM. Markers are hidden
--    from authors (getAnnotations / findCachedAnnotations filter them out).
--
-- 2. Cache index — the lookup in AICritiqueService.findCachedAnnotations now
--    also filters by `ai_model` (a model change must force a re-analyze rather
--    than returning another model's annotations). The old index
--    (plan_id, scope, input_hash) is dropped and replaced with a covering index
--    that includes ai_model, matching every cache predicate.
--
-- Idempotent: IF EXISTS / IF NOT EXISTS guards make re-runs safe.
--
-- This runs as a normal transactional migration. It intentionally does NOT use
-- CREATE/DROP INDEX CONCURRENTLY: the migration runner executes the file as one
-- multi-statement query, which PostgreSQL treats as a single implicit
-- transaction, and CONCURRENTLY cannot execute inside a transaction block.
-- The critique_annotations table is small, so a regular index swap during a
-- deploy is acceptable (same pattern as migration 070).
-- ============================================================

-- 1. Marker column for clean-plan cache hits.
ALTER TABLE critique_annotations
  ADD COLUMN IF NOT EXISTS is_marker BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Replace the cache index so it covers the model predicate too.
DROP INDEX IF EXISTS idx_critique_annotations_plan_scope_hash;

CREATE INDEX IF NOT EXISTS idx_critique_annotations_cache
  ON critique_annotations (plan_id, scope, input_hash, ai_model)
  WHERE status <> 'dismissed';
