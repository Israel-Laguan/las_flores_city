-- Las Flores 2077 - Add role column to users table
-- This migration adds a role column to support admin authentication

BEGIN;

-- Add role column with default 'player' and constraint
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'player';

-- Add constraint to restrict role values
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_role_check 
    CHECK (role IN ('player', 'admin', 'developer'));

-- Create index for role column for faster admin queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Update existing dev user to have admin role if in development environment
-- This is a convenience for local development
DO $$
BEGIN
    IF current_setting('env.NODE_ENV') = 'development' THEN
        UPDATE users 
        SET role = 'admin'
        WHERE id = '00000000-0000-0000-0000-000000000001' 
        AND role = 'player';
    END IF;
END $$;

COMMIT;