-- Remove the dead stories manifest table.
-- A story arc is now expressed as story_beats + mission_id/story_beat metadata on
-- dialogues and scenes. Nothing at runtime reads the stories table.
DROP TABLE IF EXISTS stories;
-- (idx_stories_mission_id is dropped with the table)
