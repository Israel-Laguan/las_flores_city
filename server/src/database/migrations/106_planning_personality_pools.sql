-- 106_planning_personality_pools.sql
-- SC-306: planning storage for personality pools and the characters-to-pools link.
--   planning.personality_pools — one row per PersonalityPool (api/contracts/src/dialogue), by slug
--   planning.character_pools   — many-to-many: which characters use which pool
--
-- Same shape and rules as 101 (scene defs): `payload` is the contract JSON; the other columns
-- exist only for keys we filter on (slug, hash) and are never a second source of truth. Rows
-- are never deleted: retiring a pool sets `retired_at` (BF-303 pattern). A link to a pool is
-- enforced by a foreign key (NO ACTION), so a pool that is still linked cannot be hard-deleted.
--
-- `character_slug` is a plain slug with NO foreign key: the legacy `characters` table is not
-- mirrored into planning (same stance as SceneDef cast slugs). Existence of a character is a
-- compile-time content check, not a planning-storage constraint.
--
-- Transactional DDL for the OLTP database (`oltp` array in migration-targets.json: one file =
-- one database). Idempotent: IF NOT EXISTS, triggers dropped before create, GRANT/REVOKE
-- re-runnable. Forward-only.
-- Depends on 095 (planning schema + role) and 096 (planning._set_updated_at()).

CREATE TABLE IF NOT EXISTS planning.personality_pools (
  slug TEXT PRIMARY KEY
    CHECK (slug <> '' AND length(slug) <= 256 AND slug ~ '^[A-Za-z_][A-Za-z0-9_]*$'),

  -- PERSONALITY_POOL_SCHEMA_VERSION the payload was written with.
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),

  -- Contract JSON. Its own `slug` must agree with the row key.
  payload JSONB NOT NULL CHECK (payload ->> 'slug' = slug),

  -- sha256 hex of the canonical payload bytes (personalityPoolContentHash).
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NULL = active. Set by retire; rows are never deleted.
  retired_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS planning.character_pools (
  character_slug TEXT NOT NULL
    CHECK (character_slug <> '' AND length(character_slug) <= 256 AND character_slug ~ '^[A-Za-z_][A-Za-z0-9_]*$'),
  pool_slug TEXT NOT NULL REFERENCES planning.personality_pools (slug),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A link is a fact, not a row with identity: linking twice is one link.
  PRIMARY KEY (character_slug, pool_slug)
);

-- "Which characters use this pool?" (the primary key already serves the other direction.)
CREATE INDEX IF NOT EXISTS character_pools_pool_idx ON planning.character_pools (pool_slug, character_slug);

DROP TRIGGER IF EXISTS _update_personality_pools_updated_at ON planning.personality_pools;
CREATE TRIGGER _update_personality_pools_updated_at
  BEFORE UPDATE ON planning.personality_pools
  FOR EACH ROW
  EXECUTE FUNCTION planning._set_updated_at();

-- ============================================================
-- Access control: planning only
-- ============================================================
-- Pools are planning canon: runtime gets lines exclusively from compiled artifacts (SC-M3),
-- never from these tables (architecture.md §3). Same grants as 101.

GRANT ALL PRIVILEGES ON TABLE planning.personality_pools, planning.character_pools TO planning;

REVOKE ALL ON TABLE planning.personality_pools, planning.character_pools FROM runtime;
REVOKE ALL ON TABLE planning.personality_pools, planning.character_pools FROM PUBLIC;
REVOKE ALL ON TABLE planning.personality_pools, planning.character_pools FROM las_flores;

COMMENT ON TABLE planning.personality_pools IS 'SC-306: personality pools (PersonalityPool contract JSON), keyed by slug. Shared by many characters. Never deleted: retired_at marks retirement. Planning role only.';
COMMENT ON TABLE planning.character_pools IS 'SC-306: many-to-many link from a character slug to a pool. No FK to the legacy characters table. Planning role only.';
COMMENT ON COLUMN planning.personality_pools.payload IS 'PersonalityPool contract JSON (personalityPoolToJSON): sorted keys, schema_version stamped.';
COMMENT ON COLUMN planning.personality_pools.content_hash IS 'sha256 hex of the canonical payload bytes; upsertIfChanged compares it.';
COMMENT ON COLUMN planning.personality_pools.retired_at IS 'SC-306: set when the pool is retired. NULL = active. Rows are never deleted.';
