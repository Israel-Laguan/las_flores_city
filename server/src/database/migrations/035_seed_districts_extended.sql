-- Extended district seeds for South and City
-- These districts were added to 034 but existing environments missed them
-- due to migration runners skipping already-applied migrations.

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

-- Collision-avoidance: this migration provides idempotent INSERTs for districts
-- that may already exist, ensuring consistent x/y coordinates across environments.