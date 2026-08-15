-- ============================================================
-- 072_admin_events_critique_validate.sql
--
-- M26 (follow-up): Validate the extended admin_events.event_type CHECK
-- previously added with NOT VALID in 071. Runs after 071 in version
-- order. Idempotent: re-validating an already-validated constraint is
-- a no-op.
-- ============================================================

ALTER TABLE admin_events VALIDATE CONSTRAINT admin_events_event_type_check;