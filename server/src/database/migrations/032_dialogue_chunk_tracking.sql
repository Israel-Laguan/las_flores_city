-- Las Flores 2077 - Dialogue Chunk Tracking
-- Adds current_chunk_id to player_dialogue_states for chunk-based dialogue runtime.
-- Part of Task 7.4: Runtime Rewrite & Unified Validation
--
-- Requirements: 8.1, 8.2
-- - Track current chunk position in addition to current node
-- - Foreign key reference to dialogue_chunks(id)

BEGIN;

-- Add current_chunk_id column to player_dialogue_states
ALTER TABLE player_dialogue_states
  ADD COLUMN IF NOT EXISTS current_chunk_id UUID REFERENCES dialogue_chunks(id) ON DELETE SET NULL;

-- Create index for efficient chunk-based queries
CREATE INDEX IF NOT EXISTS idx_player_dialogue_states_chunk_id
  ON player_dialogue_states(current_chunk_id);

COMMIT;
