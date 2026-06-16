-- Las Flores 2077 - Mystery State Schema (Task 3.1)
-- Adds mysteries, player_mysteries, and mystery overlay support to dialogue_overlays

BEGIN;

-- ============================================================
-- 1. Global Mysteries Table
-- ============================================================
CREATE TABLE IF NOT EXISTS mysteries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mysteries ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE mysteries ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ============================================================
-- 2. Player Participation Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS player_mysteries (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mystery_id UUID NOT NULL REFERENCES mysteries(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'INVESTIGATING',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    solved_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, mystery_id)
);

-- ============================================================
-- 3. Add mystery_id to dialogue_overlays for mystery-aware overlays
-- ============================================================
ALTER TABLE dialogue_overlays ADD COLUMN IF NOT EXISTS mystery_id UUID REFERENCES mysteries(id) ON DELETE CASCADE;

-- ============================================================
-- 4. Add nodes column for the replacement-node overlay format
--    (record of node_id -> DialogueNode, used by mystery overlays)
-- ============================================================
ALTER TABLE dialogue_overlays ADD COLUMN IF NOT EXISTS nodes JSONB NOT NULL DEFAULT '{}';

-- ============================================================
-- 5. Add gate_node_id for documentation / branch point reference
-- ============================================================
ALTER TABLE dialogue_overlays ADD COLUMN IF NOT EXISTS gate_node_id VARCHAR(100);

-- ============================================================
-- 6. Indexes for resolver queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_dialogue_overlays_mystery_id ON dialogue_overlays(mystery_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_overlays_target_mystery ON dialogue_overlays(target_tree_id, mystery_id);
CREATE INDEX IF NOT EXISTS idx_player_mysteries_user_status ON player_mysteries(user_id, status);
CREATE INDEX IF NOT EXISTS idx_mysteries_status ON mysteries(status);

COMMIT;