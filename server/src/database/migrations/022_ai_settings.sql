-- Las Flores 2077 - BYOK AI Settings (Task 4.1)
-- Adds encrypted AI API key storage to users table.
-- The key is split-encrypted: the browser holds the decryption key in localStorage,
-- while the server stores only the ciphertext. Zero LLM cost for game servers.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ai_key_ciphertext TEXT,
    ADD COLUMN IF NOT EXISTS ai_key_iv TEXT,
    ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
