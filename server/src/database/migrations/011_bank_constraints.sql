-- Task 2.2: Bank system — add non-negative balance constraints and extend
-- bank_transactions to support the full currency/transaction-type vocabulary.

BEGIN;

-- 1. Prevent negative balances at the engine level
ALTER TABLE users ADD CONSTRAINT chk_user_credits_non_negative      CHECK (credits >= 0);
ALTER TABLE users ADD CONSTRAINT chk_user_gold_credits_non_negative CHECK (gold_credits >= 0);

-- 2. Extend bank_transactions with currency_type (column may not exist on older envs)
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS currency_type VARCHAR(20) NOT NULL DEFAULT 'creds';

-- 3. Widen transaction_type to support the full vocabulary expected by BankService
--    (existing 'debit'/'credit' rows are preserved; new types are salary/rent/purchase/premium_exchange)
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_transaction_type_check;

-- 4. Composite index for the ledger query (user + date DESC)
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_date
    ON bank_transactions (user_id, created_at DESC);

COMMIT;
