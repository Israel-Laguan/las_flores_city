import express from 'express';
import { queryOLTP } from '../database/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getCache, setCache, deleteCache } from '../database/redis.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';

export const locationRouter = express.Router();

// Cache key helpers
function sceneCacheKey(sceneId: string): string {
  return `scene:global:${sceneId}`;
}

function userLocationCacheKey(userId: string, sceneId: string): string {
  return `user:location:${userId}:${sceneId}`;
}

// Portrait base path convention: /assets/portraits/{slug}/
// Client assembles: ${basePath}/${mood}.png
function portraitBasePath(characterName: string): string {
  const slug = characterName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
  return `/assets/portraits/${slug}`;
}

// Dynamic mood selector based on relationship levels
function selectMood(
  defaultMood: string,
  friendship: number,
  romance: number
): string {
  if (romance > 75) return 'blushing';
  if (romance > 50) return 'flirty';
  if (romance > 25) return 'shy';
  if (friendship > 75) return 'excited';
  if (friendship > 50) return 'happy';
  if (friendship > 25) return 'friendly';
  return defaultMood;
}

// Check if NPC is visible via mystery overlays
async function getOverlayNpcs(sceneId: string, _userId: string): Promise<Array<{
  character_id: string;
  is_permanent: boolean;
  default_mood: string;
  character_name?: string;
  portrait_urls?: any;
  atlas_url?: string | null;
}>> {
  // Get user's active mysteries from dialogue_overlays conditions
  const overlayResult = await queryOLTP(
    `SELECT DISTINCT
      do2.id as overlay_id,
      do2.conditions
     FROM dialogue_overlays do2
     WHERE do2.conditions ? 'presence'
       AND (do2.conditions->'presence'->>'scene_id') = $1`,
    [sceneId]
  );

  if (overlayResult.rows.length === 0) {
    return [];
  }

  const overlayNpcs: Array<{
    character_id: string;
    is_permanent: boolean;
    default_mood: string;
    character_name?: string;
    portrait_urls?: any;
    atlas_url?: string | null;
  }> = [];

  for (const overlay of overlayResult.rows) {
    const conditions = overlay.conditions as any;
    if (conditions?.presence?.character_id) {
      // Fetch character details from the characters table
      const characterResult = await queryOLTP(
        `SELECT 
          character_name, 
          portrait_urls, 
          atlas_url
         FROM characters
         WHERE character_id = $1`,
        [conditions.presence.character_id]
      );

      const characterData = characterResult.rows[0] || {};
      
      overlayNpcs.push({
        character_id: conditions.presence.character_id,
        is_permanent: false,
        default_mood: conditions.presence.default_mood || 'neutral',
        character_name: characterData.character_name,
        portrait_urls: characterData.portrait_urls,
        atlas_url: characterData.atlas_url,
      });
    }
  }

  return overlayNpcs;
}

function mergeNpcEntries(
  permanentResult: any,
  overlayNpcs: Array<{ character_id: string; is_permanent: boolean; default_mood: string }>
): Array<{
  character_id: string;
  is_permanent: boolean;
  default_mood: string;
  character_name?: string;
  portrait_urls?: any;
  atlas_url?: string | null;
}> {
  const allNpcIds = new Set<string>();
  const npcEntries: Array<{
    character_id: string;
    is_permanent: boolean;
    default_mood: string;
    character_name?: string;
    portrait_urls?: any;
    atlas_url?: string | null;
  }> = [];

  for (const row of permanentResult.rows) {
    if (!allNpcIds.has(row.character_id)) {
      allNpcIds.add(row.character_id);
      npcEntries.push({
        character_id: row.character_id,
        is_permanent: row.is_permanent,
        default_mood: row.default_mood,
        character_name: row.character_name,
        portrait_urls: row.portrait_urls,
        atlas_url: row.atlas_url,
      });
    }
  }

  for (const npc of overlayNpcs) {
    if (!allNpcIds.has(npc.character_id)) {
      allNpcIds.add(npc.character_id);
      npcEntries.push({ ...npc });
    }
  }

  return npcEntries;
}

function selectPortraitUrl(
  portraitUrls: any[] | string | null | undefined,
  mood: string,
  characterName: string
): string {
  // Parse portrait_urls if it came back as a JSON string from Postgres
  let urls: Array<{ url: string; label?: string; expression?: string }> = [];
  if (Array.isArray(portraitUrls)) {
    urls = portraitUrls;
  } else if (typeof portraitUrls === 'string' && portraitUrls.trim().startsWith('[')) {
    try {
      urls = JSON.parse(portraitUrls);
    } catch (err) {
      console.error(`Failed to parse portrait_urls for character ${characterName}:`, err);
      urls = [];
    }
  }

  // 1. Try to find a portrait whose expression tag matches the current mood
  if (urls.length > 0) {
    const moodMatch = urls.find(u => (u.expression || '').toLowerCase() === mood.toLowerCase());
    if (moodMatch) return moodMatch.url;

    // 2. Fallback to the first entry with a label (usually "Standard portrait")
    const labeled = urls.find(u => u.label && u.label.trim().length > 0);
    if (labeled) return labeled.url;

    // 3. Fallback to the first entry in the array
    if (urls[0] && typeof urls[0].url === 'string') return urls[0].url;
  }

  // 4. Fallback to the convention-based path
  return `${portraitBasePath(characterName)}/${mood}.png`;
}

function buildNpcPayload(
  npcEntries: Array<{ character_id: string; is_permanent: boolean; default_mood: string; character_name?: string; portrait_urls?: any; atlas_url?: string | null }>,
  relMap: Map<string, { friendship: number; romance: number }>
): any[] {
  return npcEntries.map(entry => {
    const rel = relMap.get(entry.character_id) || { friendship: 0, romance: 0 };
    const mood = selectMood(entry.default_mood, rel.friendship, rel.romance);
    const name = entry.character_name || 'Unknown';
    const portraitUrl = selectPortraitUrl(entry.portrait_urls, mood, name);

    const payload: any = {
      characterId: entry.character_id,
      name,
      portraitUrl,
      currentMood: mood,
      relationship: {
        friendship: rel.friendship,
        romance: rel.romance,
      },
      canInteract: true,
    };

    // Include atlas fields only if atlas_url is configured (backwards-compatible)
    if (entry.atlas_url) {
      payload.atlasUrl = entry.atlas_url;
      payload.expression = mood;
    }

    return payload;
  });
}

async function getSceneRelationships(userId: string, characterIds: string[]): Promise<Map<string, { friendship: number; romance: number }>> {
  const relResult = await queryOLTP(
    `SELECT character_id, friendship_level, romance_level
     FROM user_relationships
     WHERE user_id = $1 AND character_id = ANY($2)`,
    [userId, characterIds]
  );

  const relMap = new Map<string, { friendship: number; romance: number }>();
  for (const row of relResult.rows) {
    relMap.set(row.character_id, {
      friendship: row.friendship_level,
      romance: row.romance_level,
    });
  }

  return relMap;
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
