import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { queryOLTP, queryContent } from '@las-flores/infra';
import { deleteCache, setCache } from '@las-flores/infra';
import { StoryBeatSchema } from '@las-flores/shared';
import { fetchNodesFromContentUrl } from '../services/contentFetch.js';

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

/**
 * M32/M23: the tree node map is externalized to the CDN (`content_url`);
 * the in-DB `nodes` JSONB column is dropped. These helpers load every
 * dialogue tree's node map from the CDN once (admin-only, low frequency)
 * so we can compute story-beat linkage client-side instead of via
 * `jsonb_each(dt.nodes)` SQL joins.
 */
async function loadAllDialogueTreeNodes(): Promise<{
  trees: Array<{ id: string; name: string; nodes: Record<string, any> }>;
  failed: number;
}> {
  const result = await queryContent<{ id: string; name: string; content_url: string | null }>(
    `SELECT id, name, content_url FROM dialogue_trees`
  );
  const out: Array<{ id: string; name: string; nodes: Record<string, any> }> = [];
  let failed = 0;
  for (const row of result.rows) {
    if (!row.content_url) { failed++; continue; }
    const nodes = await fetchNodesFromContentUrl(row.content_url, {});
    if (!nodes) { failed++; continue; }
    out.push({ id: row.id, name: row.name, nodes });
  }
  return { trees: out, failed };
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
// GET /story-arc — full story arc with beat→dialogue→scene linkage
// ---------------------------------------------------------------------------

const SERVER_SIDE_BEATS = new Set(['act2_mystery_active', 'act3_finale_unlocked']);

async function loadStoryArcData() {
  const [beatsResult, sceneResult] = await Promise.all([
    queryOLTP(
      `SELECT slug, label, "order", description FROM story_beats ORDER BY "order" ASC`
    ),
    queryOLTP(
      `SELECT id AS scene_id, name AS scene_name,
              metadata ->> 'required_story_beat' AS beat_slug
       FROM scenes
       WHERE metadata ->> 'required_story_beat' IS NOT NULL`
    ),
  ]);

  // M32/M23: build beat→dialogue linkage from CDN-loaded node maps
  // (was `jsonb_each(dt.nodes)` SQL join on the dropped `nodes` column).
  const { trees, failed: treesUnavailable } = await loadAllDialogueTreeNodes();
  const beatToDialogues = new Map<string, Array<{ id: string; name: string; nodeId: string }>>();
  for (const tree of trees) {
    for (const [nodeId, node] of Object.entries(tree.nodes)) {
      const beatSlug = (node as any)?.effects?.story_beat;
      if (!beatSlug) continue;
      if (!beatToDialogues.has(beatSlug)) beatToDialogues.set(beatSlug, []);
      beatToDialogues.get(beatSlug)!.push({ id: tree.id, name: tree.name, nodeId });
    }
  }

  const beatToScenes = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of sceneResult.rows) {
    if (!beatToScenes.has(row.beat_slug)) beatToScenes.set(row.beat_slug, []);
    beatToScenes.get(row.beat_slug)!.push({ id: row.scene_id, name: row.scene_name });
  }

  const beats = beatsResult.rows.map((row: any) => {
    const slug: string = row.slug;
    const setByDialogues = beatToDialogues.get(slug) ?? [];
    const requiredByScenes = beatToScenes.get(slug) ?? [];
    const isServerSide = SERVER_SIDE_BEATS.has(slug);
    return {
      slug, label: row.label, order: row.order, description: row.description,
      setByDialogues, requiredByScenes,
      isReachable: isServerSide || setByDialogues.length > 0 || slug === 'prologue',
      isServerSide,
    };
  });

  const totalBeats = beats.length;
  const reachableBeats = beats.filter(b => b.isReachable).length;
  return {
    beats,
    coverage: {
      totalBeats,
      reachableBeats,
      unreachableBeats: totalBeats - reachableBeats,
      serverSideBeats: beats.filter(b => b.isServerSide).length,
      dialoguesSettingBeat: beatToDialogues.size,
      scenesRequiringBeat: beatToScenes.size,
      treesUnavailable,
    },
  };
}

adminStoryBeatsRouter.get('/story-arc', async (_req, res) => {
  try {
    const data = await loadStoryArcData();
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[admin-story-beats] GET /story-arc error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch story arc',
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
      error: parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
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

    refreshSlugCache().catch(err =>
      console.error('[admin-story-beats] cache refresh failed after POST:', err)
    );

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
      error: parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
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

    refreshSlugCache().catch(err =>
      console.error('[admin-story-beats] cache refresh failed after PUT:', err)
    );

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

    // Check for active references in dialogues and scenes (independent checks)
    const sceneCheck = await queryOLTP(
      `SELECT id FROM scenes WHERE metadata ->> 'required_story_beat' = $1 LIMIT 1`,
      [slug]
    );

    // M32/M23: scan CDN-loaded node maps for any node setting this beat
    // (was `jsonb_each(dt.nodes)` SQL join on the dropped `nodes` column).
    const { trees, failed } = await loadAllDialogueTreeNodes();
    if (failed > 0) {
      return res.status(409).json({ success: false, error: `Cannot verify story beat usage: ${failed} dialogue tree(s) could not be loaded.`, timestamp: new Date().toISOString() });
    }
    const dialogueInUse = trees.some((t) =>
      Object.values(t.nodes).some((n: any) => n?.effects?.story_beat === slug)
    );

    if (dialogueInUse || (sceneCheck.rowCount ?? 0) > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete story beat "${slug}" because it is currently in use.`,
        timestamp: new Date().toISOString(),
      });
    }

    await queryOLTP(
      `DELETE FROM story_beats WHERE slug = $1`,
      [slug]
    );

    refreshSlugCache().catch(err =>
      console.error('[admin-story-beats] cache refresh failed after DELETE:', err)
    );

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

    // Scenes that require this beat via metadata.required_story_beat
    const sceneResult = await queryOLTP(
      `SELECT id AS scene_id, name AS scene_name
       FROM scenes
       WHERE metadata ->> 'required_story_beat' = $1`,
      [slug]
    );

    // M32/M23: scan CDN-loaded node maps for nodes setting this beat
    // (was `jsonb_each(dt.nodes)` SQL join on the dropped `nodes` column).
    const { trees, failed } = await loadAllDialogueTreeNodes();
    if (failed > 0) {
      return res.status(503).json({ success: false, error: `Content store unavailable for ${failed} dialogue tree(s).`, timestamp: new Date().toISOString() });
    }
    const dialogueUsages: Array<{ dialogueId: string; dialogueName: string; nodeId: string }> = [];
    for (const tree of trees) {
      for (const [key, node] of Object.entries(tree.nodes)) {
        if ((node as any)?.effects?.story_beat === slug) {
          dialogueUsages.push({ dialogueId: tree.id, dialogueName: tree.name, nodeId: key });
        }
      }
    }

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
