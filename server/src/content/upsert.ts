import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import { VaultFileSchema, YAMLMissionSchema, ShopItemFileSchema, YAMLStorySchema } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { setCache, deleteCache } from '../database/redis.js';
import { sanitizeText } from './validate-xss.js';
import type { AppliedMigration } from './migrate.js';
import type { ContentType } from '@las-flores/shared';
import {
  upsertCharacter,
  upsertDialogueTree,
  upsertDialogueOverlay,
  upsertScene,
  upsertGig,
  upsertMystery,
  upsertVaultItem,
  upsertShopItem,
  upsertStory,
  upsertMapTile,
  upsertStoryBeat,
} from './content-upserts.js';

function getContentTypeFromPath(filePath: string): ContentType | null {
  const normalizedPath = filePath.toLowerCase();
  if (normalizedPath.includes('/characters/') || normalizedPath.includes('\\characters\\')) return 'character';
  if (normalizedPath.includes('/dialogues/') || normalizedPath.includes('\\dialogues\\')) return 'dialogue';
  if (normalizedPath.includes('/overlays/') || normalizedPath.includes('\\overlays\\')) return 'overlay';
  if (normalizedPath.includes('/scenes/') || normalizedPath.includes('\\scenes\\')) return 'scene';
  if (normalizedPath.includes('/gigs/') || normalizedPath.includes('\\gigs\\') || normalizedPath.includes('gigs.yaml')) return 'gig';
  if (normalizedPath.includes('/locations/') || normalizedPath.includes('\\locations\\')) return 'location';
  if (normalizedPath.includes('/vault/') || normalizedPath.includes('\\vault\\')) return 'vault';
  if (normalizedPath.includes('/missions/') || normalizedPath.includes('\\missions\\') || normalizedPath.includes('/mysteries/') || normalizedPath.includes('\\mysteries\\')) return 'mission';
  if (normalizedPath.includes('/stories/') || normalizedPath.includes('\\stories\\')) return 'story';
  if (normalizedPath.includes('/shop/') || normalizedPath.includes('\\shop\\')) return 'shop_item';
  if (normalizedPath.endsWith('story_beats.yaml')) return 'story_beat';
  if (normalizedPath.endsWith('.yaml') && normalizedPath.includes('gig')) return 'gig';
  return null;
}

async function processCharacterData(data: any): Promise<string> {
  return upsertCharacter(data);
}

async function processDialogueData(data: any): Promise<string> {
  return upsertDialogueTree(data);
}

async function processOverlayData(data: any): Promise<string> {
  return upsertDialogueOverlay(data);
}

async function processSceneData(data: any): Promise<string> {
  if (!data) throw new Error("Invalid scene data: content is empty");
  const contentId = await upsertScene(data);
  const npcIds: string[] = data.metadata?.npcs || [];
  const uniqueNpcIds = [...new Set(npcIds)];
  for (const charId of uniqueNpcIds) {
    await queryOLTP(
      "INSERT INTO scene_characters (scene_id, character_id, is_permanent, default_mood) VALUES ($1, $2, true, 'neutral') ON CONFLICT (scene_id, character_id) DO NOTHING",
      [contentId, charId]
    );
  }
  return contentId;
}

async function processGigData(data: any): Promise<string> {
  if (!data) throw new Error("Invalid gig data: content is empty");
  const gigs = data.gigs || [data];
  const ids: string[] = [];
  for (const gig of gigs) {
    const id = await upsertGig(gig);
    ids.push(id);
  }
  return ids.join(',');
}

async function processVaultData(data: any): Promise<string> {
  VaultFileSchema.parse(data);
  const vaultItems = data.vault_items || [];
  const vaultIds: string[] = [];
  for (const item of vaultItems) {
    const id = await upsertVaultItem(item);
    vaultIds.push(id);
  }
  return vaultIds.join(',');
}

async function processMissionData(data: any): Promise<string> {
  if (!data) throw new Error("Invalid mission data: content is empty");
  const missions = data.missions || [data];
  const missionIds: string[] = [];
  for (const mission of missions) {
    YAMLMissionSchema.parse(mission);
    const id = await upsertMystery(mission);
    missionIds.push(id);
  }
  return missionIds.join(',');
}

