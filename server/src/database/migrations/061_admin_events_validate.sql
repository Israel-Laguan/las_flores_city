-- Las Flores 2077 - Validate the extended admin_events event_type CHECK (M33)
--
-- Follow-up to 060_admin_events_solidified.sql (runs after it in version order).
-- 060 added the CHECK with NOT VALID, which defers scanning existing rows so the
-- ADD CONSTRAINT does not scan them at DDL time. Note: the ALTER in 060 still
-- acquires a table lock; NOT VALID only skips the validation scan. Now that the
-- schema migration is committed, run the potentially-expensive scan once to
-- guarantee existing rows satisfy the new allowed-event set. Idempotent:
-- re-validating an already-validated constraint is a no-op.

ALTER TABLE admin_events VALIDATE CONSTRAINT admin_events_event_type_check;