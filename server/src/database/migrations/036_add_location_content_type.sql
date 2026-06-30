-- Las Flores 2077 - Add 'location' to migration_log.content_type CHECK
--
-- The content engine (migrate.ts, upsert.ts) already recognises 'location'
-- as a content type for YAML files under content/locations/. The original
-- CHECK constraint (001_initial_schema.sql:201) and its extension in
-- 024_marketplace.sql both omitted 'location', causing every location YAML
-- file to fail content migration with:
--
--   new row for relation "migration_log" violates check constraint
--   "migration_log_content_type_check"
--
-- This migration adds 'location' to the whitelist using the same
-- drop-recreate pattern as 024_marketplace.sql:97-111.

BEGIN;

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
        'mystery',
        'shop_item',
        'location'
    ));

COMMIT;