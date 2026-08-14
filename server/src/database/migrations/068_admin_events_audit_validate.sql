-- ============================================================
-- 068_admin_events_audit_validate.sql
--
-- M24 (follow-up): Validate the extended admin_events.event_type CHECK
-- previously added with NOT VALID in 067. Runs after 067 in version
-- order. Idempotent: re-validating an already-validated constraint is
-- a no-op.
-- ============================================================

ALTER TABLE admin_events VALIDATE CONSTRAINT admin_events_event_type_check;