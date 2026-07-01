import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import { VaultFileSchema, YAMLMysterySchema, ShopItemFileSchema } from '@las-flores/shared';
import { queryOLTP } from '../database/connection.js';
import { sanitizeText } from './validate.js';
import type { AppliedMigration } from './migrate.js';
import type { ContentType } from '@las-flores/shared';

function getContentTypeFromPath(filePath: string): ContentType | null {
  const normalizedPath = filePath.toLowerCase();
  if (normalizedPath.includes('/characters/') || normalizedPath.includes('\\characters\\')) return 'character';
  if (normalizedPath.includes('/dialogues/') || normalizedPath.includes('\\dialogues\\')) return 'dialogue';
  if (normalizedPath.includes('/overlays/') || normalizedPath.includes('\\overlays\\')) return 'overlay';
  if (normalizedPath.includes('/scenes/') || normalizedPath.includes('\\scenes\\')) return 'scene';
  if (normalizedPath.includes('/gigs/') || normalizedPath.includes('\\gigs\\') || normalizedPath.includes('gigs.yaml')) return 'gig';
  if (normalizedPath.includes('/locations/') || normalizedPath.includes('\\locations\\')) return 'location';
  if (normalizedPath.includes('/vault/') || normalizedPath.includes('\\vault\\')) return 'vault';
  if (normalizedPath.includes('/mysteries/') || normalizedPath.includes('\\mysteries\\')) return 'mystery';
  if (normalizedPath.includes('/shop/') || normalizedPath.includes('\\shop\\')) return 'shop_item';
  if (normalizedPath.endsWith('.yaml') && normalizedPath.includes('gig')) return 'gig';
  return null;
}

async function upsertCharacter(data: any): Promise<string> {
  const result = await queryOLTP(
    `INSERT INTO characters (id, name, title, description, avatar_url, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        avatar_url = EXCLUDED.avatar_url,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id`,
    [data.id, data.name, data.title || null, sanitizeText(data.description), data.avatar_url || null, JSON.stringify(data.metadata || {})]
  );
  return result.rows[0].id;
}

async function upsertDialogueTree(data: any): Promise<string> {
  const result = await queryOLTP(
    `INSERT INTO dialogue_trees (id, name, description, start_node_id, nodes, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        start_node_id = EXCLUDED.start_node_id,
        nodes = EXCLUDED.nodes,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id`,
    [data.id, data.name, data.description || null, data.start_node_id, JSON.stringify(data.nodes || {}), JSON.stringify(data.metadata || {})]
  );
  return result.rows[0].id;
}

async function upsertDialogueOverlay(data: any): Promise<string> {
  const result = await queryOLTP(
    `INSERT INTO dialogue_overlays (id, name, description, target_tree_id, mystery_id, modifications, nodes, conditions, priority, is_nsfw)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        target_tree_id = EXCLUDED.target_tree_id,
        mystery_id = EXCLUDED.mystery_id,
        modifications = EXCLUDED.modifications,
        nodes = EXCLUDED.nodes,
        conditions = EXCLUDED.conditions,
        priority = EXCLUDED.priority,
        is_nsfw = EXCLUDED.is_nsfw,
        updated_at = NOW()
      RETURNING id`,
    [data.id, data.name, data.description || null, data.target_tree_id, data.mystery_id || null, JSON.stringify(data.modifications || []), JSON.stringify(data.nodes || {}), JSON.stringify(data.conditions || {}), data.priority || 0, data.is_nsfw || false]
  );
  return result.rows[0].id;
}

async function upsertScene(data: any): Promise<string> {
  const districtName = data.district || 'Unknown';
  const districtSlug = districtName.toLowerCase().replace(/\s+/g, '-');
  await queryOLTP(
    `INSERT INTO districts (name, slug, x, y) VALUES ($1, $2, 0, 0) ON CONFLICT (name) DO NOTHING`,
    [districtName, districtSlug]
  );
  const availableDialogues = data.available_dialogues || [];
  const dialogArray = availableDialogues.length > 0 ? `{${availableDialogues.join(',')}}` : '{}';
  const result = await queryOLTP(
    `INSERT INTO scenes (id, name, description, district_id, image_url, background_url, ambient_sound_url, mood, available_dialogues, metadata)
      VALUES ($1, $2, $3, (SELECT id FROM districts WHERE name = $4), $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        district_id = (SELECT id FROM districts WHERE name = $4),
        image_url = EXCLUDED.image_url,
        background_url = EXCLUDED.background_url,
        ambient_sound_url = EXCLUDED.ambient_sound_url,
        mood = EXCLUDED.mood,
        available_dialogues = EXCLUDED.available_dialogues,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id`,
    [
      data.id, data.name, sanitizeText(data.description), districtName,
      data.image_url || null, data.background_url || null, data.ambient_sound_url || null,
      data.mood || null, dialogArray, JSON.stringify(data.metadata || {})
    ]
  );
  return result.rows[0].id;
}

