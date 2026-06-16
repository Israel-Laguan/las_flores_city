-- Las Flores 2077 - Migrate player_sms_threads to character-keyed threads
--
-- Replaces the legacy (user_id, thread_id VARCHAR) shape with
-- (user_id, character_id UUID) so each character owns a single thread.
-- Adds chat_history JSONB for the rendered transcript, current_node_id for
-- the active dialogue node, and unread for badge state. The dialogue node
-- resolution uses the existing JSONB dialogue_trees structure; the
-- `current_node_id` is a VARCHAR(100) matching the JSONB key in
-- dialogue_trees.nodes.
--
-- Apply to the OLTP database only.

BEGIN;

ALTER TABLE player_sms_threads
    ADD COLUMN IF NOT EXISTS character_id UUID REFERENCES characters(id) ON DELETE CASCADE;

ALTER TABLE player_sms_threads
    ADD COLUMN IF NOT EXISTS current_node_id VARCHAR(100);

ALTER TABLE player_sms_threads
    ADD COLUMN IF NOT EXISTS unread BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE player_sms_threads
    ADD COLUMN IF NOT EXISTS chat_history JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE player_sms_threads
    ADD COLUMN IF NOT EXISTS last_npc_message_at TIMESTAMP WITH TIME ZONE;

-- Drop legacy unique constraint and the now-unused columns. The table is
-- empty in the current dev DB (verified: 0 rows), so this is a structural
-- migration with no data preservation needed.
ALTER TABLE player_sms_threads
    DROP CONSTRAINT IF EXISTS player_sms_threads_user_id_thread_id_key;

ALTER TABLE player_sms_threads
    DROP COLUMN IF EXISTS thread_id;

ALTER TABLE player_sms_threads
    DROP COLUMN IF EXISTS messages;

ALTER TABLE player_sms_threads
    DROP COLUMN IF EXISTS last_message_at;

-- Add the new unique constraint now that thread_id is gone. Idempotent
-- guard so re-running the migration on a partially-applied DB is safe.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'player_sms_threads_user_character_key'
    ) THEN
        ALTER TABLE player_sms_threads
            ADD CONSTRAINT player_sms_threads_user_character_key UNIQUE (user_id, character_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_player_sms_threads_user_id
    ON player_sms_threads(user_id);

CREATE INDEX IF NOT EXISTS idx_player_sms_threads_character_id
    ON player_sms_threads(character_id);

COMMIT;
