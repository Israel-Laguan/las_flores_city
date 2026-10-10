-- 104_publish_artifacts.sql
-- SC-401/402 (D2): `publish` — the planning→runtime seam schema, first table:
--   publish.artifacts — immutable, content-addressed compiled artifacts.
--
-- Why a third schema (architecture.md §3/§4/§5): `runtime` may not read `planning` at all
-- (a grant, SC-106), yet it must read compiled artifacts and, from the next migration, the
-- revision pointer. `publish` is the one place both meet: planning WRITES, runtime has
-- SELECT only, nobody else has any access. It is the Postgres backing for the
-- `ArtifactStore` port (api/planning/src/compile/artifact-store.ts); an object-store adapter
-- can replace it later without touching compile.
--
-- Content addressing is enforced by the database, not trusted: `artifact_id` must equal the
-- sha256 (lowercase hex) of the stored bytes, and `size_bytes` the byte length. `payload` is
-- TEXT, never JSONB: JSONB would normalise key order and whitespace, so the exact bytes the id
-- was computed from could not be recovered and integrity could not be re-verified on read.
--
-- Immutability is a grant, not a trigger: planning gets INSERT + SELECT only (no UPDATE, no
-- DELETE), runtime gets SELECT only. Rows are never updated or deleted by application code.
--
-- Transactional DDL for the OLTP database (`oltp` array in migration-targets.json: one file =
-- one database). Idempotent (IF NOT EXISTS, GRANT/REVOKE are re-runnable). Forward-only.
-- Depends on 095 (roles `planning` and `runtime`).

CREATE SCHEMA IF NOT EXISTS publish;

CREATE TABLE IF NOT EXISTS publish.artifacts (
  -- Lowercase hex sha256 of `payload`'s UTF-8 bytes (D3: id === content hash).
  artifact_id TEXT PRIMARY KEY
    CHECK (artifact_id ~ '^[0-9a-f]{64}$'),

  artifact_type TEXT NOT NULL
    CHECK (artifact_type IN ('scene', 'dialogue', 'mission', 'character', 'overlay')),

  -- Human-readable label (the scene slug for a scene artifact). Not identity.
  name TEXT NOT NULL CHECK (name <> ''),

  manifest_version INTEGER NOT NULL CHECK (manifest_version = 1),

  -- Canonical JSON text, exactly as hashed.
  payload TEXT NOT NULL,

  size_bytes INTEGER NOT NULL,

  -- Artifacts this one depends on (none for scene artifacts in SC-M2).
  dependencies TEXT[] NOT NULL DEFAULT '{}',

  -- Metadata only: never part of the hashed bytes.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT artifacts_hash_matches_payload
    CHECK (artifact_id = encode(sha256(convert_to(payload, 'UTF8')), 'hex')),
  CONSTRAINT artifacts_size_matches_payload
    CHECK (size_bytes = octet_length(convert_to(payload, 'UTF8'))),
  CONSTRAINT artifacts_payload_is_json
    CHECK (payload::jsonb IS NOT NULL)
);

-- ============================================================
-- Access control: planning writes, runtime reads, nobody else
-- ============================================================
-- Ownership note: as in 096/101 the migration connection owns the objects.

REVOKE ALL ON SCHEMA publish FROM PUBLIC;
GRANT USAGE ON SCHEMA publish TO planning, runtime;

REVOKE ALL ON TABLE publish.artifacts FROM PUBLIC;
REVOKE ALL ON TABLE publish.artifacts FROM las_flores;
REVOKE ALL ON TABLE publish.artifacts FROM planning;
REVOKE ALL ON TABLE publish.artifacts FROM runtime;
GRANT SELECT, INSERT ON TABLE publish.artifacts TO planning;
GRANT SELECT ON TABLE publish.artifacts TO runtime;

COMMENT ON SCHEMA publish IS 'SC-402/D2: the planning->runtime seam. Planning writes (INSERT/SELECT), runtime SELECT only, no other access.';
COMMENT ON TABLE publish.artifacts IS 'SC-402: immutable content-addressed compiled artifacts. artifact_id = sha256(payload), enforced by CHECK. Planning INSERT; runtime SELECT only.';
COMMENT ON COLUMN publish.artifacts.payload IS 'Canonical JSON text exactly as hashed (TEXT, not JSONB, so the bytes survive a round trip).';
