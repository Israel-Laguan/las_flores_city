-- Las Flores 2077 - Add plan_solidified to admin_events CHECK (M33)

ALTER TABLE admin_events DROP CONSTRAINT IF EXISTS admin_events_event_type_check;

ALTER TABLE admin_events ADD CONSTRAINT admin_events_event_type_check CHECK (event_type IN (
    'plan_created', 'plan_refined', 'plan_staged',
    'plan_migrated', 'plan_verified', 'plan_failed', 'plan_solidified',
    'user_role_changed', 'settings_updated',
    'placeholders_filled'
));