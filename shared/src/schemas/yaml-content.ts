import { z } from 'zod';
import { DialogueNodeSchema } from './dialogue.js';
import { RelationshipSchema } from './character.js';
import { AftermathSchema } from './aftermath.js';

export const YAMLCharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  title: z.string().max(100).optional(),
  description: z.string().max(1000),
  relationships: z.array(RelationshipSchema).optional(),
  avatar_url: z.string().url().optional(),
  portrait_urls: z.array(z.object({
    url: z.string().url(),
    label: z.string().max(50).optional(),
    expression: z.string().max(50).optional(),
  })).optional(),
  atlas_url: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  written_by: z.string().max(100).optional(),
  lore_ref: z.string().max(255).optional(),
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
});

export type YAMLDialogue = z.infer<typeof YAMLDialogueSchema>;

export const YAMLOverlaySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  target_tree_id: z.string().uuid(),
  mystery_id: z.string().uuid().optional(),
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
});

export type YAMLOverlay = z.infer<typeof YAMLOverlaySchema>;

export const YAMLMysterySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  status: z.enum(['ACTIVE', 'RESOLVING', 'ARCHIVED']).default('ACTIVE'),
  expires_at: z.string().datetime().optional(),
  written_by: z.string().max(100).optional(),
  aftermath_payload: AftermathSchema.optional().default({}),
  lore_ref: z.string().max(255).optional(),
});

export type YAMLMystery = z.infer<typeof YAMLMysterySchema>;

export const YAMLMysteryFileSchema = z.object({
  mysteries: z.array(YAMLMysterySchema),
});

export type YAMLMysteryFile = z.infer<typeof YAMLMysteryFileSchema>;

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
  ambient_sound_url: z.string().nullable().optional(),
  mood: z.string().max(50).optional(),
  available_dialogues: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  lore_ref: z.string().max(255).optional(),
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
  lore_ref: z.string().max(255).optional(),
});

export type YAMLLocation = z.infer<typeof YAMLLocationSchema>;
