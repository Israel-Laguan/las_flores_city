-- Las Flores 2077 - Admin Events (M17)
-- OLAP table for Story Builder telemetry and admin audit events.
-- Separate from player_events for cleaner queries and security (per AGENTS.md).

CREATE TABLE admin_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
        'plan_created', 'plan_refined', 'plan_staged',
        'plan_migrated', 'plan_verified', 'plan_failed',
        'user_role_changed', 'settings_updated',
        'placeholders_filled'
    )),
    event_data JSONB NOT NULL DEFAULT '{}',
    plan_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_events_event_type ON admin_events(event_type);
CREATE INDEX idx_admin_events_plan_id ON admin_events(plan_id);
CREATE INDEX idx_admin_events_created_at ON admin_events(created_at);
