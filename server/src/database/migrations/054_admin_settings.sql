-- Las Flores 2077 - System Settings (M17)
-- OLTP table for admin-configurable system preferences.

CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    updated_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings
INSERT INTO system_settings (key, value, description) VALUES
    ('content_pipeline.content_dir', '"content"', 'Content directory path'),
    ('content_pipeline.validation_strict', 'false', 'Enable strict validation'),
    ('features.async_execution', 'false', 'Enable async plan execution (M18)')
ON CONFLICT (key) DO NOTHING;
