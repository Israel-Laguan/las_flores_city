-- Las Flores 2077 - Add plan_solidified to admin_events CHECK (M33)
--
-- Add the constraint with NOT VALID so the ALTER never takes a full table scan
-- (locking writes) against existing rows. Re-validating an already-validated
-- constraint is cheap and idempotent. The scan/validation happens in the
-- follow-up migration 059_admin_events_validate.sql once this migration is
-- committed.

ALTER TABLE admin_events DROP CONSTRAINT IF EXISTS admin_events_event_type_check;

ALTER TABLE admin_events ADD CONSTRAINT admin_events_event_type_check CHECK (event_type IN (
    'plan_created', 'plan_refined', 'plan_staged',
    'plan_migrated', 'plan_verified', 'plan_failed', 'plan_solidified',
    'user_role_changed', 'settings_updated',
    'placeholders_filled'
)) NOT VALID;