-- 101_planning_scene_defs.sql
-- SC-311: planning storage for scene definitions and flag-gated overlays.
--   planning.scene_defs     — one row per SceneDef (api/contracts/src/scene), keyed by slug
--   planning.scene_overlays — one row per overlay, FK to its base scene
--
-- Numbering: sprint-03 docs reserved "099" for this, but 099 (migration_log_district)
-- and 100 were taken by the districts work before this landed; 101 is the next free
-- number. Migrations apply in numeric order and key on (version, database_name).
--
-- Name: `scene_defs`, not `scenes` (SC-S12) — a bare `scenes` means the legacy
-- `public.scenes` location table, which is untouched.
--
-- Transactional DDL for the OLTP database (registered in the `oltp` array of
-- migration-targets.json, one file = one database). Idempotent: IF NOT EXISTS
-- throughout, triggers dropped before create, GRANT/REVOKE are re-runnable.
-- Forward-only; no down migration (same as 095-097).
--
-- `payload` is the contract JSON (sceneDefToJSON). The other columns exist only for
-- keys we filter on (slug, base, priority, hash) — never a second source of truth.
-- Rows are never deleted: retiring sets `retired_at` (BF-303 pattern). The FK from an
-- overlay to its scene is NO ACTION, so a scene with overlays cannot be hard-deleted
-- either.
--
-- Depends on 095 (planning schema + role) and 096 (planning._set_updated_at()).

-- ============================================================
-- planning.scene_defs
-- ============================================================

CREATE TABLE IF NOT EXISTS planning.scene_defs (
  -- Authoring handle; same identifier rule as validateFlagSlug / isValidSlug
  -- (non-empty, <= 256 chars, letters/digits/underscore, not digit-first).
  slug TEXT PRIMARY KEY
    CHECK (slug <> '' AND length(slug) <= 256 AND slug ~ '^[A-Za-z_][A-Za-z0-9_]*$'),

  -- SCENE_SCHEMA_VERSION the payload was written with.
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),

  -- Contract JSON. Its own `slug` must agree with the row key.
  payload JSONB NOT NULL CHECK (payload ->> 'slug' = slug),

  -- sha256 hex of the canonical payload bytes (sceneDefContentHash). upsertIfChanged
  -- compares this; it is the seed of SC-403 idempotency.
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NULL = active. Set by retire; rows are never deleted.
  retired_at TIMESTAMPTZ
);

-- ============================================================
-- planning.scene_overlays
-- ============================================================

CREATE TABLE IF NOT EXISTS planning.scene_overlays (
  slug TEXT PRIMARY KEY
    CHECK (slug <> '' AND length(slug) <= 256 AND slug ~ '^[A-Za-z_][A-Za-z0-9_]*$'),

  -- The scene this overlay layers onto. FK enforced by the database.
  base_scene_slug TEXT NOT NULL REFERENCES planning.scene_defs (slug),

  -- Overlay precedence (higher wins among active overlays; SC-S13).
  priority INTEGER NOT NULL DEFAULT 0,

  -- Overlay contract JSON (SceneOverlay, Group E / E1). Shape is checked in code.
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),

  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

-- Load a scene's overlays in compose order (priority asc, slug asc).
CREATE INDEX IF NOT EXISTS scene_overlays_base_priority_idx
  ON planning.scene_overlays (base_scene_slug, priority, slug);

-- ============================================================
-- updated_at maintenance (helper created in 096)
-- ============================================================

DROP TRIGGER IF EXISTS _update_scene_defs_updated_at ON planning.scene_defs;
CREATE TRIGGER _update_scene_defs_updated_at
  BEFORE UPDATE ON planning.scene_defs
  FOR EACH ROW
  EXECUTE FUNCTION planning._set_updated_at();

DROP TRIGGER IF EXISTS _update_scene_overlays_updated_at ON planning.scene_overlays;
CREATE TRIGGER _update_scene_overlays_updated_at
  BEFORE UPDATE ON planning.scene_overlays
  FOR EACH ROW
  EXECUTE FUNCTION planning._set_updated_at();

-- ============================================================
-- Access control: planning only
-- ============================================================
-- Scene canon is planning-owned: runtime gets scenes exclusively from compiled
-- artifacts, never from these tables (architecture.md §3). 095's default privileges
-- already grant `planning` ALL on new tables in the schema; the explicit GRANT below
-- keeps this migration correct on its own, and the REVOKEs make "nobody else" explicit
-- (and are asserted by tests/integration/planning-scene-defs.test.ts).
-- Ownership note: as in 096, the migration connection owns the tables; see that file
-- for why ownership is not transferred here.

GRANT ALL PRIVILEGES ON TABLE planning.scene_defs, planning.scene_overlays TO planning;

REVOKE ALL ON TABLE planning.scene_defs, planning.scene_overlays FROM runtime;
REVOKE ALL ON TABLE planning.scene_defs, planning.scene_overlays FROM PUBLIC;
REVOKE ALL ON TABLE planning.scene_defs, planning.scene_overlays FROM las_flores;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE planning.scene_defs IS 'SC-311: scene definitions (SceneDef contract JSON), keyed by slug. Never deleted — retired_at marks retirement. Planning role only; runtime reads compiled artifacts instead.';
COMMENT ON TABLE planning.scene_overlays IS 'SC-311: flag-gated scene overlays layered onto planning.scene_defs via base_scene_slug. Never deleted — retired_at marks retirement. Planning role only.';
COMMENT ON COLUMN planning.scene_defs.payload IS 'SceneDef contract JSON (sceneDefToJSON): sorted keys, schema_version stamped.';
COMMENT ON COLUMN planning.scene_defs.content_hash IS 'sha256 hex of the canonical payload bytes; upsertIfChanged compares it.';
COMMENT ON COLUMN planning.scene_defs.retired_at IS 'SC-311: set when the scene is retired. NULL = active. Rows are never deleted.';
COMMENT ON COLUMN planning.scene_overlays.base_scene_slug IS 'FK to planning.scene_defs(slug): the scene this overlay layers onto.';
COMMENT ON COLUMN planning.scene_overlays.priority IS 'Overlay precedence among active overlays on the same base scene.';
COMMENT ON COLUMN planning.scene_overlays.retired_at IS 'SC-311: set when the overlay is retired. NULL = active. Rows are never deleted.';
