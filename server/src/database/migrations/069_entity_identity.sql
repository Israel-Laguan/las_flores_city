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

-- ------------------------------------------------------------------
-- 4. Keep canonical aliases in sync going forward.
--    The backfills above only cover rows that already exist at migration time.
--    Any entity INSERTed or renamed (name/title) afterwards would otherwise
--    never get its canonical alias, so the IdentityResolver would classify it
--    as a brand-new candidate and could create duplicates. A trigger per
--    canonical table upserts the primary alias on insert/rename, keeping the
--    index complete for all DB-backed entity types.
--
--    Idempotent: the function is CREATE OR REPLACE and each trigger uses the
--    DROP TRIGGER IF EXISTS pattern (per AGENTS.md) before creation.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_entity_canonical_alias() RETURNS trigger AS $$
DECLARE
  ent_type TEXT := TG_ARGV[0];
  name_col TEXT := TG_ARGV[1];
  name_val TEXT;
BEGIN
  -- Dynamic reference to the canonical name column ('name' or 'title').
  EXECUTE format('SELECT $1.%I::text', name_col) INTO name_val USING NEW;
  IF name_val IS NOT NULL AND length(name_val) > 0 THEN
    INSERT INTO entity_aliases (entity_type, entity_id, alias, source, is_primary)
    VALUES (ent_type, NEW.id, name_val, 'canonical_name', TRUE)
    ON CONFLICT (entity_type, entity_id, lower(alias))
      DO UPDATE SET alias = EXCLUDED.alias, is_primary = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_characters_canonical_alias ON characters;
CREATE TRIGGER trg_characters_canonical_alias
  AFTER INSERT OR UPDATE OF name ON characters
  FOR EACH ROW EXECUTE FUNCTION sync_entity_canonical_alias('character', 'name');

DROP TRIGGER IF EXISTS trg_scenes_canonical_alias ON scenes;
CREATE TRIGGER trg_scenes_canonical_alias
  AFTER INSERT OR UPDATE OF name ON scenes
  FOR EACH ROW EXECUTE FUNCTION sync_entity_canonical_alias('scene', 'name');

DROP TRIGGER IF EXISTS trg_dialogue_trees_canonical_alias ON dialogue_trees;
CREATE TRIGGER trg_dialogue_trees_canonical_alias
  AFTER INSERT OR UPDATE OF name ON dialogue_trees
  FOR EACH ROW EXECUTE FUNCTION sync_entity_canonical_alias('dialogue', 'name');

DROP TRIGGER IF EXISTS trg_dialogue_overlays_canonical_alias ON dialogue_overlays;
CREATE TRIGGER trg_dialogue_overlays_canonical_alias
  AFTER INSERT OR UPDATE OF name ON dialogue_overlays
  FOR EACH ROW EXECUTE FUNCTION sync_entity_canonical_alias('overlay', 'name');

DROP TRIGGER IF EXISTS trg_mysteries_canonical_alias ON mysteries;
CREATE TRIGGER trg_mysteries_canonical_alias
  AFTER INSERT OR UPDATE OF title ON mysteries
  FOR EACH ROW EXECUTE FUNCTION sync_entity_canonical_alias('mission', 'title');

COMMIT;