-- Las Flores 2077 - Add verified status to content_plans
-- Extends the CHECK constraint to allow the 'verified' status value.

BEGIN;

-- ============================================================
-- 1. Drop the old CHECK constraint
-- ============================================================

ALTER TABLE content_plans DROP CONSTRAINT IF EXISTS content_plans_status_check;

-- ============================================================
-- 2. Add new CHECK constraint with verified status
-- ============================================================

ALTER TABLE content_plans ADD CONSTRAINT content_plans_status_check
  CHECK (status IN ('draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed'));

COMMIT;
