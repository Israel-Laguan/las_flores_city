-- ============================================================
-- 090_admin_events_plan_intake.sql
--
-- Add 'plan_intake' to the admin_events event_type CHECK so the
-- POST /plans/graph-intake audit emit (admin-story-builder-graph-intake.ts)
-- is persisted rather than silently discarded by the CHECK violation.
--
-- Follows the 087 pattern: drop + re-add NOT VALID.
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
    'plan_rejected', 'plan_deleted', 'plan_intake'
)) NOT VALID;

COMMIT;
