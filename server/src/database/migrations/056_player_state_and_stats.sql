-- ============================================================
-- 056_player_state_and_stats.sql
--
-- Introduces two typed state columns on player_states to replace
-- the overloaded `flags` JSONB bag:
--
--   state  JSONB  — categorical story variables (string values)
--                   e.g. awakening_path: "understood", sofia_status: "romanced"
--                   Write: overwrite-merge (state || delta) via mergeState()
--                   Read:  string equality (required_state / hidden_if_state)
--
--   stats  JSONB  — accumulating numeric counters (number values)
--                   e.g. sofia_trust: 10
--                   Write: ADDITIVE merge (coalesce(existing,0) + delta) via
--                          mergeStats() — the one place the established `||`
--                          overwrite pattern does NOT suffice.
--                   Read:  op:number comparison (required_stats / hidden_if_stats)
--
-- The existing `flags` JSONB column stays as the boolean on/off bag
-- (marco_contact_made: true, etc.) — backwards compatible. Existing
-- INSERTs that omit state/stats get DEFAULT '{}' automatically.
-- Idempotent: safe to re-run.
-- ============================================================

BEGIN;

ALTER TABLE player_states ADD COLUMN IF NOT EXISTS state JSONB NOT NULL DEFAULT '{}';
ALTER TABLE player_states ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{}';

COMMIT;
