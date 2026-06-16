-- Task 2.3: Gig Engine — gigs table + user_reputations table + gig_completed OLAP event type

BEGIN;

-- ============================================================
-- Gigs table (for storing gig content from YAML)
-- ============================================================

CREATE TABLE IF NOT EXISTS gigs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    time_block_cost INTEGER NOT NULL CHECK (time_block_cost >= 1 AND time_block_cost <= 48),
    credit_payout INTEGER NOT NULL CHECK (credit_payout >= 1),
    reputation_target VARCHAR(100),
    reputation_reward INTEGER,
    location_restriction_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gigs_id ON gigs(id);
CREATE INDEX IF NOT EXISTS idx_gigs_location_restriction ON gigs(location_restriction_id);

-- ============================================================
-- User reputations table (for faction reputation tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_reputations (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    faction VARCHAR(100) NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, faction)
);

CREATE INDEX IF NOT EXISTS idx_user_reputations_user_id ON user_reputations(user_id);

-- ============================================================
-- Trigger for updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_gigs_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_gigs_updated_at ON gigs;
CREATE TRIGGER update_gigs_updated_at BEFORE UPDATE ON gigs FOR EACH ROW EXECUTE FUNCTION update_gigs_updated_at_column();

COMMIT;
