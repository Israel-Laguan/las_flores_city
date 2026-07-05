-- Las Flores 2077 - Add role column to users table
-- This migration adds a role column to support admin authentication

BEGIN;

-- Add role column with default 'player' and constraint
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'player';

-- Add constraint to restrict role values
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_role_check 
    CHECK (role IN ('player', 'admin', 'developer'));

-- Create index for role column for faster admin queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Dev-only convenience seed moved out of the migration path.
-- Promote the local dev user via a separate `npm run seed:dev` script
-- gated on NODE_ENV !== 'production', not inside a migration that
-- always executes against every database including production.

COMMIT;