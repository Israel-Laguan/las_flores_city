-- Up Migration

-- 1. Add CHECK constraints to the users table to prevent negative balances at the engine level
ALTER TABLE users ADD CONSTRAINT chk_user_credits_non_negative      CHECK (credits >= 0);
ALTER TABLE users ADD CONSTRAINT chk_user_gold_credits_non_negative CHECK (gold_credits >= 0);

-- 2. Extend bank_transactions with currency_type column (added to existing table from 007_sleep_reset_schema)
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS currency_type VARCHAR(20) NOT NULL DEFAULT 'creds';

-- 3. Drop the old restrictive transaction_type check so the wider vocabulary is accepted
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_transaction_type_check;

-- 4. Composite index for fast chronological queries per user
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_date
    ON bank_transactions (user_id, created_at DESC);
