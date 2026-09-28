-- 096_flag_registry.sql
-- SC-202: Flag registry storage in planning schema.
-- Creates the flag_definitions table for declaring named boolean states
-- that can be set by planning and read by runtime.
--
-- This is a regular DDL migration (NOT nontransactional) and runs
-- in the OLTP database transactionally.

-- ============================================================
-- Flag Definitions Table
-- ============================================================

CREATE TABLE IF NOT EXISTS planning.flag_definitions (
  -- Stable identifier. Must be a valid SQL identifier.
  slug TEXT PRIMARY KEY,

  -- Human-readable description of what this flag means when set.
  meaning TEXT NOT NULL,

  -- How the flag behaves after being set:
  -- - 'latching': persists until explicitly cleared
  -- - 'tracking': automatically clears when condition falls below threshold
  semantics TEXT NOT NULL CHECK (semantics IN ('latching', 'tracking')),

  -- Timestamp when this flag definition was created.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Timestamp when this flag definition was last updated.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure slug is a valid identifier (starts with letter/underscore, alphanumeric + underscore)
CREATE OR REPLACE FUNCTION planning._validate_flag_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug ~ '^[0-9]' OR NEW.slug ~ '[^a-zA-Z0-9_]' THEN
    RAISE EXCEPTION 'flag slug must start with a letter or underscore and contain only letters, digits, and underscores: %', NEW.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS planning._check_flag_slug ON planning.flag_definitions;
CREATE TRIGGER planning._check_flag_slug
  BEFORE INSERT OR UPDATE ON planning.flag_definitions
  FOR EACH ROW
  EXECUTE FUNCTION planning._validate_flag_slug();

-- Updated_at auto-update trigger
DROP TRIGGER IF EXISTS planning._update_flag_definitions_updated_at ON planning.flag_definitions;
CREATE TRIGGER planning._update_flag_definitions_updated_at
  BEFORE UPDATE ON planning.flag_definitions
  FOR EACH ROW
  EXECUTE FUNCTION planning._set_updated_at();

-- Create the helper function for updated_at if it doesn't exist
CREATE OR REPLACE FUNCTION planning._set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Access Control
-- ============================================================

-- Grant full access to planning role
GRANT ALL PRIVILEGES ON TABLE planning.flag_definitions TO planning;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA planning TO planning;
ALTER DEFAULT PRIVILEGES IN SCHEMA planning GRANT ALL ON TABLES TO planning;

-- Explicitly REVOKE all access from runtime role
-- Runtime can only read flag *state* (via runtime schema tables),
-- NOT the flag *definitions* (which are planning canon).
REVOKE ALL ON TABLE planning.flag_definitions FROM runtime;

-- Also revoke from public and the main las_flores role
REVOKE ALL ON TABLE planning.flag_definitions FROM PUBLIC;
REVOKE ALL ON TABLE planning.flag_definitions FROM las_flores;

-- Grant SELECT to planning role (already has ALL, but be explicit)
GRANT SELECT ON TABLE planning.flag_definitions TO planning;

-- ============================================================
-- Flag State Table (in runtime schema for runtime read access)
-- ============================================================

-- Flag state is stored separately in the runtime schema so that
-- runtime can read it without accessing the planning schema.
-- Planning writes to this table, runtime reads from it.

CREATE TABLE IF NOT EXISTS runtime.flag_state (
  -- Reference to the flag definition in planning schema
  flag_slug TEXT NOT NULL REFERENCES planning.flag_definitions(slug),

  -- The current boolean state of this flag for a specific context.
  -- In SC-M2, context is per-player. In SC-M6+, may expand to per-player-per-entity.
  context_type TEXT NOT NULL DEFAULT 'global',
  context_id TEXT NOT NULL DEFAULT 'global',

  -- Whether this flag is currently set (true) or cleared (false)
  is_set BOOLEAN NOT NULL DEFAULT FALSE,

  -- When this flag state was last updated
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Primary key: a flag can have only one state per context
  PRIMARY KEY (flag_slug, context_type, context_id)
);

-- Grant access to flag_state
GRANT ALL PRIVILEGES ON TABLE runtime.flag_state TO runtime;
GRANT SELECT ON TABLE runtime.flag_state TO runtime;

-- Planning also needs write access to flag_state
-- (planning sets flag states based on threshold crossings and other events)
GRANT INSERT, UPDATE ON TABLE runtime.flag_state TO planning;

-- Revoke from public
REVOKE ALL ON TABLE runtime.flag_state FROM PUBLIC;
REVOKE ALL ON TABLE runtime.flag_state FROM las_flores;

-- ============================================================
-- Indexes
-- ============================================================

-- For fast lookup of flag definitions by slug
CREATE INDEX IF NOT EXISTS flag_definitions_slug_idx ON planning.flag_definitions (slug);

-- For fast lookup of flag definitions by semantics
CREATE INDEX IF NOT EXISTS flag_definitions_semantics_idx ON planning.flag_definitions (semantics);

-- For fast lookup of flag state by flag_slug
CREATE INDEX IF NOT EXISTS flag_state_flag_idx ON runtime.flag_state (flag_slug);

-- For fast lookup of flag state by context
CREATE INDEX IF NOT EXISTS flag_state_context_idx ON runtime.flag_state (context_type, context_id);

-- For fast lookup of flag state by flag_slug + context
CREATE INDEX IF NOT EXISTS flag_state_flag_context_idx ON runtime.flag_state (flag_slug, context_type, context_id);

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON SCHEMA planning IS 'SC-103/SC-202: planning canon schema. Contains flag_definitions and other planning-only tables.';

COMMENT ON TABLE planning.flag_definitions IS 'SC-202: Registry of flag definitions. Each flag declares a named boolean state with semantics (latching/tracking). Owned by planning role. Runtime CANNOT read this table.';

COMMENT ON TABLE runtime.flag_state IS 'SC-202: Runtime-accessible flag state. Stores the current boolean value of each flag per context. Planning writes, runtime reads.';

COMMENT ON COLUMN planning.flag_definitions.slug IS 'Stable identifier for the flag. Must be a valid SQL identifier.';
COMMENT ON COLUMN planning.flag_definitions.meaning IS 'Human-readable description of what this flag means when set.';
COMMENT ON COLUMN planning.flag_definitions.semantics IS 'Behavior after set: latching (persists) or tracking (auto-clears when condition falls below).';
COMMENT ON COLUMN runtime.flag_state.flag_slug IS 'Reference to planning.flag_definitions(slug).';
COMMENT ON COLUMN runtime.flag_state.context_type IS 'Type of context (e.g., ''global'', ''player'', ''player_scene'').';
COMMENT ON COLUMN runtime.flag_state.context_id IS 'Identifier for the context (e.g., player_id, scene_id).';
COMMENT ON COLUMN runtime.flag_state.is_set IS 'Current boolean state of the flag in this context.';

-- ============================================================
-- SC-202 Implementation Notes
-- ============================================================
-- - Flag definitions live in planning schema (planning canon)
-- - Flag state lives in runtime schema (accessible to runtime)
-- - Planning has full access to both tables
-- - Runtime can only read flag_state (NOT flag_definitions)
-- - SC-106 negative test must be extended to verify runtime cannot
--   SELECT from planning.flag_definitions
-- - Semantics validation is at DB level (CHECK constraint)
-- - Slug validation is via trigger (identifier format)
-- ============================================================