async function processStoryData(data: any): Promise<string> {
  if (!data) throw new Error("Invalid story data: content is empty");
  const stories = data.stories || [data];
  const storyIds: string[] = [];
  for (const story of stories) {
    YAMLStorySchema.parse(story);
    const id = await upsertStory(story);
    storyIds.push(id);
  }
  return storyIds.join(',');
}

async function processShopItemData(data: any): Promise<string> {
  ShopItemFileSchema.parse(data);
  const shopItems = data.shop_items || [];
  const shopIds: string[] = [];
  for (const item of shopItems) {
    const id = await upsertShopItem(item);
    shopIds.push(id);
  }
  return shopIds.join(',');
}

async function processLocationData(data: any): Promise<string> {
  if (!data?.name) throw new Error("Invalid location data: name is required");
  if (!data?.id) throw new Error("Invalid location data: id is required");
  const sceneData = {
    ...data,
    id: data.id,
    name: data.name,
    description: sanitizeText(data.history || ''),
    district: 'Unknown',
    image_url: data.image_url || null,
    background_url: data.background_url || null,
    ambient_sound_url: null,
    mood: 'neutral',
    available_dialogues: [],
    metadata: { ...data, type: 'location' },
  };
  // image_urls and background_urls (JSONB arrays for cascade) are carried
  // from the source YAML via the spread above; no extra mapping needed.
  return upsertScene(sceneData);
}

async function processMapTileData(data: any): Promise<string> {
  const { MapTileFileSchema } = await import('@las-flores/shared');
  MapTileFileSchema.parse(data);

  const districtName = data.district || 'Unknown';

  // Look up canonical district — do NOT auto-create
  const districtResult = await queryOLTP(
    `SELECT id FROM districts WHERE name = $1`,
    [districtName]
  );
  if (districtResult.rows.length === 0) {
    throw new Error(`District "${districtName}" not found. Create the district record before importing tiles.`);
  }
  const districtId = districtResult.rows[0].id;

  const tileIds: string[] = [];
  for (const tile of data.tiles) {
    const id = await upsertMapTile({
      district_id: districtId,
      x: tile.x,
      y: tile.y,
      terrain_type: tile.terrain_type,
      base_image_url: tile.base_image_url,
      overlay_image_url: tile.overlay_image_url,
      rotation: tile.rotation,
      is_flipped: tile.is_flipped,
      metadata: tile.metadata,
    });
    tileIds.push(id);
  }
  return tileIds.join(',');
}

async function processStoryBeatData(data: any): Promise<string> {
  const { StoryBeatRegistrySchema } = await import('@las-flores/shared');
  const parsed = StoryBeatRegistrySchema.parse(data);
  const slugs: string[] = [];
  for (const beat of parsed.beats) {
    await upsertStoryBeat(beat);
    slugs.push(beat.slug);
  }
  // Invalidate stale cache before re-populating
  await deleteCache('story_beats:slugs');
  // TTL 0 = no expiry — invalidated explicitly by deleteCache before each re-population
  await setCache('story_beats:slugs', slugs, 0);
  return slugs.join(',');
}

export async function processContentFile(filePath: string): Promise<AppliedMigration> {
  const contentType = getContentTypeFromPath(filePath);
  if (!contentType) throw new Error(`Could not determine content type from path: ${filePath}`);

  const content = await fs.readFile(filePath, 'utf-8');
  const data = yaml.load(content) as any;
  let contentId: string;

  switch (contentType) {
    case 'character': contentId = await processCharacterData(data); break;
    case 'dialogue': contentId = await processDialogueData(data); break;
    case 'overlay': contentId = await processOverlayData(data); break;
    case 'scene': contentId = await processSceneData(data); break;
    case 'gig': contentId = await processGigData(data); break;
    case 'vault': contentId = await processVaultData(data); break;
    case 'mission': contentId = await processMissionData(data); break;
    case 'story': contentId = await processStoryData(data); break;
    case 'shop_item': contentId = await processShopItemData(data); break;
    case 'location': contentId = await processLocationData(data); break;
    case 'map_tile': contentId = await processMapTileData(data); break;
    case 'story_beat': contentId = await processStoryBeatData(data); break;
    default: throw new Error(`Unsupported content type: ${contentType}`);
  }

  return {
    filePath: path.relative(process.cwd(), filePath),
    contentType,
    contentId,
    action: 'updated',
  };
}
