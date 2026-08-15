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
-- This migration is registered as NONTRANSACTIONAL in migration-targets.json
-- because CREATE/DROP INDEX CONCURRENTLY cannot execute inside a transaction
-- block. The migration runner executes this file in autocommit mode.
-- ============================================================

-- 1. Marker column for clean-plan cache hits.
ALTER TABLE critique_annotations
  ADD COLUMN IF NOT EXISTS is_marker BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Replace the cache index so it covers the model predicate too.
--    CONCURRENTLY avoids blocking writes during the rebuild.
DROP INDEX IF EXISTS CONCURRENTLY idx_critique_annotations_plan_scope_hash;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_critique_annotations_cache
  ON critique_annotations (plan_id, scope, input_hash, ai_model)
  WHERE status <> 'dismissed';
