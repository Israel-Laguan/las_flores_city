-- ============================================================
-- 067_admin_events_audit.sql
--
-- M24: Extend admin_events event types for the patch/claim audit trail.
--
-- Follows the 060_admin_events_solidified.sql pattern: drop the old
-- CHECK, re-add with the extended allowed set using NOT VALID, and VALIDATE
-- the constraint in a follow-up migration once this one is committed.
-- NOTE: `NOT VALID` skips the existing-row validation scan, but the
-- `ALTER TABLE ... ADD CONSTRAINT` still takes an ACCESS EXCLUSIVE table lock
-- (briefly blocking writes during the ADD) — operators must not assume this
-- migration is lock-free.
-- Idempotent: re-dropping a missing constraint and re-adding a
-- NOT VALID CHECK are both safe; quotes are removed from the final
-- NOT VALID-friendly list.
-- ============================================================

BEGIN;

ALTER TABLE admin_events DROP CONSTRAINT IF EXISTS admin_events_event_type_check;

ALTER TABLE admin_events ADD CONSTRAINT admin_events_event_type_check CHECK (event_type IN (
    'plan_created', 'plan_refined', 'plan_staged',
    'plan_migrated', 'plan_verified', 'plan_failed', 'plan_solidified',
    'user_role_changed', 'settings_updated',
    'placeholders_filled',
    'patch_created', 'patch_applied', 'patch_rejected', 'patch_rolled_back',
    'claim_created', 'claim_updated'
)) NOT VALID;

COMMIT;