import { z } from 'zod';
import { DialogueNodeSchema } from './dialogue.js';
import { RelationshipSchema } from './character.js';
import { AftermathSchema } from './aftermath.js';

const safePath = z.string().max(255).refine(
  (p) => !p.startsWith('/') && !p.includes('..'),
  'Path must be a relative path without parent directory traversal',
).optional();

export const AssetEntrySchema = z.object({
  url: z.string().url(),
  label: z.enum(['dev', 'staging', 'production']).optional(),
  expression: z.string().max(50).optional(),
});

export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const YAMLCharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  title: z.string().max(100).optional(),
  description: z.string().max(1000),
  relationships: z.array(RelationshipSchema).optional(),
  avatar_url: z.string().url().optional(),
  portrait_urls: z.array(AssetEntrySchema).optional(),
  atlas_url: z.string().optional(),
  biometric_refs: z.object({
    horizontal_face_sheet: z.string().url().optional(),
    vertical_face_sheet: z.string().url().optional(),
    body_sheet: z.string().url().optional(),
  }).optional(),
  asset_manifest: z.object({
    body_shape: z.string().optional(),
    ethnicity: z.string().optional(),
    face_base_url: z.string().url().optional(),
    hair_front_url: z.string().url().optional(),
    hair_back_url: z.string().url().optional(),
    outfits: z.array(z.object({
      id: z.string(),
      label: z.string(),
      pose_urls: z.record(z.string(), z.string().url()),
    })).optional(),
    expression_strip_url: z.string().url().optional(),
  }).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  written_by: z.string().max(100).optional(),
  lore_ref: z.string().max(255).optional(),
  lore_path: safePath,
  narrative_path: safePath,
  asset_paths: z.object({
    portrait: safePath,
    biometric: safePath,
    expression_strip: safePath,
    face_base: safePath,
    hair_front: safePath,
    hair_back: safePath,
  }).optional(),
});

export type YAMLCharacter = z.infer<typeof YAMLCharacterSchema>;

export const YAMLDialogueSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  start_node_id: z.string(),
  nodes: z.record(z.string(), DialogueNodeSchema),
  metadata: z.record(z.string(), z.any()).optional(),
  written_by: z.string().max(100).optional(),
  lore_ref: z.string().max(255).optional(),
  lore_path: safePath,
  asset_paths: z.object({
    portrait: safePath,
  }).optional(),
});

export type YAMLDialogue = z.infer<typeof YAMLDialogueSchema>;

export const YAMLOverlaySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  target_tree_id: z.string().uuid(),
  mission_id: z.string().uuid().optional(),
  modifications: z.array(z.object({
    node_id: z.string(),
    action: z.enum(['replace', 'add_choice', 'remove_choice', 'modify_text']),
    data: z.record(z.string(), z.any()),
  })).default([]),
  nodes: z.record(z.string(), DialogueNodeSchema).optional(),
  written_by: z.string().max(100).optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  priority: z.number().int().default(0),
  is_nsfw: z.boolean().default(false),
  lore_ref: z.string().max(255).optional(),
  lore_path: safePath,
  asset_paths: z.object({
    background: safePath,
  }).optional(),
});

export type YAMLOverlay = z.infer<typeof YAMLOverlaySchema>;

export const YAMLMissionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  status: z.enum(['ACTIVE', 'RESOLVING', 'ARCHIVED']).default('ACTIVE'),
  expires_at: z.string().datetime().optional(),
  written_by: z.string().max(100).optional(),
  aftermath_payload: AftermathSchema.optional().default({}),
  lore_ref: z.string().max(255).optional(),
  lore_path: safePath,
});

export type YAMLMission = z.infer<typeof YAMLMissionSchema>;

export const YAMLMissionFileSchema = z.object({
  missions: z.array(YAMLMissionSchema),
});

export type YAMLMissionFile = z.infer<typeof YAMLMissionFileSchema>;

export const YAMLSceneSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  district: z.string().max(50),
  district_lore: z.string().max(50).optional(),
  district_subzone: z.string().max(50).optional(),
  written_by: z.string().max(100).optional(),
  image_url: z.string().url().optional(),
  background_url: z.string().optional(),
  background_urls: z.array(AssetEntrySchema).optional(),
  image_urls: z.array(AssetEntrySchema).optional(),
  ambient_sound_url: z.string().nullable().optional(),
  mood: z.string().max(50).optional(),
  available_dialogues: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  lore_ref: z.string().max(255).optional(),
  lore_path: safePath,
  asset_paths: z.object({
    background: safePath,
    ambient_sound: safePath,
  }).optional(),
});

export type YAMLScene = z.infer<typeof YAMLSceneSchema>;

export const YAMLLocationSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('location'),
  name: z.string().min(1).max(100),
  color: z.any().nullable().optional(),
  aliases: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  alwaysIncludeInContext: z.boolean().optional(),
  doNotTrack: z.boolean().optional(),
  noAutoInclude: z.boolean().optional(),
  history: z.string().optional(),
  daytime: z.string().optional(),
  nightlife: z.string().optional(),
  important_places: z.array(z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500),
  })).optional(),
  conclusion: z.string().optional(),
  map: z.object({
    grid: z.object({ cols: z.number().int(), rows: z.number().int() }).optional(),
    base_tile: z.string().optional(),
    walkable_mask: z.string().optional(),
    spawn: z.object({ x: z.number().int(), y: z.number().int() }).optional(),
    waypoints: z.array(z.object({
      name: z.string(),
      x: z.number().int(),
      y: z.number().int(),
    })).optional(),
  }).optional(),
  lore_ref: z.string().max(255).optional(),
  image_urls: z.array(AssetEntrySchema).optional(),
  lore_path: safePath,
  asset_paths: z.object({
    image: safePath,
    background: safePath,
  }).optional(),
});

export type YAMLLocation = z.infer<typeof YAMLLocationSchema>;