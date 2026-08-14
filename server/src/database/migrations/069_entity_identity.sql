-- ============================================================
-- 069_entity_identity.sql
--
-- M25: Entity Identity Resolution + Bounded Conflict Detection (Phase 5)
--
--   * `entity_aliases` — the cross-entity alias index. Every entity is known
--     by a stable `entity_id` plus a set of aliases/names. Resolution queries
--     ONLY this table (not the per-content tables), so identity matching works
--     uniformly across DB entities (characters, scenes, ...) and file-only
--     entities (locations). The primary/ canonical name is seeded as the first
--     (is_primary) alias.
--   * `conflict_reports` — per-job record of bounded, neighborhood-scoped
--     conflict detection. `checked_scope` (JSONB) answers "how much did we
--     check?" honestly; `findings` (JSONB) are the bounded conflicts found.
--
-- Idempotent: safe to re-run. Backfill uses ON CONFLICT DO NOTHING.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------------
-- 1. entity_aliases
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  alias VARCHAR(255) NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'canonical_name',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Case-insensitive uniqueness on the alias; also serves the case-insensitive
-- resolution lookup. (A table-level `UNIQUE (entity_type, entity_id, lower(alias))`
-- is invalid — expressions must be in an index, not a constraint.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_aliases_alias
  ON entity_aliases (entity_type, entity_id, lower(alias));

CREATE INDEX IF NOT EXISTS idx_entity_aliases_lookup
  ON entity_aliases (entity_type, lower(alias), is_primary);

-- ------------------------------------------------------------------
-- 2. conflict_reports — bounded, checked-scope-recorded detection
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conflict_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES content_plans(id) ON DELETE CASCADE,
  patch_id UUID REFERENCES patches(id) ON DELETE SET NULL,
  checked_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  passed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conflict_reports_plan
  ON conflict_reports (plan_id, created_at DESC);

-- ------------------------------------------------------------------
-- 3. Backfill entity_aliases from existing canonical names (idempotent).
--    Each content row's display name becomes its primary alias so resolution
--    has a complete index even before authors add explicit aliases.
-- ------------------------------------------------------------------
INSERT INTO entity_aliases (entity_type, entity_id, alias, source, is_primary)
SELECT 'character', id, name, 'canonical_name', TRUE
FROM characters
WHERE name IS NOT NULL AND length(name) > 0
ON CONFLICT (entity_type, entity_id, lower(alias)) DO NOTHING;

INSERT INTO entity_aliases (entity_type, entity_id, alias, source, is_primary)
SELECT 'scene', id, name, 'canonical_name', TRUE
FROM scenes
WHERE name IS NOT NULL AND length(name) > 0
ON CONFLICT (entity_type, entity_id, lower(alias)) DO NOTHING;

INSERT INTO entity_aliases (entity_type, entity_id, alias, source, is_primary)
SELECT 'dialogue', id, name, 'canonical_name', TRUE
FROM dialogue_trees
WHERE name IS NOT NULL AND length(name) > 0
ON CONFLICT (entity_type, entity_id, lower(alias)) DO NOTHING;

INSERT INTO entity_aliases (entity_type, entity_id, alias, source, is_primary)
SELECT 'overlay', id, name, 'canonical_name', TRUE
FROM dialogue_overlays
WHERE name IS NOT NULL AND length(name) > 0
ON CONFLICT (entity_type, entity_id, lower(alias)) DO NOTHING;

INSERT INTO entity_aliases (entity_type, entity_id, alias, source, is_primary)
SELECT 'mission', id, title, 'canonical_name', TRUE
FROM mysteries
WHERE title IS NOT NULL AND length(title) > 0
ON CONFLICT (entity_type, entity_id, lower(alias)) DO NOTHING;

-- Locations are file-only (no DB row); there is no locations table to seed
-- from here. The IdentityResolver seeds location aliases from their YAML on
-- first resolve (see IdentityResolver.syncLocationAliases) so the file-based
-- stores participate without a one-off backfill that could go stale.

COMMIT;