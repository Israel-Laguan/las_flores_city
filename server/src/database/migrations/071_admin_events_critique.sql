-- ============================================================
-- 071_admin_events_critique.sql
--
-- M26: Extend admin_events event types for the AI-critique audit trail.
--
-- AdminEventEmitter now emits 'plan_analyzed' (critique runs) and
-- 'plan_annotation_status' (live overrides). The 067 constraint does not
-- include them, so without this migration emitAdminEvent's INSERT would
-- violate the CHECK and the swallowed error would silently drop the audit
-- event.
--
-- Follows the 067 pattern: drop the old CHECK, re-add with the extended
-- allowed set using NOT VALID, and VALIDATE in a follow-up migration once
-- this one is committed.
-- Idempotent: re-dropping a missing constraint and re-adding a NOT VALID
-- CHECK are both safe.
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
    'plan_analyzed', 'plan_annotation_status'
)) NOT VALID;

COMMIT;