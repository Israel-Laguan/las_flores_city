import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { queryOLTP } from '../database/connection.js';
import { deleteCache, setCache } from '../database/redis.js';
import { StoryBeatSchema } from '@las-flores/shared';

/**
 * Admin Story Beats Router
 *
 * Provides CRUD endpoints for the story_beats table so authors can
 * manage the narrative beat registry from the admin UI.
 *
 * All routes require admin/developer role (authAndAdminMiddleware).
 * After any successful mutation the story_beats:slugs Redis cache
 * is invalidated and repopulated (TTL 0 = no expiry).
 */
export const adminStoryBeatsRouter = express.Router();

adminStoryBeatsRouter.use(authAndAdminMiddleware);

// ---------------------------------------------------------------------------
// Cache helper
// ---------------------------------------------------------------------------

async function refreshSlugCache(): Promise<void> {
  await deleteCache('story_beats:slugs');
  const result = await queryOLTP(
    `SELECT slug FROM story_beats ORDER BY "order" ASC`
  );
  await setCache('story_beats:slugs', result.rows.map((r: { slug: string }) => r.slug), 0);
}

// ---------------------------------------------------------------------------
// GET / — list all story beats ordered by `order` ASC
// ---------------------------------------------------------------------------

adminStoryBeatsRouter.get('/', async (_req, res) => {
  try {
    const result = await queryOLTP(
      `SELECT slug, label, "order", description, created_at, updated_at
       FROM story_beats
       ORDER BY "order" ASC`
    );

    res.json({
      success: true,
      data: result.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-story-beats] GET / error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch story beats',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// POST / — create a new story beat
// ---------------------------------------------------------------------------

adminStoryBeatsRouter.post('/', async (req, res) => {
  const parsed = StoryBeatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      timestamp: new Date().toISOString(),
    });
  }

  const { slug, label, order, description } = parsed.data;

  try {
    const result = await queryOLTP(
      `INSERT INTO story_beats (slug, label, "order", description)
       VALUES ($1, $2, $3, $4)
       RETURNING slug, label, "order", description, created_at, updated_at`,
      [slug, label, order, description]
    );

    await refreshSlugCache();

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-story-beats] POST / error:', error);

    if (error.code === '23505') {
      const constraint: string = error.constraint ?? '';
      const message = constraint === 'story_beats_pkey'
        ? `Slug already exists: "${slug}"`
        : `Order already taken: ${order}`;
      return res.status(409).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create story beat',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /:slug — update label, order, description (slug is immutable)
// ---------------------------------------------------------------------------

adminStoryBeatsRouter.put('/:slug', async (req, res) => {
  const { slug } = req.params;

  // Validate body — slug comes from route params, not body
  const parsed = StoryBeatSchema.omit({ slug: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      timestamp: new Date().toISOString(),
    });
  }

  const { label, order, description } = parsed.data;

  try {
    const result = await queryOLTP(
      `UPDATE story_beats
       SET label = $1, "order" = $2, description = $3, updated_at = NOW()
       WHERE slug = $4
       RETURNING slug, label, "order", description, created_at, updated_at`,
      [label, order, description, slug]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Story beat not found: "${slug}"`,
        timestamp: new Date().toISOString(),
      });
    }

    await refreshSlugCache();

    return res.status(200).json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-story-beats] PUT /${slug} error:`, error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: `Order already taken: ${order}`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update story beat',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:slug — delete a story beat
// ---------------------------------------------------------------------------

adminStoryBeatsRouter.delete('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    // Check if the story beat exists first
    const existsResult = await queryOLTP(
      `SELECT slug FROM story_beats WHERE slug = $1`,
      [slug]
    );

    if (existsResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Story beat not found: "${slug}"`,
        timestamp: new Date().toISOString(),
      });
    }

    // Check for active references in dialogues and scenes before deletion
    const dialogueCheck = await queryOLTP(
      `SELECT dt.id FROM dialogue_trees dt
       CROSS JOIN LATERAL jsonb_each(dt.nodes) AS node_entry
       WHERE dt.nodes IS NOT NULL
         AND node_entry.value -> 'effects' ->> 'story_beat' = $1
       LIMIT 1`,
      [slug]
    );
    const sceneCheck = await queryOLTP(
      `SELECT id FROM scenes WHERE metadata ->> 'required_story_beat' = $1 LIMIT 1`,
      [slug]
    );

    if ((dialogueCheck.rowCount ?? 0) > 0 || (sceneCheck.rowCount ?? 0) > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete story beat "${slug}" because it is currently in use.`,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await queryOLTP(
      `DELETE FROM story_beats WHERE slug = $1`,
      [slug]
    );

    await refreshSlugCache();

    return res.status(200).json({
      success: true,
      data: { slug },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-story-beats] DELETE /${slug} error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete story beat',
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /:slug/usages — cross-reference dialogues and scenes
// ---------------------------------------------------------------------------

adminStoryBeatsRouter.get('/:slug/usages', async (req, res) => {
  const { slug } = req.params;

  try {
    // Check slug exists
    const existsResult = await queryOLTP(
      `SELECT slug FROM story_beats WHERE slug = $1`,
      [slug]
    );

    if (existsResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Story beat not found: "${slug}"`,
        timestamp: new Date().toISOString(),
      });
    }

    // Dialogue and scene queries are independent — run in parallel
    const [dialogueResult, sceneResult] = await Promise.all([
      // Dialogue nodes that set this beat via effects.story_beat
      queryOLTP(
        `SELECT dt.id AS dialogue_id,
                dt.name AS dialogue_name,
                node_entry.key AS node_id
         FROM dialogue_trees dt,
              jsonb_each(dt.nodes) AS node_entry
         WHERE node_entry.value -> 'effects' ->> 'story_beat' = $1`,
        [slug]
      ),
      // Scenes that require this beat via metadata.required_story_beat
      queryOLTP(
        `SELECT id AS scene_id, name AS scene_name
         FROM scenes
         WHERE metadata ->> 'required_story_beat' = $1`,
        [slug]
      ),
    ]);

    const dialogueUsages = dialogueResult.rows.map((row: any) => ({
      dialogueId: row.dialogue_id,
      dialogueName: row.dialogue_name,
      nodeId: row.node_id,
    }));

    const sceneUsages = sceneResult.rows.map((row: any) => ({
      sceneId: row.scene_id,
      sceneName: row.scene_name,
    }));

    return res.status(200).json({
      success: true,
      data: { dialogueUsages, sceneUsages },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[admin-story-beats] GET /${slug}/usages error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch story beat usages',
      timestamp: new Date().toISOString(),
    });
  }
});