async function upsertGig(data: any): Promise<string> {
  const result = await queryOLTP(
    `INSERT INTO gigs (id, title, description, time_block_cost, credit_payout, reputation_target, reputation_reward, location_restriction_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        time_block_cost = EXCLUDED.time_block_cost,
        credit_payout = EXCLUDED.credit_payout,
        reputation_target = EXCLUDED.reputation_target,
        reputation_reward = EXCLUDED.reputation_reward,
        location_restriction_id = EXCLUDED.location_restriction_id,
        updated_at = NOW()
      RETURNING id`,
    [data.id, data.title, sanitizeText(data.description), data.time_block_cost, data.credit_payout, data.revenue_target || null, data.revenue_reward || null, data.location_restriction_id || null]
  );
  return result.rows[0].id;
}

async function upsertMystery(data: any): Promise<string> {
  const result = await queryOLTP(
    `INSERT INTO mysteries (id, title, description, status, expires_at, aftermath_payload)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        expires_at = EXCLUDED.expires_at,
        aftermath_payload = EXCLUDED.aftermath_payload
      RETURNING id`,
    [data.id, data.title, sanitizeText(data.description), data.status || 'ACTIVE', data.expires_at || null, JSON.stringify(data.aftermath_payload ?? {})]
  );
  return result.rows[0].id;
}

async function upsertVaultItem(data: any): Promise<string> {
  const requiresSignedUrl = data.requires_signed_url !== undefined ? data.requires_signed_url : data.item_type === 'premium_cg';
  const result = await queryOLTP(
    `INSERT INTO vault_items (id, title, description, thumbnail_url, media_path, item_type, mystery_id, requires_signed_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        thumbnail_url = EXCLUDED.thumbnail_url,
        media_path = EXCLUDED.media_path,
        item_type = EXCLUDED.item_type,
        mystery_id = EXCLUDED.mystery_id,
        requires_signed_url = EXCLUDED.requires_signed_url,
        updated_at = NOW()
      RETURNING id`,
    [data.id, data.title, sanitizeText(data.description), data.thumbnail_url, data.media_path, data.item_type || 'clue', data.mystery_id || null, requiresSignedUrl]
  );
  return result.rows[0].id;
}

async function upsertShopItem(data: any): Promise<string> {
  const result = await queryOLTP(
    `INSERT INTO shop_items (id, name, description, item_type, price, currency_type, asset_url, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        item_type = EXCLUDED.item_type,
        price = EXCLUDED.price,
        currency_type = EXCLUDED.currency_type,
        asset_url = EXCLUDED.asset_url,
        is_active = EXCLUDED.is_active === undefined ? true : data.is_active,
        updated_at = NOW()
      RETURNING id`,
    [data.id, data.name, data.description || null, data.item_type, data.price, data.currency_type || 'gold_credits', data.asset_url, data.is_active]
  );
  return result.rows[0].id;
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

async function processMysteryData(data: any): Promise<string> {
  if (!data) throw new Error("Invalid mystery data: content is empty");
  const mysteries = data.mysteries || [data];
  const mysteryIds: string[] = [];
  for (const mystery of mysteries) {
    YAMLMysterySchema.parse(mystery);
    const id = await upsertMystery(mystery);
    mysteryIds.push(id);
  }
  return mysteryIds.join(',');
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
    id: data.id,
    name: data.name,
    description: sanitizeText(data.history || ''),
    district: 'Unknown',
    image_url: null,
    background_url: null,
    ambient_sound_url: null,
    mood: 'neutral',
    available_dialogues: [],
    metadata: { ...data, type: 'location' },
  };
  return upsertScene(sceneData);
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
    case 'mystery': contentId = await processMysteryData(data); break;
    case 'shop_item': contentId = await processShopItemData(data); break;
    case 'location': contentId = await processLocationData(data); break;
    default: throw new Error(`Unsupported content type: ${contentType}`);
  }

  return {
    filePath: path.relative(process.cwd(), filePath),
    contentType,
    contentId,
    action: 'updated',
  };
}