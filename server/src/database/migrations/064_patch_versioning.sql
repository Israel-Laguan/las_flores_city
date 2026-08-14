-- ============================================================
-- 064_patch_versioning.sql
--
-- M24: Patch-Level Versioning (Phase 5)
--
-- Introduces the patch-as-unit-of-versioning model:
--   * `patches` — the unit of change. A rejected proposal is a
--     `patch → rejected → no-op` (no canon mutation). An applied
--     patch records the affected entities so rollback is a lookup,
--     not an inverse-reasoning task.
--   * `canon_revisions` — immutable, append-only per-entity record
--     of the canonical state after each applied patch. Each row
--     carries the `content_snapshot` (the post-patch DB row) and is
--     linked to the `applied_patch_id`. Rollback looks up the prior
--     revision's snapshot and restores it.
--
-- Idempotent: safe to re-run.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------------
-- 1. patches
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES content_plans(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  patch_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'applied', 'rejected', 'rolled_back')),
  conflict_reason TEXT,
  applied_by UUID REFERENCES users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patches_plan_id ON patches(plan_id);
CREATE INDEX IF NOT EXISTS idx_patches_status ON patches(status);
CREATE INDEX IF NOT EXISTS idx_patches_created_at ON patches(created_at DESC);

-- ------------------------------------------------------------------
-- 2. canon_revisions — append-only per-entity canon history
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canon_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(30) NOT NULL,
  entity_id UUID NOT NULL,
  revision_number INTEGER NOT NULL,
  content_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_patch_id UUID REFERENCES patches(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES content_plans(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_canon_revisions_entity
  ON canon_revisions(entity_type, entity_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_canon_revisions_patch
  ON canon_revisions(applied_patch_id);

COMMIT;