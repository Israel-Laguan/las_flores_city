-- District system: relational table with grid coordinates for distance-based travel cost.
-- Scenes link to districts via foreign key, replacing the old string `district` column
-- and the `district_travel_costs` lookup matrix.
-- District metadata (coordinates, slugs, descriptions) is seeded separately via
-- server/scripts/seed_districts.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    minimap_asset_url VARCHAR(500),
    x INTEGER NOT NULL,
    y INTEGER NOT NULL
);

-- Link scenes to districts
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS district_id UUID REFERENCES districts(id);

-- Auto-create a default district for null/empty districts
INSERT INTO districts (name, slug, x, y)
VALUES ('Unknown', 'unknown', 0, 0)
ON CONFLICT (name) DO NOTHING;

-- Only migrate from old string column if it still exists (idempotent re-run)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scenes' AND column_name='district') THEN

    INSERT INTO districts (name, slug, x, y)
    SELECT DISTINCT
        s.district,
        lower(regexp_replace(s.district, '\s+', '-', 'g')),
        0, 0
    FROM scenes s
    WHERE s.district IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM districts d WHERE d.name = s.district);

    UPDATE scenes s SET district_id = d.id
    FROM districts d
    WHERE (s.district = d.name OR (s.district IS NULL AND d.name = 'Unknown')) AND s.district_id IS NULL;

  END IF;
END
$$;

-- Make district_id NOT NULL after backfill (safe to run repeatedly)
ALTER TABLE scenes ALTER COLUMN district_id SET NOT NULL;

-- Drop the old string district column
ALTER TABLE scenes DROP COLUMN IF EXISTS district;

-- Drop the old lookup table in case it was created manually / from a prior attempt
DROP TABLE IF EXISTS district_travel_costs;

COMMIT;
