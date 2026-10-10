-- 105_publish_revisions.sql
-- SC-404 (D1): revisions and the active-revision pointer, in the `publish` seam schema (104).
--
--   publish.revisions         — immutable, inert revision headers (lineage + manifest hash)
--   publish.revision_entries  — the manifest: which artifact each (artifact_type, name) maps to
--   publish.active_revision   — THE pointer: at most one row, moved only by compare-and-swap
--   publish.revision_flips    — append-only log of every pointer move (rollback history)
--
-- Atomic compare-and-swap, with no application-level locking: `active_revision` is a
-- singleton (`singleton` is pinned to TRUE by CHECK + PRIMARY KEY). The first flip is
-- `INSERT ... ON CONFLICT DO NOTHING`; every later flip is
-- `UPDATE ... WHERE revision_id = <expected>`. Under READ COMMITTED a concurrent flip
-- waits for the first, re-evaluates the WHERE against the new row, and matches nothing.
-- Rollback is just another flip back to an earlier revision.
--
-- Grants follow 104 (planning writes, runtime reads, nobody else). Runtime gets SELECT on
-- the pointer, revisions and entries; it gets NOTHING on the flip log (it has no need).
-- Revisions, entries and flips are immutable: planning has INSERT + SELECT only. The pointer
-- is the single mutable fact: planning has SELECT, INSERT, UPDATE, and no DELETE.
--
-- Transactional DDL for the OLTP database (`oltp` array: one file = one database).
-- Idempotent. Forward-only. Depends on 104.

CREATE TABLE IF NOT EXISTS publish.revisions (
  revision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Informational lineage: the revision this one was built from.
  parent_revision_id UUID REFERENCES publish.revisions (revision_id),
  -- sha256 hex of the canonical manifest JSON (informational; revision_id is the identity).
  manifest_hash TEXT NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS publish.revision_entries (
  revision_id UUID NOT NULL REFERENCES publish.revisions (revision_id),
  artifact_type TEXT NOT NULL
    CHECK (artifact_type IN ('scene', 'dialogue', 'mission', 'character', 'overlay')),
  name TEXT NOT NULL CHECK (name <> ''),
  -- A revision can only name artifacts that exist; artifacts are never deleted.
  artifact_id TEXT NOT NULL REFERENCES publish.artifacts (artifact_id),
  PRIMARY KEY (revision_id, artifact_type, name)
);

CREATE INDEX IF NOT EXISTS revision_entries_artifact_idx ON publish.revision_entries (artifact_id);

CREATE TABLE IF NOT EXISTS publish.active_revision (
  -- Singleton: PRIMARY KEY + CHECK pin this to exactly one possible row.
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  revision_id UUID NOT NULL REFERENCES publish.revisions (revision_id),
  flipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS publish.revision_flips (
  flip_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- NULL for the very first flip.
  from_revision_id UUID REFERENCES publish.revisions (revision_id),
  to_revision_id UUID NOT NULL REFERENCES publish.revisions (revision_id),
  flipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Access control: planning writes, runtime reads, nobody else
-- ============================================================

REVOKE ALL ON TABLE publish.revisions, publish.revision_entries, publish.active_revision, publish.revision_flips FROM PUBLIC;
REVOKE ALL ON TABLE publish.revisions, publish.revision_entries, publish.active_revision, publish.revision_flips FROM las_flores;
REVOKE ALL ON TABLE publish.revisions, publish.revision_entries, publish.active_revision, publish.revision_flips FROM planning;
REVOKE ALL ON TABLE publish.revisions, publish.revision_entries, publish.active_revision, publish.revision_flips FROM runtime;

GRANT SELECT, INSERT ON TABLE publish.revisions, publish.revision_entries, publish.revision_flips TO planning;
GRANT SELECT, INSERT, UPDATE ON TABLE publish.active_revision TO planning;
GRANT SELECT ON TABLE publish.revisions, publish.revision_entries, publish.active_revision TO runtime;

COMMENT ON TABLE publish.revisions IS 'SC-404: immutable, inert revision headers. Creating one never changes what runtime sees.';
COMMENT ON TABLE publish.revision_entries IS 'SC-404: the manifest of a revision: (artifact_type, name) -> artifact_id.';
COMMENT ON TABLE publish.active_revision IS 'SC-404: THE pointer. Singleton row; moved only by compare-and-swap (INSERT ON CONFLICT DO NOTHING first, then UPDATE ... WHERE revision_id = expected). Planning writes; runtime SELECT only.';
COMMENT ON TABLE publish.revision_flips IS 'SC-404: append-only log of every pointer move. Planning only.';
