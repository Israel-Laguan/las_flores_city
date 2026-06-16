-- Las Flores 2077 - Initial OLAP Schema (Analytics)
-- Run this migration on the analytics database

BEGIN;

-- Enable UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Player events table (event sourcing for analytics)
CREATE TABLE player_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'dialogue_start',
        'dialogue_choice',
        'dialogue_end',
        'location_enter',
        'location_exit',
        'time_block_spent',
        'item_acquired',
        'item_used',
        'flag_set',
        'mystery_progress',
        'move',
        'sleep'
    )),
    event_data JSONB NOT NULL DEFAULT '{}',
    time_blocks_cost INTEGER CHECK (time_blocks_cost >= 0),
    session_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session tracking table
CREATE TABLE player_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    events_count INTEGER DEFAULT 0,
    time_blocks_spent INTEGER DEFAULT 0
);

-- Mystery progress table (for competitive mystery engine)
CREATE TABLE mystery_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    mystery_id VARCHAR(100) NOT NULL,
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    clues_discovered INTEGER DEFAULT 0,
    time_blocks_invested INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, mystery_id)
);

-- Leaderboard view (materialized for performance)
CREATE MATERIALIZED VIEW leaderboard_efficiency AS
SELECT 
    user_id,
    COUNT(DISTINCT mystery_id) AS mysteries_completed,
    SUM(time_blocks_invested) AS total_time_blocks,
    AVG(time_blocks_invested) AS avg_time_per_mystery,
    MIN(time_blocks_invested) AS best_mystery_score,
    MAX(completed_at) AS last_completed_at
FROM mystery_progress
WHERE completed_at IS NOT NULL
GROUP BY user_id
ORDER BY avg_time_per_mystery ASC;

-- Create indexes
CREATE INDEX idx_player_events_user_id ON player_events(user_id);
CREATE INDEX idx_player_events_event_type ON player_events(event_type);
CREATE INDEX idx_player_events_created_at ON player_events(created_at);
CREATE INDEX idx_player_events_session_id ON player_events(session_id);
CREATE INDEX idx_player_sessions_user_id ON player_sessions(user_id);
CREATE INDEX idx_player_sessions_started_at ON player_sessions(started_at);
CREATE INDEX idx_mystery_progress_user_id ON mystery_progress(user_id);
CREATE INDEX idx_mystery_progress_mystery_id ON mystery_progress(mystery_id);
CREATE INDEX idx_mystery_progress_completed_at ON mystery_progress(completed_at);

-- Create function to refresh leaderboard
CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_efficiency;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Create trigger to refresh leaderboard when mystery completes
CREATE TRIGGER refresh_leaderboard_on_completion
    AFTER INSERT OR UPDATE ON mystery_progress
    FOR EACH ROW
    WHEN (NEW.completed_at IS NOT NULL)
    EXECUTE FUNCTION refresh_leaderboard();

-- Create function to update session duration
CREATE OR REPLACE FUNCTION update_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at));
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply session duration trigger
CREATE TRIGGER update_session_duration_trigger
    BEFORE UPDATE ON player_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_duration();

COMMIT;
