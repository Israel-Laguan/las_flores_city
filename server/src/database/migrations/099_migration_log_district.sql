-- 099_migration_log_district.sql
-- Add 'district' to migration_log.content_type CHECK.
--
-- bf1f6447 made `district` a content type (content/districts/**), but the
-- whitelist last rewritten in 046_stories.sql omits it, so every district YAML
-- failed content migration with:
--
--   new row for relation "migration_log" violates check constraint
--   "migration_log_content_type_check"
--
-- Same drop-recreate pattern as 036_add_location_content_type.sql.
-- Added NOT VALID (skips the existing-row scan at DDL time); validated by
-- 100_migration_log_district_validate.sql once this migration has committed.
-- Transactional and idempotent.

ALTER TABLE migration_log
    DROP CONSTRAINT IF EXISTS migration_log_content_type_check;

ALTER TABLE migration_log
    ADD CONSTRAINT migration_log_content_type_check
    CHECK (content_type IN (
        'character',
        'dialogue',
        'overlay',
        'scene',
        'gig',
        'vault',
        'mission',
        'story',
        'shop_item',
        'location',
        'map_tile',
        'story_beat',
        'district'
    )) NOT VALID;
