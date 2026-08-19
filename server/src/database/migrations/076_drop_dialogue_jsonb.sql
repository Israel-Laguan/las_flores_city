-- M32 — retire the authoring-path JSONB columns now that dialogue
-- node/leaf maps are externalized to the CDN (MinIO) via `content_url`
-- (M23). Every reader/writer was migrated to read/write `content_url`
-- before this migration is applied; the `probe:content-urls` gate must
-- report 0 gaps before running this.
--
-- Idempotent: uses DROP COLUMN IF EXISTS.

ALTER TABLE dialogue_chunks DROP COLUMN IF EXISTS nodes;
ALTER TABLE dialogue_chunks DROP COLUMN IF EXISTS leaves;
ALTER TABLE dialogue_trees DROP COLUMN IF EXISTS nodes;
