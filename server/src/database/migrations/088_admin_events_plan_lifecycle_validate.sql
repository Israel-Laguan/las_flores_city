-- ============================================================
-- 088_admin_events_plan_lifecycle_validate.sql
--
-- Validate the widened admin_events event_type CHECK added by 087.
-- Run as a separate migration (matching the 070/072 validate-after-widen
-- convention) so the widening lands without blocking on existing-row
-- validation: the extended set is a superset of the previous one, so existing
-- rows always validate cleanly.
-- ============================================================

ALTER TABLE admin_events VALIDATE CONSTRAINT admin_events_event_type_check;
