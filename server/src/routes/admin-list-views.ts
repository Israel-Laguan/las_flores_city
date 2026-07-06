import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { queryOLTP } from '../database/connection.js';

/**
 * Admin List Views Router
 *
 * Provides read-only paginated list and detail endpoints for all content types
 * so authors can browse content from the admin UI.
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
// Shared handler factories
// ---------------------------------------------------------------------------

function makeListHandler(opts: {
  countSql: string;
  listSql: string;
  entityLabel: string;
}) {
  return async (req: express.Request, res: express.Response) => {
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
      const countResult = await queryOLTP(opts.countSql);
      const total: number = countResult.rows[0].count;

      const listResult = await queryOLTP(opts.listSql, [pageSize, offset]);

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
      console.error(`[admin-list-views] GET ${opts.entityLabel} error:`, error);
      return res.status(500).json({
        success: false,
        error: error.message || `Failed to fetch ${opts.entityLabel}`,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

function makeDetailHandler(opts: {
  sql: string;
  entityLabel: string;
}) {
  return async (req: express.Request, res: express.Response) => {
    const { id } = req.params;

    try {
      const result = await queryOLTP(opts.sql, [id]);

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: `${opts.entityLabel} not found: "${id}"`,
          timestamp: new Date().toISOString(),
        });
      }

      return res.json({
        success: true,
        data: result.rows[0],
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error(`[admin-list-views] GET ${opts.entityLabel}/${id} error:`, error);
      return res.status(500).json({
        success: false,
        error: error.message || `Failed to fetch ${opts.entityLabel}`,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Dialogues
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/dialogues', makeListHandler({
  countSql: 'SELECT count(*)::int FROM dialogue_trees',
  listSql: `SELECT
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
  entityLabel: 'dialogues',
}));

adminListViewsRouter.get('/dialogues/:id', makeDetailHandler({
  sql: 'SELECT * FROM dialogue_trees WHERE id = $1',
  entityLabel: 'Dialogue',
}));

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/scenes', makeListHandler({
  countSql: 'SELECT count(*)::int FROM scenes',
  listSql: `SELECT
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
  entityLabel: 'scenes',
}));

adminListViewsRouter.get('/scenes/:id', makeDetailHandler({
  sql: 'SELECT * FROM scenes WHERE id = $1',
  entityLabel: 'Scene',
}));

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/characters', makeListHandler({
  countSql: 'SELECT count(*)::int FROM characters',
  listSql: `SELECT
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
  entityLabel: 'characters',
}));

adminListViewsRouter.get('/characters/:id', makeDetailHandler({
  sql: 'SELECT * FROM characters WHERE id = $1',
  entityLabel: 'Character',
}));

// ---------------------------------------------------------------------------
// Mysteries
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/mysteries', makeListHandler({
  countSql: 'SELECT count(*)::int FROM mysteries',
  listSql: `SELECT
    id,
    title,
    description,
    status,
    expires_at AS "expiresAt",
    created_at AS "createdAt"
  FROM mysteries
  ORDER BY created_at DESC
  LIMIT $1 OFFSET $2`,
  entityLabel: 'mysteries',
}));

adminListViewsRouter.get('/mysteries/:id', makeDetailHandler({
  sql: 'SELECT * FROM mysteries WHERE id = $1',
  entityLabel: 'Mystery',
}));

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/overlays', makeListHandler({
  countSql: 'SELECT count(*)::int FROM dialogue_overlays',
  listSql: `SELECT
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
  entityLabel: 'overlays',
}));

adminListViewsRouter.get('/overlays/:id', makeDetailHandler({
  sql: 'SELECT * FROM dialogue_overlays WHERE id = $1',
  entityLabel: 'Overlay',
}));

// ---------------------------------------------------------------------------
// Locations (filtered scenes)
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/locations', makeListHandler({
  countSql: `SELECT count(*)::int FROM scenes WHERE metadata->>'type' = 'location'`,
  listSql: `SELECT
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
  entityLabel: 'locations',
}));

// ---------------------------------------------------------------------------
// Vault items
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/vault', makeListHandler({
  countSql: 'SELECT count(*)::int FROM vault_items',
  listSql: `SELECT
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
  entityLabel: 'vault items',
}));

adminListViewsRouter.get('/vault/:id', makeDetailHandler({
  sql: 'SELECT * FROM vault_items WHERE id = $1',
  entityLabel: 'Vault item',
}));

// ---------------------------------------------------------------------------
// Gigs
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/gigs', makeListHandler({
  countSql: 'SELECT count(*)::int FROM gigs',
  listSql: `SELECT
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
  entityLabel: 'gigs',
}));

adminListViewsRouter.get('/gigs/:id', makeDetailHandler({
  sql: 'SELECT * FROM gigs WHERE id = $1',
  entityLabel: 'Gig',
}));

// ---------------------------------------------------------------------------
// Shop items
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/shop', makeListHandler({
  countSql: 'SELECT count(*)::int FROM shop_items',
  listSql: `SELECT
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
  entityLabel: 'shop items',
}));

adminListViewsRouter.get('/shop/:id', makeDetailHandler({
  sql: 'SELECT * FROM shop_items WHERE id = $1',
  entityLabel: 'Shop item',
}));

// ---------------------------------------------------------------------------
// Map tiles
// ---------------------------------------------------------------------------

adminListViewsRouter.get('/maps', makeListHandler({
  countSql: 'SELECT count(*)::int FROM map_tiles',
  listSql: `SELECT
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
  entityLabel: 'map tiles',
}));

adminListViewsRouter.get('/maps/:id', makeDetailHandler({
  sql: 'SELECT * FROM map_tiles WHERE id = $1',
  entityLabel: 'Map tile',
}));
