-- Las Flores 2077 - Add verification_report column to content_plans
-- Stores the result of cross-reference verification checks.

BEGIN;

-- ============================================================
-- 1. Add verification_report column
-- ============================================================

ALTER TABLE content_plans ADD COLUMN IF NOT EXISTS verification_report JSONB DEFAULT NULL;

-- ============================================================
-- 2. Add index for querying verified plans
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_content_plans_verification_report 
  ON content_plans USING gin(verification_report) 
  WHERE verification_report IS NOT NULL;

COMMIT;
