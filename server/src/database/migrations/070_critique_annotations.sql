-- ============================================================
-- 070_critique_annotations.sql
--
-- M26: AI Critique — Postgres-backed annotation nodes
--
-- The AI Critique Service (Moment 3) queries a plan's neighborhood, sends it
-- to an LLM, parses structured JSON, and persists the resulting annotations.
-- Each annotation is either a `:Conflict` or a `:Suggestion` — the Neo4j node
-- contract from §13.
--
-- This table is the canonical durable store until M27-b migrates these rows
-- into actual Neo4j graph nodes. The schema maps 1:1 onto `(:Conflict)` /
-- `(:Suggestion)` nodes with `-[:FLAGGED_IN]->` edges.
--
-- Caching: the `(ai_model, input_hash)` index lets re-analysis of unchanged
-- subgraphs skip the LLM call. When the plan items or existing context changes,
-- the hash changes and a new critique pass runs.
--
-- Live overrides: authors can dismiss false-positive conflicts or manually
-- mark them addressed (M26). M29's apply-delta sets `status='addressed'`.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS. Safe to re-run.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS critique_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Annotation type — maps to Neo4j label (':Conflict' | ':Suggestion')
  type VARCHAR(20) NOT NULL CHECK (type IN ('conflict', 'suggestion')),

  -- Severity. Only 'error' blocks pre-approve gating.
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('error', 'warning', 'info')),

  -- AI's plain-language explanation (anti-hallucination: always display to author)
  description TEXT NOT NULL,

  -- Evidence excerpts: [{nodeType, nodeId, slug, excerpt, field?}]
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 1-hop neighborhood peers: [{entityType, slug, relationship?}]
  related_entities JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Which LLM pass produced the annotation ('entity' | 'cross_entity' | 'cross_mission')
  scope VARCHAR(20) NOT NULL DEFAULT 'entity'
    CHECK (scope IN ('entity', 'cross_entity', 'cross_mission')),

  -- LLM model that produced this annotation (provenance)
  ai_model VARCHAR(100) NOT NULL,

  -- SHA-256 of the serialized subgraph that was analyzed. Used as cache key
  -- together with `ai_model`: same hash + same model = skip LLM call.
  input_hash VARCHAR(64) NOT NULL,

  -- Lifecycle. 'open' = active, 'addressed' = resolved (M29 apply-delta),
  -- 'dismissed' = false-positive (M26 live override).
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'addressed', 'dismissed')),

  -- Foreign key to the content plan this annotation belongs to.
  plan_id UUID NOT NULL REFERENCES content_plans(id) ON DELETE CASCADE,

  -- Plan item IDs that this annotation relates to (for scoping display).
  item_ids TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fetch all annotations for a plan (admin overlay display).
CREATE INDEX IF NOT EXISTS idx_critique_annotations_plan
  ON critique_annotations (plan_id, created_at DESC);

-- Filter by lifecycle status (e.g. "show only unresolved open conflicts").
CREATE INDEX IF NOT EXISTS idx_critique_annotations_status
  ON critique_annotations (status);

-- Cache key: unchanged subgraph + same model = skip LLM re-analyze.
CREATE INDEX IF NOT EXISTS idx_critique_annotations_cache
  ON critique_annotations (ai_model, input_hash);

COMMIT;
