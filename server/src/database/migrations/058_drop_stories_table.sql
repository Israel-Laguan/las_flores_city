-- Remove the dead stories manifest table.
-- A story arc is now expressed as story_beats + mission_id/story_beat metadata on
-- dialogues and scenes. Nothing at runtime reads the stories table.

-- Guard: abort if the table still holds rows that have not been archived or
-- migrated to story_beats. Only drop when empty (or already absent).
DO $$
BEGIN
  IF to_regclass('public.stories') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM stories LIMIT 1) THEN
      RAISE EXCEPTION 'Refusing to drop non-empty stories table. Archive or migrate its rows to story_beats before re-running 058.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS stories;
-- (idx_stories_mission_id is dropped with the table)
