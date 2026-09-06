-- ============================================================
-- 091_admin_events_plan_intake_validate.sql
--
-- Validate the widened admin_events event_type CHECK added by 090.
-- ============================================================

ALTER TABLE admin_events VALIDATE CONSTRAINT admin_events_event_type_check;
