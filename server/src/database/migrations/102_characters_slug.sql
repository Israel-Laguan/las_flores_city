-- M102: Add slug column to characters table.
-- The slug is derived from the content folder name (e.g. "carlos_mendoza"
-- from content/characters/carlos_mendoza/char_carlos_mendoza.yaml) and
-- written by the content migration. It provides the stable textual identity
-- that scene composition uses for cast references (SC-604).
--
-- Existing rows get a NULL slug until the next content migration backfills
-- them. The UNIQUE constraint is added as a partial index (WHERE slug IS
-- NOT NULL) so pre-existing rows without a slug don't conflict.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS slug TEXT;

-- Partial unique index: only non-NULL slugs must be unique. This lets the
-- column be nullable during the backfill window while still enforcing
-- uniqueness for any slug that IS written.
CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_slug_unique
  ON characters (slug) WHERE slug IS NOT NULL;


