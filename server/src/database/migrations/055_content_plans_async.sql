-- Las Flores 2077 - Add async solidify statuses to content_plans
-- Extends the CHECK constraint to allow pending, staging, migrating, verifying
-- status values used by the async approveAndSolidify pipeline (Milestone 18).

BEGIN;

-- ============================================================
-- 1. Drop the old CHECK constraint
-- ============================================================

ALTER TABLE content_plans DROP CONSTRAINT IF EXISTS content_plans_status_check;

-- ============================================================
-- 2. Add new CHECK constraint with async statuses
-- ============================================================

ALTER TABLE content_plans ADD CONSTRAINT content_plans_status_check
  CHECK (status IN (
    'draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed',
    'pending', 'staging', 'migrating', 'verifying'
  ));

COMMIT;
