-- Las Flores 2077 - Validate the extended admin_events event_type CHECK (M33)
--
-- Follow-up to 060_admin_events_solidified.sql (runs after it in version order),
-- NOT VALID so the ALTER never scans/locks the table. Now that the schema
-- migration is committed, run the potentially-expensive scan once to guarantee
-- existing rows satisfy the new allowed-event set. Idempotent: re-validating an
-- already-validated constraint is a no-op.

ALTER TABLE admin_events VALIDATE CONSTRAINT admin_events_event_type_check;