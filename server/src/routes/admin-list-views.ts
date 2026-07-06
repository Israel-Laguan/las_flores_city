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
