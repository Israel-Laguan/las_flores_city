import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { queryOLTP } from '../database/connection.js';

/**
 * Admin List Views Router
 *
 * Provides read-only paginated list and detail endpoints for dialogue trees,
 * scenes, and characters so authors can browse content from the admin UI.
 *
 * All routes require admin/developer role (authAndAdminMiddleware).
 */
export const adminListViewsRouter = express.Router();

adminListViewsRouter.use(authAndAdminMiddleware);

// ---------------------------------------------------------------------------
// Shared pagination helper
// ---------------------------------------------------------------------------

function parsePagination(
  query: Record<string, unknown>
): { page: number; pageSize: number } | { error: string } {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 50);
  if (!Number.isInteger(page) || page < 1)
    return { error: 'page must be a positive integer' };
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200)
    return { error: 'pageSize must be an integer between 1 and 200' };
  return { page, pageSize };
}

// ---------------------------------------------------------------------------
// GET /dialogues — paginated list of dialogue trees
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/dialogues', async (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if ('error' in pagination) {
    return res.status(400).json({
      success: false,
      error: pagination.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await queryOLTP(
      `SELECT count(*)::int FROM dialogue_trees`
    );
    const total: number = countResult.rows[0].count;

    const listResult = await queryOLTP(
      `SELECT
        id,
        name,
        description,
        (SELECT count(*) FROM jsonb_object_keys(nodes))::int AS "nodeCount",
        metadata->>'story_beat' AS "beatAssociation",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM dialogue_trees
      ORDER BY name ASC
      LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return res.json({
      success: true,
      data: {
        items: listResult.rows,
        total,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-list-views] GET /dialogues error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dialogues',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /dialogues/:id — single dialogue tree
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/dialogues/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryOLTP(
      `SELECT * FROM dialogue_trees WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Dialogue not found: "${id}"`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-list-views] GET /dialogues/${id} error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dialogue',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /scenes — paginated list of scenes
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/scenes', async (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if ('error' in pagination) {
    return res.status(400).json({
      success: false,
      error: pagination.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await queryOLTP(
      `SELECT count(*)::int FROM scenes`
    );
    const total: number = countResult.rows[0].count;

    const listResult = await queryOLTP(
      `SELECT
        id,
        name,
        description,
        district,
        metadata->>'required_story_beat' AS "requiredStoryBeat",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM scenes
      ORDER BY name ASC
      LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return res.json({
      success: true,
      data: {
        items: listResult.rows,
        total,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-list-views] GET /scenes error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch scenes',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /scenes/:id — single scene
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/scenes/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryOLTP(
      `SELECT * FROM scenes WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Scene not found: "${id}"`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-list-views] GET /scenes/${id} error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch scene',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /characters — paginated list of characters
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/characters', async (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if ('error' in pagination) {
    return res.status(400).json({
      success: false,
      error: pagination.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await queryOLTP(
      `SELECT count(*)::int FROM characters`
    );
    const total: number = countResult.rows[0].count;

    const listResult = await queryOLTP(
      `SELECT
        id,
        name,
        title,
        description,
        CASE
          WHEN portrait_urls IS NOT NULL
           AND jsonb_array_length(portrait_urls) > 0
          THEN 'ready'
          ELSE 'missing'
        END AS "portraitStatus",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM characters
      ORDER BY name ASC
      LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return res.json({
      success: true,
      data: {
        items: listResult.rows,
        total,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-list-views] GET /characters error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch characters',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /characters/:id — single character
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/characters/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryOLTP(
      `SELECT * FROM characters WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Character not found: "${id}"`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-list-views] GET /characters/${id} error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch character',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /mysteries — paginated list of mysteries
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/mysteries', async (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if ('error' in pagination) {
    return res.status(400).json({
      success: false,
      error: pagination.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await queryOLTP(
      `SELECT count(*)::int FROM mysteries`
    );
    const total: number = countResult.rows[0].count;

    const listResult = await queryOLTP(
      `SELECT
        id,
        title,
        description,
        status,
        expires_at AS "expiresAt",
        created_at AS "createdAt"
      FROM mysteries
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return res.json({
      success: true,
      data: {
        items: listResult.rows,
        total,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-list-views] GET /mysteries error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch mysteries',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /mysteries/:id — single mystery
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/mysteries/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryOLTP(
      `SELECT * FROM mysteries WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Mystery not found: "${id}"`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-list-views] GET /mysteries/${id} error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch mystery',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /overlays — paginated list of dialogue overlays
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/overlays', async (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if ('error' in pagination) {
    return res.status(400).json({
      success: false,
      error: pagination.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await queryOLTP(
      `SELECT count(*)::int FROM dialogue_overlays`
    );
    const total: number = countResult.rows[0].count;

    const listResult = await queryOLTP(
      `SELECT
        do.id,
        do.name,
        do.target_tree_id AS "targetTreeId",
        do.is_nsfw AS "isNsfw",
        do.priority,
        do.mystery_id AS "mysteryId",
        do.gate_node_id AS "gateNodeId",
        dt.name AS "targetTreeName",
        m.title AS "mysteryTitle",
        do.created_at AS "createdAt"
      FROM dialogue_overlays do
      LEFT JOIN dialogue_trees dt ON do.target_tree_id = dt.id
      LEFT JOIN mysteries m ON do.mystery_id = m.id
      ORDER BY do.priority DESC, do.name ASC
      LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return res.json({
      success: true,
      data: {
        items: listResult.rows,
        total,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-list-views] GET /overlays error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch overlays',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /overlays/:id — single overlay
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/overlays/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryOLTP(
      `SELECT * FROM dialogue_overlays WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Overlay not found: "${id}"`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-list-views] GET /overlays/${id} error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch overlay',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /locations — paginated list of scenes with type='location'
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/locations', async (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if ('error' in pagination) {
    return res.status(400).json({
      success: false,
      error: pagination.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await queryOLTP(
      `SELECT count(*)::int FROM scenes WHERE metadata->>'type' = 'location'`
    );
    const total: number = countResult.rows[0].count;

    const listResult = await queryOLTP(
      `SELECT
        id,
        name,
        description,
        district,
        metadata->>'required_story_beat' AS "requiredStoryBeat",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM scenes
      WHERE metadata->>'type' = 'location'
      ORDER BY name ASC
      LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return res.json({
      success: true,
      data: {
        items: listResult.rows,
        total,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-list-views] GET /locations error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch locations',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /vault — paginated list of vault items
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/vault', async (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if ('error' in pagination) {
    return res.status(400).json({
      success: false,
      error: pagination.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await queryOLTP(
      `SELECT count(*)::int FROM vault_items`
    );
    const total: number = countResult.rows[0].count;

    const listResult = await queryOLTP(
      `SELECT
        vi.id,
        vi.title,
        vi.description,
        vi.item_type AS "itemType",
        vi.mystery_id AS "mysteryId",
        vi.media_url AS "mediaUrl",
        m.title AS "mysteryTitle",
        vi.updated_at AS "updatedAt"
      FROM vault_items vi
      LEFT JOIN mysteries m ON vi.mystery_id = m.id
      ORDER BY vi.title ASC
      LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return res.json({
      success: true,
      data: {
        items: listResult.rows,
        total,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-list-views] GET /vault error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch vault items',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /vault/:id — single vault item
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/vault/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryOLTP(
      `SELECT * FROM vault_items WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Vault item not found: "${id}"`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-list-views] GET /vault/${id} error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch vault item',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /gigs — paginated list of gigs
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/gigs', async (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if ('error' in pagination) {
    return res.status(400).json({
      success: false,
      error: pagination.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await queryOLTP(
      `SELECT count(*)::int FROM gigs`
    );
    const total: number = countResult.rows[0].count;

    const listResult = await queryOLTP(
      `SELECT
        g.id,
        g.title,
        g.description,
        g.time_block_cost AS "timeBlockCost",
        g.credit_payout AS "creditPayout",
        g.reputation_target AS "reputationTarget",
        g.reputation_reward AS "reputationReward",
        g.location_restriction_id AS "locationRestrictionId",
        s.name AS "locationName",
        g.created_at AS "createdAt",
        g.updated_at AS "updatedAt"
      FROM gigs g
      LEFT JOIN scenes s ON g.location_restriction_id = s.id
      ORDER BY g.title ASC
      LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return res.json({
      success: true,
      data: {
        items: listResult.rows,
        total,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-list-views] GET /gigs error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch gigs',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /gigs/:id — single gig
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/gigs/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryOLTP(
      `SELECT * FROM gigs WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Gig not found: "${id}"`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-list-views] GET /gigs/${id} error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch gig',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /shop — paginated list of shop items
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/shop', async (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if ('error' in pagination) {
    return res.status(400).json({
      success: false,
      error: pagination.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await queryOLTP(
      `SELECT count(*)::int FROM shop_items`
    );
    const total: number = countResult.rows[0].count;

    const listResult = await queryOLTP(
      `SELECT
        id,
        name,
        description,
        item_type AS "itemType",
        price,
        currency_type AS "currencyType",
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM shop_items
      ORDER BY name ASC
      LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return res.json({
      success: true,
      data: {
        items: listResult.rows,
        total,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-list-views] GET /shop error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch shop items',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /shop/:id — single shop item
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/shop/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryOLTP(
      `SELECT * FROM shop_items WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Shop item not found: "${id}"`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-list-views] GET /shop/${id} error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch shop item',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /maps — paginated list of map tiles
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/maps', async (req, res) => {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  if ('error' in pagination) {
    return res.status(400).json({
      success: false,
      error: pagination.error,
      timestamp: new Date().toISOString(),
    });
  }

  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await queryOLTP(
      `SELECT count(*)::int FROM map_tiles`
    );
    const total: number = countResult.rows[0].count;

    const listResult = await queryOLTP(
      `SELECT
        mt.id,
        mt.x,
        mt.y,
        mt.terrain_type AS "terrainType",
        mt.rotation,
        mt.is_flipped AS "isFlipped",
        d.name AS "districtName",
        mt.created_at AS "createdAt",
        mt.updated_at AS "updatedAt"
      FROM map_tiles mt
      LEFT JOIN districts d ON mt.district_id = d.id
      ORDER BY d.name, mt.x, mt.y
      LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    return res.json({
      success: true,
      data: {
        items: listResult.rows,
        total,
        page,
        pageSize,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-list-views] GET /maps error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch map tiles',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /maps/:id — single map tile
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/maps/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await queryOLTP(
      `SELECT * FROM map_tiles WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Map tile not found: "${id}"`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-list-views] GET /maps/${id} error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch map tile',
      timestamp: new Date().toISOString(),
    });
  }
});
