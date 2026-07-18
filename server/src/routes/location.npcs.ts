import { queryOLTP } from '../database/connection.js';
import { resolveAssetUrl } from '../services/AssetStageResolver.js';

// Portrait base path convention: /assets/portraits/{slug}/
// Client assembles: ${basePath}/${mood}.png
export function portraitBasePath(characterName: string): string {
  const slug = characterName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
  return `/assets/portraits/${slug}`;
}

// Dynamic mood selector based on relationship levels
export function selectMood(
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
export async function getOverlayNpcs(sceneId: string, _userId: string): Promise<Array<{
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

export function mergeNpcEntries(
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

export function selectPortraitUrl(
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

  // Use the env-aware cascade resolver (stage priority + expression narrowing)
  const resolved = resolveAssetUrl(urls, { expression: mood });
  if (resolved) return resolved;

  // Fallback to the convention-based path
  return `${portraitBasePath(characterName)}/${mood}.png`;
}

export function buildNpcPayload(
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

export async function getSceneRelationships(userId: string, characterIds: string[]): Promise<Map<string, { friendship: number; romance: number }>> {
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
