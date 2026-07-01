-- Las Flores 2077 - Tile-based city map system
-- Adds map_tiles table and extends migration_log.content_type CHECK

BEGIN;

-- Map tiles table: terrain + overlay grid per district
CREATE TABLE IF NOT EXISTS map_tiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id UUID NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    terrain_type VARCHAR(50) NOT NULL,
    base_image_url VARCHAR(500),
    overlay_image_url VARCHAR(500),
    rotation INTEGER DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),
    is_flipped BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(district_id, x, y)
);

CREATE INDEX idx_map_tiles_district ON map_tiles(district_id);
CREATE INDEX idx_map_tiles_position ON map_tiles(district_id, x, y);

-- Extend migration_log.content_type CHECK to include 'map_tile'
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
        'location',
        'map_tile'
    ));

COMMIT;