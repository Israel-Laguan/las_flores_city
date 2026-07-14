import express from 'express';
import { queryOLTP } from '../database/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCache, setCache, deleteCache } from '../database/redis.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
import {
  getOverlayNpcs,
  mergeNpcEntries,
  buildNpcPayload,
  getSceneRelationships,
} from './location.npcs.js';

export const locationRouter = express.Router();

// Cache key helpers
function sceneCacheKey(sceneId: string): string {
  return `scene:global:${sceneId}`;
}

function userLocationCacheKey(userId: string, sceneId: string): string {
  return `user:location:${userId}:${sceneId}`;
}

// Assemble the full ScenePayload
export async function assembleScenePayload(sceneId: string, userId: string) {
  // 1. Fetch scene data (global, same for all users)
  let sceneData = await getCache(sceneCacheKey(sceneId));

  if (!sceneData) {
    const sceneResult = await queryOLTP(
      `SELECT id, name, background_url, ambient_sound_url, mood
       FROM scenes WHERE id = $1`,
      [sceneId]
    );

    if (sceneResult.rows.length === 0) {
      return null;
    }

    const row = sceneResult.rows[0];
    sceneData = {
      id: row.id,
      title: row.name,
      backgroundUrl: row.background_url || '/assets/scenes/default/background.png',
      ambientSoundUrl: row.ambient_sound_url || null,
      mood: row.mood || 'neutral',
    };

    // Cache scene data globally (TTL: 5 minutes)
    await setCache(sceneCacheKey(sceneId), sceneData, 300);
  }

  // 2. Fetch permanent NPCs from scene_characters
  let permanentResult = await queryOLTP(
    `SELECT
      sc.character_id,
      sc.is_permanent,
      sc.default_mood,
      c.name as character_name,
      c.portrait_urls,
      c.atlas_url
     FROM scene_characters sc
     JOIN characters c ON sc.character_id = c.id
     WHERE sc.scene_id = $1`,
    [sceneId]
  );

  if (permanentResult.rows.length === 0) {
    const sceneMetaResult = await queryOLTP('SELECT metadata FROM scenes WHERE id = $1', [sceneId]);
    const npcIds = ((sceneMetaResult.rows[0]?.metadata as any) || {}).npcs || [];
    if (npcIds.length > 0) {
      permanentResult = await queryOLTP(
        `SELECT c.id AS character_id,
                true AS is_permanent,
                'neutral' AS default_mood,
                c.name AS character_name,
                c.portrait_urls,
                c.atlas_url
         FROM characters c
         WHERE c.id = ANY($1)`,
        [npcIds]
      ) as any;
    }
  }

  // 3. Fetch overlay NPCs (mystery-gated)
  const overlayNpcs = await getOverlayNpcs(sceneId, userId);

  // 4. Merge NPCs
  const npcEntries = mergeNpcEntries(permanentResult, overlayNpcs);

  if (npcEntries.length === 0) {
    return { scene: sceneData, npcs: [] };
  }

  // 5. Fetch relationships for this user
  const characterIds = npcEntries.map(n => n.character_id);
  const relMap = await getSceneRelationships(userId, characterIds);

  // 6. Assemble NPC payload
  const npcs = buildNpcPayload(npcEntries, relMap);

  return { scene: sceneData, npcs };
}

// GET /location/:id - Get scene payload with NPCs (requires auth)
locationRouter.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Try user-specific cache first (includes relationship data)
    const userCacheKey = userLocationCacheKey(userId, id);
    const cached = await getCache(userCacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        timestamp: new Date().toISOString(),
      });
    }

    // Cache miss - assemble from DB
    const payload = await assembleScenePayload(id, userId);
    if (!payload) {
      return res.status(404).json({
        success: false,
        error: 'Location not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Cache user-specific payload (TTL: 30 seconds - shorter due to relationship changes)
    await setCache(userCacheKey, payload, 30);

    res.json({
      success: true,
      data: payload,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Get location error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get location',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /location/:id/invalidate - Invalidate scene cache (requires auth)
locationRouter.post('/:id/invalidate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Invalidate both global and user caches
    await deleteCache(sceneCacheKey(id));
    await deleteCache(userLocationCacheKey(userId, id));

    res.json({
      success: true,
      data: { invalidated: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Invalidate location cache error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate cache',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /location/:id/dialogues - Get available dialogues at location (requires auth)
locationRouter.get('/:id/dialogues', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Get location's available dialogues
    const locationResult = await queryOLTP(
      'SELECT available_dialogues FROM scenes WHERE id = $1',
      [id]
    );

    if (locationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Location not found',
        timestamp: new Date().toISOString(),
      });
    }

    const dialogueIds = locationResult.rows[0].available_dialogues || [];

    if (dialogueIds.length === 0) {
      return res.json({
        success: true,
        data: {
          location_id: id,
          dialogues: [],
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Get dialogue details
    const dialoguesResult = await queryOLTP(
      `SELECT DISTINCT dt.id, dt.name, dt.description, c.name as character_name, c.avatar_url
       FROM dialogue_trees dt
       LEFT JOIN scenes s ON dt.id = ANY(s.available_dialogues)
       LEFT JOIN scene_characters sc ON sc.scene_id = s.id
       LEFT JOIN characters c ON sc.character_id = c.id
       WHERE s.id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        location_id: id,
        dialogues: dialoguesResult.rows.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description,
          character_name: d.character_name,
          character_avatar: d.avatar_url,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Get location dialogues error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get location dialogues',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /location - Get all locations (requires auth)
// 7.5.1: Filters by player story_beat using scenes.metadata.required_story_beat.
// Scenes with no required_story_beat are always visible (backwards-compatible).
locationRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Fetch player's current story beat
    const playerRow = await PlayerStateRepository.getFullState(userId);
    const storyBeat = playerRow?.story_beat || 'prologue';

    // Fetch all scenes including metadata for gating check
    const result = await queryOLTP(
      `SELECT s.id, s.name, s.description, s.image_url, s.metadata,
              d.id as district_id, d.name as district, d.slug as district_slug,
              d.x as district_x, d.y as district_y
       FROM scenes s
       JOIN districts d ON s.district_id = d.id
       ORDER BY s.name`
    );

    // Filter by story_beat gating, then strip metadata from the response
    const locations = result.rows
      .filter(scene => {
        const required = (scene.metadata as any)?.required_story_beat;
        if (!required) return true; // no gate — always visible
        if (Array.isArray(required)) return required.includes(storyBeat);
        return required === storyBeat;
      })
      .map(({ metadata: _meta, ...rest }) => rest);

    res.json({
      success: true,
      data: { locations },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Get all locations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get locations',
      timestamp: new Date().toISOString(),
    });
  }
});
