-- Las Flores 2077 - Schema Migrations Tracking Table
-- This migration creates the schema_migrations table to track which SQL
-- migration files have been applied to each database.
-- Run this on BOTH OLTP and OLAP databases.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(10) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    checksum VARCHAR(64),
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    database_name VARCHAR(50) NOT NULL DEFAULT current_database(),
    UNIQUE(version, database_name)
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON schema_migrations(filename);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_database ON schema_migrations(database_name);

COMMIT;
