-- Las Flores 2077 - Sleep Reset Schema (Task 2.2)
-- Adds current_day to users if not exists, creates bank_transactions if not exists

BEGIN;

-- ============================================================
-- 2.2.1a: In-Game Day Column
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_day INTEGER NOT NULL DEFAULT 1;

-- ============================================================
-- 2.2.3c: Banking Ledger Table
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('debit', 'credit', 'transfer')),
    amount INTEGER NOT NULL,
    description VARCHAR(200) NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_current_day ON users(current_day);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_id ON bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_created_at ON bank_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_created ON bank_transactions(user_id, created_at);

-- ============================================================
-- Seed test user with current_day = 1
-- ============================================================

UPDATE users SET current_day = 1 WHERE id = '00000000-0000-0000-0000-000000000001';

COMMIT;
