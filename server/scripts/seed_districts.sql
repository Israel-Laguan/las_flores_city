-- District metadata seed
-- Run after migration 033 has been applied.
-- Uses INSERT ... ON CONFLICT DO UPDATE so it works whether the district
-- was auto-created by the migration or doesn't exist yet.
--
-- Coordinate pairs are calibrated so travel cost = floor(dist/2) + 1
-- matches the desired matrix:
--   Same district=0, Downtown↔Old Town=1, Downtown↔Commercial=1,
--   Downtown↔Industrial=2, Old Town↔Commercial=1, Old Town↔Industrial=2,
--   Commercial↔Industrial=1
--
-- Usage: psql $DATABASE_URL -f server/scripts/seed_districts.sql

INSERT INTO districts (name, slug, description, minimap_asset_url, x, y)
VALUES ('Downtown', 'downtown', 'The heart of Las Flores — gleaming towers of commerce and control.', '/assets/minimap/downtown.png', 0, 0)
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    minimap_asset_url = EXCLUDED.minimap_asset_url,
    x = EXCLUDED.x,
    y = EXCLUDED.y;

INSERT INTO districts (name, slug, description, minimap_asset_url, x, y)
VALUES ('Old Town', 'old-town', 'Historic narrow streets where the city remembers its past.', '/assets/minimap/old_town.png', 1, 0)
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    minimap_asset_url = EXCLUDED.minimap_asset_url,
    x = EXCLUDED.x,
    y = EXCLUDED.y;

INSERT INTO districts (name, slug, description, minimap_asset_url, x, y)
VALUES ('Commercial', 'commercial', 'Shopping and entertainment hub that never sleeps.', '/assets/minimap/commercial.png', 0, 1)
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    minimap_asset_url = EXCLUDED.minimap_asset_url,
    x = EXCLUDED.x,
    y = EXCLUDED.y;

INSERT INTO districts (name, slug, description, minimap_asset_url, x, y)
VALUES ('Industrial', 'industrial', 'Factory zone and worker housing on the city fringe.', '/assets/minimap/industrial.png', 1, 2)
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    minimap_asset_url = EXCLUDED.minimap_asset_url,
    x = EXCLUDED.x,
    y = EXCLUDED.y;
