-- Remove the dead stories manifest table.
-- A story arc is now expressed as story_beats + mission_id/story_beat metadata on
-- dialogues and scenes. Nothing at runtime reads the stories table.

-- Guard: abort if the table still holds rows that have not been archived or
-- migrated to story_beats. Only drop when empty (or already absent).
-- The check and the drop share ONE DO block: psql autocommits each statement
-- and keeps going after an error, so a separate `DROP TABLE` statement would
-- still run even if the guard above raised. Keeping both inside a single block
-- guarantees a non-empty table can never be dropped.
DO $$
BEGIN
  IF to_regclass('public.stories') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM stories LIMIT 1) THEN
      RAISE EXCEPTION 'Refusing to drop non-empty stories table. Archive or migrate its rows to story_beats before re-running 058.';
    END IF;
    EXECUTE 'DROP TABLE stories';
  END IF;
END $$;
-- (idx_stories_mission_id is dropped with the table)
