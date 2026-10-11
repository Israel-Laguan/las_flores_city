-- 108_runtime_player_state.sql
-- SC-501 (SC-M3 T3): durable player state, in the `runtime` schema.
--
--   runtime.games           — one row per "new game" (server-generated game_id, owned by a player)
--   runtime.game_flags      — flags a player has set in a game. A row's existence means "set"
--   runtime.game_resolution — the ONE current scene resolution of a game (minimal progress cursor)
--
-- Decisions (product, authoritative):
--   * State is keyed by player AND game. A new game starts with empty flags; old games' rows are
--     kept as history.
--   * Flags are permanent. Once set they can never be unset, so there is no `is_set` column, no
--     update path and no delete path. Write-once is a GRANT, not a convention: runtime has
--     SELECT + INSERT on game_flags and games, never UPDATE/DELETE. The only way to "revert" is a
--     new game.
--   * A "session" (the span between saves) is client-owned and invisible here: only the saved end
--     result lives in these tables. No idle timeout, no reaper.
--   * No cross-schema foreign keys (architecture §4). Later tables may carry a pinned revision id,
--     but never an FK to publish: a missing revision is a typed error at read time. The ONLY FKs
--     below stay inside the `runtime` schema (flags and resolution -> games).
--   * pinned_cast and a separate progress table are deferred to SC-507/506 (A2 stays open).
--     `game_resolution` is the minimal progress cursor.
--
-- runtime.flag_state (096) is untouched: it is planning-written and keyed differently.
--
-- Ownership note (see 104/105): tables are owned by the migration runner (`las_flores`). Schema
-- default privileges (095) would hand `runtime` ALL on new tables, so every table is REVOKEd and
-- then granted exactly what it needs.
--
-- Transactional DDL for the OLTP database (`oltp` array: one file = one database).
-- Idempotent. Forward-only. Depends on 095.

CREATE TABLE IF NOT EXISTS runtime.games (
  game_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Lets child tables prove a game belongs to the player they claim, with a same-schema FK.
  CONSTRAINT games_player_game_key UNIQUE (player_id, game_id)
);

CREATE INDEX IF NOT EXISTS games_player_idx ON runtime.games (player_id);

CREATE TABLE IF NOT EXISTS runtime.game_flags (
  player_id UUID NOT NULL,
  game_id UUID NOT NULL,
  flag_slug TEXT NOT NULL
    CHECK (char_length(flag_slug) <= 256 AND flag_slug ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'),
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, game_id, flag_slug),
  CONSTRAINT game_flags_game_fk FOREIGN KEY (player_id, game_id) REFERENCES runtime.games (player_id, game_id)
);

CREATE TABLE IF NOT EXISTS runtime.game_resolution (
  player_id UUID NOT NULL,
  game_id UUID NOT NULL,
  scene_slug TEXT NOT NULL CHECK (scene_slug <> ''),
  artifact_id TEXT NOT NULL CHECK (artifact_id ~ '^[0-9a-f]{64}$'),
  -- No foreign key: revisions live in `publish` and no revision GC exists.
  revision_id UUID NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, game_id),
  CONSTRAINT game_resolution_game_fk FOREIGN KEY (player_id, game_id) REFERENCES runtime.games (player_id, game_id)
);

-- ============================================================
-- Access control: runtime only, write-once flags
-- ============================================================

REVOKE ALL ON TABLE runtime.games, runtime.game_flags, runtime.game_resolution FROM PUBLIC;
REVOKE ALL ON TABLE runtime.games, runtime.game_flags, runtime.game_resolution FROM las_flores;
REVOKE ALL ON TABLE runtime.games, runtime.game_flags, runtime.game_resolution FROM planning;
REVOKE ALL ON TABLE runtime.games, runtime.game_flags, runtime.game_resolution FROM runtime;

GRANT SELECT, INSERT ON TABLE runtime.games, runtime.game_flags TO runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE runtime.game_resolution TO runtime;

COMMENT ON TABLE runtime.games IS 'SC-501: one row per new game (server-generated id). Old games are kept as history. runtime SELECT+INSERT only.';
COMMENT ON TABLE runtime.game_flags IS 'SC-501: flags set in a game. Existence = set. Permanent: runtime has no UPDATE/DELETE. No cross-schema FK.';
COMMENT ON TABLE runtime.game_resolution IS 'SC-501: the single current scene resolution per game (minimal progress cursor). revision_id has no FK to publish by design.';
