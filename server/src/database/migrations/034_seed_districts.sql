-- District metadata seed
-- Replaces the standalone server/scripts/seed_districts.sql runner.
-- Inserted after 033 created the districts table and added district_id to scenes.
-- Uses INSERT ... ON CONFLICT DO UPDATE so it works whether a district
-- was auto-created by the migration or doesn't exist yet.
--
-- Coordinate pairs are calibrated so travel cost = floor(dist/2) + 1
-- matches the desired matrix:
--   Same district=0, Downtown↔Old Town=1, Downtown↔Commercial=1,
--   Downtown↔Industrial=2, Old Town↔Commercial=1, Old Town↔Industrial=2,
--   Commercial↔Industrial=1

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

INSERT INTO districts (name, slug, description, minimap_asset_url, x, y)
VALUES ('South', 'south', 'Rural and historical district encompassing Old Las Flores and agricultural communities.', '/assets/minimap/south.png', 2, 0)
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    minimap_asset_url = EXCLUDED.minimap_asset_url,
    x = EXCLUDED.x,
    y = EXCLUDED.y;

INSERT INTO districts (name, slug, description, minimap_asset_url, x, y)
VALUES ('City', 'city', 'Urban central business district — administrative, financial, and cultural heart of Las Flores.', '/assets/minimap/city.png', 0, 2)
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    minimap_asset_url = EXCLUDED.minimap_asset_url,
    x = EXCLUDED.x,
    y = EXCLUDED.y;
