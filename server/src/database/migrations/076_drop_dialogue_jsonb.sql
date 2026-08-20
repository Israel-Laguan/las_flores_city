-- M32 — retire the authoring-path JSONB columns now that dialogue
-- node/leaf maps are externalized to the CDN (MinIO) via `content_url`
-- (M23). Every reader/writer was migrated to read/write `content_url`
-- before this migration is applied; the `probe:content-urls` gate must
-- report 0 gaps before running this.
--
-- Idempotent: uses DROP COLUMN IF EXISTS.
--
-- PRECONDITION: schema:migrate MUST run the content migration
-- (probe:content-urls preflight) BEFORE this migration file. The migration
-- runner (migrate.ts) must verify every dialogue_trees/dialogue_chunks row has
-- a reachable content_url before allowing the JSONB columns to be dropped.
-- A row with a missing or unreachable URL loses its only payload once the
-- JSONB fallback is gone.

ALTER TABLE dialogue_chunks DROP COLUMN IF EXISTS nodes;
ALTER TABLE dialogue_chunks DROP COLUMN IF EXISTS leaves;
ALTER TABLE dialogue_trees DROP COLUMN IF EXISTS nodes;
