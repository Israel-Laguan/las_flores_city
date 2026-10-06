-- 097_flag_registry_retire.sql
-- BF-303: "retire, never delete" for planning.flag_definitions (SC-202).
-- A retired flag keeps its row (audit trail, FK from runtime.flag_state) and is
-- marked with retired_at. Transactional and idempotent.

ALTER TABLE planning.flag_definitions
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;

COMMENT ON COLUMN planning.flag_definitions.retired_at IS 'BF-303: set when the flag is retired. NULL = active. Rows are never deleted.';

-- Active-flag lookups (exists / getAllSlugs / listBySemantics) skip retired rows.
CREATE INDEX IF NOT EXISTS flag_definitions_active_semantics_idx
  ON planning.flag_definitions (semantics, created_at)
  WHERE retired_at IS NULL;
