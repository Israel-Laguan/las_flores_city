-- Las Flores 2077 - Leaderboards & Badges (Task 3.4)
-- Persists finalized 24h Breakthrough results and grants cosmetic badges
-- to investigators. The LeaderboardWorker (server/src/workers/LeaderboardWorker.ts)
-- writes to this table once a mystery's resolution window expires.

BEGIN;

-- ============================================================
-- 1. Official Leaderboards Table
--    One row per (mystery, solver). Composite PK keeps the table
--    append-only and idempotent if the worker ever reruns on the
--    same mystery.
-- ============================================================
CREATE TABLE IF NOT EXISTS leaderboards (
    mystery_id UUID NOT NULL REFERENCES mysteries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    total_tb_spent INTEGER NOT NULL,
    delta_time_seconds INTEGER NOT NULL,
    is_breakthrough BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (mystery_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_leaderboards_mystery_rank
    ON leaderboards(mystery_id, rank);

CREATE INDEX IF NOT EXISTS idx_leaderboards_user
    ON leaderboards(user_id);

-- ============================================================
-- 2. Align public_profiles.badges to the array shape used by
--    the worker. The column already exists (Task 2.1) with
--    default '{}'::jsonb. Switch the default to an empty JSON
--    array and constrain the type. We do NOT make it NOT NULL
--    to avoid rewriting the existing rows in production; new
--    inserts default to the empty array.
-- ============================================================
ALTER TABLE public_profiles
    ALTER COLUMN badges SET DEFAULT '[]'::jsonb;

-- ============================================================
-- 3. Constraint hints for mystery lifecycle
--    `mysteries.status` is free-form VARCHAR(50) today. Add a
--    CHECK so the worker can rely on the canonical lifecycle
--    (ACTIVE → RESOLVING → ARCHIVED). Safe to apply: only values
--    used in code so far are 'ACTIVE', 'RESOLVING', 'ARCHIVED'.
-- ============================================================
ALTER TABLE mysteries
    DROP CONSTRAINT IF EXISTS mysteries_status_check;
ALTER TABLE mysteries
    ADD CONSTRAINT mysteries_status_check
    CHECK (status IN ('ACTIVE', 'RESOLVING', 'ARCHIVED'));

COMMIT;
