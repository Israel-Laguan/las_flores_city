-- Las Flores 2077 - Allow text content IDs in migration_log
--
-- Story_beat uses slugs (e.g., 'prologue', 'act1_awakening') as primary keys
-- rather than UUIDs. This migration changes migration_log.content_id from
-- UUID to TEXT to support both UUIDs (characters, scenes, etc.) and slugs
-- (story_beat).

BEGIN;

-- Change content_id from UUID to TEXT
ALTER TABLE migration_log ALTER COLUMN content_id TYPE VARCHAR(500);

-- Existing UUIDs remain valid (they're just strings in TEXT type)

COMMIT;