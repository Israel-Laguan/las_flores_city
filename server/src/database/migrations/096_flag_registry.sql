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
  -- Mirrors validateFlagSlug() in api/contracts/src/flags/flag-definition.ts:
  -- non-empty, at most MAX_SLUG_LENGTH (256) chars, then the identifier charset.
  -- The old two-regex form accepted '' (neither regex matches an empty string)
  -- and any arbitrarily long identifier, diverging from the shared contract.
  IF NEW.slug = '' OR length(NEW.slug) > 256 THEN
    RAISE EXCEPTION 'flag slug must be non-empty and at most 256 characters: %', NEW.slug;
  END IF;

  IF NEW.slug ~ '^[0-9]' OR NEW.slug ~ '[^a-zA-Z0-9_]' THEN
    RAISE EXCEPTION 'flag slug must start with a letter or underscore and contain only letters, digits, and underscores: %', NEW.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS _check_flag_slug ON planning.flag_definitions;
CREATE TRIGGER _check_flag_slug
  BEFORE INSERT OR UPDATE ON planning.flag_definitions
  FOR EACH ROW
  EXECUTE FUNCTION planning._validate_flag_slug();

-- Helper function for updated_at. MUST be created before the trigger that
-- references it — CREATE TRIGGER fails outright if the function is missing.
CREATE OR REPLACE FUNCTION planning._set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Updated_at auto-update trigger
DROP TRIGGER IF EXISTS _update_flag_definitions_updated_at ON planning.flag_definitions;
CREATE TRIGGER _update_flag_definitions_updated_at
  BEFORE UPDATE ON planning.flag_definitions
  FOR EACH ROW
  EXECUTE FUNCTION planning._set_updated_at();

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

-- Also revoke from public and the main las_flores role.
-- Ownership note: the tables are created by the migration connection, so their
-- owner is las_flores, NOT planning. Do not read the COMMENT below as a claim
-- about the owner. `ALTER TABLE ... OWNER TO planning` was tried and reverted:
-- moving runtime.flag_state off las_floses breaks the flag_definitions FK's
-- referential-integrity check for the migration role (deleting a retired flag
-- definition then fails with "permission denied for table flag_state").
-- Real ownership transfer belongs with the out-of-band prod provisioning 095
-- already flags as open; until then these comments describe the intended
-- boundary, not the current ACL owner.
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

-- flag_state has no UPDATE trigger of its own, so `updated_at`'s DEFAULT only
-- fires on INSERT: planning's later updates to is_set would leave updated_at
-- stale and stop meaning "when this state last changed". Reuse the helper
-- created for flag_definitions above.
DROP TRIGGER IF EXISTS _update_flag_state_updated_at ON runtime.flag_state;
CREATE TRIGGER _update_flag_state_updated_at
  BEFORE UPDATE ON runtime.flag_state
  FOR EACH ROW
  EXECUTE FUNCTION planning._set_updated_at();

-- Runtime is READ-ONLY on flag_state: planning writes, runtime reads.
-- A bare GRANT ALL here would hand runtime INSERT/UPDATE/DELETE/TRUNCATE and defeat
-- planning's threshold and latching rules, so revoke first and grant only SELECT.
REVOKE ALL ON TABLE runtime.flag_state FROM runtime;
GRANT SELECT ON TABLE runtime.flag_state TO runtime;

-- Planning also needs write access to flag_state
-- (planning sets flag states based on threshold crossings and other events).
-- Postgres requires SELECT on the columns an UPDATE reads in WHERE/SET and on the
-- columns used by INSERT ... ON CONFLICT DO UPDATE, so SELECT is required too.
GRANT USAGE ON SCHEMA runtime TO planning;
GRANT SELECT, INSERT, UPDATE ON TABLE runtime.flag_state TO planning;

-- Revoke from public. In dev the las_flores revoke is a no-op regardless, since
-- the docker image makes las_flores a SUPERUSER (POSTGRES_USER) and superusers
-- bypass privilege checks entirely.
REVOKE ALL ON TABLE runtime.flag_state FROM PUBLIC;
REVOKE ALL ON TABLE runtime.flag_state FROM las_flores;

-- ============================================================
-- Indexes
-- ============================================================

-- `flag_definitions.slug` is the PRIMARY KEY, which already provides a unique
-- btree index on exactly that column. A second index on slug is pure overhead
-- (extra storage plus write amplification on every INSERT/UPDATE), so it is not
-- created here.
--
-- Only genuinely additional access paths get an index:

-- Lookup flag definitions by semantics
CREATE INDEX IF NOT EXISTS flag_definitions_semantics_idx ON planning.flag_definitions (semantics);

-- Lookup flag state by context
CREATE INDEX IF NOT EXISTS flag_state_context_idx ON runtime.flag_state (context_type, context_id);

-- Deliberately NOT created, because the PRIMARY KEY (flag_slug, context_type,
-- context_id) already covers them:
--   * flag_state_flag_context_idx (flag_slug, context_type, context_id)
--     — byte-identical to the PRIMARY KEY index
--   * flag_state_flag_idx (flag_slug)
--     — its redundant leading-column prefix, served by the same PK index

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON SCHEMA planning IS 'SC-103/SC-202: planning canon schema. Contains flag_definitions and other planning-only tables.';

COMMENT ON TABLE planning.flag_definitions IS 'SC-202: Registry of flag definitions. Each flag declares a named boolean state with semantics (latching/tracking). Intended owner: the planning role (see the ownership note above — the migration connection currently owns it). Runtime CANNOT read this table.';

COMMENT ON TABLE runtime.flag_state IS 'SC-202: Runtime-accessible flag state. Stores the current boolean value of each flag per context. Intended owner: the runtime role (see the ownership note above); planning writes, runtime reads.';

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
-- - Slug validation is via trigger (identifier format + length bounds)
-- - Table ownership is NOT transferred here; see the ownership note in the
--   Access Control section for why (FK RI breakage) and where it is deferred.
-- ============================================================
