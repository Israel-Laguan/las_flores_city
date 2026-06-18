-- Las Flores 2077 - Vault Signed URL Delivery (Task 4.4)
-- Splits the single `media_url` column into a public SFW `thumbnail_url`
-- (used for the Vault grid) and a private `media_path` (used to build a
-- short-lived CloudFront/Pushr signed URL when the player opens the modal).
--
-- The migration is additive and safe to re-run:
--   * RENAME only happens if `thumbnail_url` does not already exist
--   * ADD COLUMN uses IF NOT EXISTS
--   * Backfills `media_path` from the renamed `thumbnail_url` so existing
--     rows remain functional after a partial application
--
-- Companion changes:
--   * shared/src/schemas/vault.ts: VaultItemSchema now exposes
--     `thumbnail_url` and `media_path` (with `media_url` removed)
--   * server/src/content/upsert.ts::upsertVaultItem: writes the new columns
--   * server/src/services/MediaSigner.ts: CloudFront-style signer
--   * server/src/routes/vault.ts: GET /vault returns thumbnailUrl;
--     GET /vault/media/:itemId signs media_path after entitlement check

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vault_items' AND column_name = 'media_url'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vault_items' AND column_name = 'thumbnail_url'
  ) THEN
    ALTER TABLE vault_items RENAME COLUMN media_url TO thumbnail_url;
  END IF;
END $$;

ALTER TABLE vault_items
  ADD COLUMN IF NOT EXISTS media_path VARCHAR(512) NOT NULL DEFAULT '';

-- Backfill: for rows that pre-date the split, treat the renamed
-- thumbnail_url as the media_path. The application will re-upsert
-- these from YAML on the next content migration.
UPDATE vault_items
   SET media_path = thumbnail_url
 WHERE media_path = '' AND thumbnail_url <> '';

COMMIT;
