-- ============================================================
-- 087_admin_events_plan_lifecycle.sql
--
-- M50 Part 2: emit audit events for the new plan:reject / plan:delete
-- lifecycle commands. The 071 constraint does not include 'plan_rejected' or
-- 'plan_deleted', so without this widening emitAdminEvent's INSERT would violate
-- the CHECK and the swallowed error would silently drop the audit event.
--
-- Follows the 067/071 pattern: drop the old CHECK, re-add with the extended
-- allowed set using NOT VALID, and VALIDATE CONSTRAINT in 088 once committed.
-- Idempotent: DROP CONSTRAINT IF EXISTS + a re-added NOT VALID CHECK are safe.
-- ============================================================

BEGIN;

ALTER TABLE admin_events DROP CONSTRAINT IF EXISTS admin_events_event_type_check;

ALTER TABLE admin_events ADD CONSTRAINT admin_events_event_type_check CHECK (event_type IN (
    'plan_created', 'plan_refined', 'plan_staged',
    'plan_migrated', 'plan_verified', 'plan_failed', 'plan_solidified',
    'user_role_changed', 'settings_updated',
    'placeholders_filled',
    'patch_created', 'patch_applied', 'patch_rejected', 'patch_rolled_back',
    'claim_created', 'claim_updated',
    'plan_analyzed', 'plan_annotation_status',
    'plan_chat_reply', 'plan_delta_applied', 'plan_delta_discarded',
    'plan_rejected', 'plan_deleted'
)) NOT VALID;

COMMIT;
