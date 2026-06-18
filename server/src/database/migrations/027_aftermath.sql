-- Las Flores 2077 - Aftermath / Recycle Phase (Task 5.1)
--
-- Adds two capabilities:
--   1. `mysteries.aftermath_payload` — JSONB authored with the mystery
--      YAML, executed atomically by LeaderboardWorker when the 24h
--      Breakthrough window closes. Holds retire_vault_items +
--      remove_scene_characters directives. (retire_overlays is omitted:
--      ARCHIVED status already hides overlays from the live resolver.)
--   2. `users.is_in_simulation` + `users.simulation_mystery_id` — set by
--      POST /archive/start-simulation so /dialogue/choose can branch into
--      archive-mode resolution for legacy play.

BEGIN;

-- 1. Aftermath payload on mysteries (authored with the mystery,
--    executed at archive time by the LeaderboardWorker).
ALTER TABLE mysteries
    ADD COLUMN IF NOT EXISTS aftermath_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Simulation-play state on users (Archive Room legacy playback).
--    is_in_simulation gates getDialogState() to the archive resolver;
--    simulation_mystery_id tells it which mystery's overlays to merge.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_in_simulation BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS simulation_mystery_id UUID REFERENCES mysteries(id) ON DELETE SET NULL;

COMMIT;
