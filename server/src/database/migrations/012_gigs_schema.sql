-- Task 2.3: Gig Engine — user_reputations table + gig_completed OLAP event type

BEGIN;

CREATE TABLE IF NOT EXISTS user_reputations (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    faction VARCHAR(100) NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, faction)
);

CREATE INDEX IF NOT EXISTS idx_user_reputations_user_id ON user_reputations(user_id);

COMMIT;
