-- Las Flores 2077 - Vault System Schema (Task 3.2)
-- Static vault items + per-player unlock inventory

BEGIN;

CREATE TABLE IF NOT EXISTS vault_items (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    media_url VARCHAR(512) NOT NULL,
    item_type VARCHAR(50) NOT NULL DEFAULT 'clue'
        CHECK (item_type IN ('clue', 'memento', 'premium_cg')),
    mystery_id UUID REFERENCES mysteries(id) ON DELETE SET NULL,
    requires_signed_url BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_vault (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_player_vault_user ON player_vault(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_items_mystery ON vault_items(mystery_id);

CREATE OR REPLACE FUNCTION update_vault_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_vault_items_updated_at ON vault_items;
CREATE TRIGGER update_vault_items_updated_at
    BEFORE UPDATE ON vault_items
    FOR EACH ROW EXECUTE FUNCTION update_vault_items_updated_at();

COMMIT;
