import express from 'express';
import { queryOLTP } from '../database/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCache, setCache, deleteCache } from '../database/redis.js';

export const mapRouter = express.Router();

function mapOverviewCacheKey(): string {
  return 'map:overview';
}

function districtMapCacheKey(districtSlug: string): string {
  return `map:district:${districtSlug}`;
}

// GET /map — World overview (all districts with tile counts)
mapRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const cacheKey = mapOverviewCacheKey();
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await queryOLTP(
      `SELECT 
        d.id, d.name, d.slug, d.description, d.minimap_asset_url, d.x, d.y,
        COUNT(mt.id) AS tile_count,
        COUNT(CASE WHEN mt.overlay_image_url IS NOT NULL THEN 1 END) AS landmark_count
       FROM districts d
       LEFT JOIN map_tiles mt ON mt.district_id = d.id
       GROUP BY d.id, d.name, d.slug, d.description, d.minimap_asset_url, d.x, d.y
       ORDER BY d.name`
    );

    const districts = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      minimapAssetUrl: row.minimap_asset_url,
      tileCount: parseInt(row.tile_count, 10),
      landmarkCount: parseInt(row.landmark_count, 10),
      coordinates: { x: row.x, y: row.y },
    }));

    await setCache(cacheKey, districts, 300); // 5-min TTL

    res.json({
      success: true,
      data: districts,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Get map overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load map overview',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /map/:districtSlug — Full tile grid for a district
mapRouter.get('/:districtSlug', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { districtSlug } = req.params;

    const cacheKey = districtMapCacheKey(districtSlug);
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch district info + tiles in one query
    const result = await queryOLTP(
      `SELECT 
        d.id AS district_id,
        d.name AS district_name,
        d.slug AS district_slug,
        d.description AS district_description,
        mt.id AS tile_id,
        mt.x,
        mt.y,
        mt.terrain_type,
        mt.base_image_url,
        mt.overlay_image_url,
        mt.rotation,
        mt.is_flipped,
        mt.metadata
       FROM districts d
       LEFT JOIN map_tiles mt ON mt.district_id = d.id
       WHERE d.slug = $1
       ORDER BY mt.y, mt.x`,
      [districtSlug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'District not found',
        timestamp: new Date().toISOString(),
      });
    }

    const district = result.rows[0];
    const districtData = {
      id: district.district_id,
      name: district.district_name,
      slug: district.district_slug,
      description: district.district_description,
      tiles: result.rows
        .filter(row => row.tile_id !== null)
        .map(row => ({
          id: row.tile_id,
          x: row.x,
          y: row.y,
          terrainType: row.terrain_type,
          baseImageUrl: row.base_image_url,
          overlayImageUrl: row.overlay_image_url,
          rotation: row.rotation,
          isFlipped: row.is_flipped,
          metadata: row.metadata || {},
        })),
    };

    await setCache(cacheKey, districtData, 300); // 5-min TTL

    res.json({
      success: true,
      data: districtData,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Get district map error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load district map',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /map/:districtSlug/invalidate — Invalidate map cache (requires auth)
mapRouter.post('/:districtSlug/invalidate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { districtSlug } = req.params;
    
    // Invalidate overview cache
    await deleteCache(mapOverviewCacheKey());

    // Invalidate district cache
    await deleteCache(districtMapCacheKey(districtSlug));

    res.json({
      success: true,
      data: { invalidated: true, districtSlug },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Invalidate map cache error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate map cache',
      timestamp: new Date().toISOString(),
    });
  }
});
