import { z } from 'zod';

// ==================== Time Block System ====================

export const TimeBlockSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  current_blocks: z.number().int().min(0).max(24),
  max_blocks: z.number().int().min(1).max(24).default(12),
  last_refresh_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type TimeBlock = z.infer<typeof TimeBlockSchema>;

export const TimeBlockCostSchema = z.object({
  amount: z.number().int().min(1).max(24),
  description: z.string().max(200),
});

export type TimeBlockCost = z.infer<typeof TimeBlockCostSchema>;

// ==================== User & Auth ====================

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().min(3).max(30),
  display_name: z.string().max(50),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

export const UserEntitlementsSchema = z.object({
  user_id: z.string().uuid(),
  is_premium: z.boolean().default(false),
  is_nsfw_unlocked: z.boolean().default(false),
  patreon_tier: z.enum(['none', 'supporter', 'premium', 'exclusive']).default('none'),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type UserEntitlements = z.infer<typeof UserEntitlementsSchema>;

// ==================== Content & Dialogue ====================

export const DialogueNodeTypeSchema = z.enum([
  'narrator',
  'character',
  'choice',
  'system',
  'monologue',
]);

export type DialogueNodeType = z.infer<typeof DialogueNodeTypeSchema>;

export const DialogueChoiceSchema = z.object({
  id: z.string(),
  text: z.string().max(500),
  next_node_id: z.string(),
  time_block_cost: TimeBlockCostSchema.optional(),
  required_flags: z.record(z.string(), z.boolean()).optional(),
  hidden_if: z.record(z.string(), z.boolean()).optional(),
});

export type DialogueChoice = z.infer<typeof DialogueChoiceSchema>;

export const DialogueNodeSchema = z.object({
  id: z.string(),
  type: DialogueNodeTypeSchema,
  speaker_id: z.string().optional(),
  text: z.string().max(2000),
  choices: z.array(DialogueChoiceSchema).optional(),
  effects: z.record(z.string(), z.any()).optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type DialogueNode = z.infer<typeof DialogueNodeSchema>;

export const DialogueTreeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  start_node_id: z.string(),
  nodes: z.record(z.string(), DialogueNodeSchema),
  metadata: z.record(z.string(), z.any()).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type DialogueTree = z.infer<typeof DialogueTreeSchema>;

export const DialogueOverlaySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  target_tree_id: z.string().uuid(),
  modifications: z.array(z.object({
    node_id: z.string(),
    action: z.enum(['replace', 'add_choice', 'remove_choice', 'modify_text']),
    data: z.record(z.string(), z.any()),
  })),
  conditions: z.record(z.string(), z.any()).optional(),
  priority: z.number().int().default(0),
  is_nsfw: z.boolean().default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type DialogueOverlay = z.infer<typeof DialogueOverlaySchema>;

// ==================== Location & Scene ====================

export const LocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  district: z.string().max(50),
  image_url: z.string().url().optional(),
  available_dialogues: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Location = z.infer<typeof LocationSchema>;

// ==================== Player State ====================

export const PlayerFlagsSchema = z.record(z.string(), z.boolean());

export type PlayerFlags = z.infer<typeof PlayerFlagsSchema>;

export const PlayerStateSchema = z.object({
  user_id: z.string().uuid(),
  time_blocks: TimeBlockSchema,
  current_location_id: z.string().uuid().optional(),
  active_dialogue_id: z.string().uuid().optional(),
  current_node_id: z.string().optional(),
  flags: PlayerFlagsSchema.default({}),
  inventory: z.array(z.string()).default([]),
  discovered_locations: z.array(z.string().uuid()).default([]),
  completed_dialogues: z.array(z.string().uuid()).default([]),
  last_activity_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type PlayerState = z.infer<typeof PlayerStateSchema>;

// ==================== API Responses ====================

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

export const LocationResponseSchema = ApiResponseSchema.extend({
  data: LocationSchema.optional(),
});

export type LocationResponse = z.infer<typeof LocationResponseSchema>;

export const DialogueResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    tree: DialogueTreeSchema,
    current_node: DialogueNodeSchema,
    available_choices: z.array(DialogueChoiceSchema),
  }).optional(),
});

export type DialogueResponse = z.infer<typeof DialogueResponseSchema>;

export const PlayerStateResponseSchema = ApiResponseSchema.extend({
  data: PlayerStateSchema.optional(),
});

export type PlayerStateResponse = z.infer<typeof PlayerStateResponseSchema>;

// ==================== YAML Content Types ====================

export const YAMLCharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  title: z.string().max(100).optional(),
  description: z.string().max(1000),
  avatar_url: z.string().url().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type YAMLCharacter = z.infer<typeof YAMLCharacterSchema>;

export const YAMLDialogueSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  start_node_id: z.string(),
  nodes: z.record(z.string(), DialogueNodeSchema),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type YAMLDialogue = z.infer<typeof YAMLDialogueSchema>;

export const YAMLOverlaySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  target_tree_id: z.string().uuid(),
  modifications: z.array(z.object({
    node_id: z.string(),
    action: z.enum(['replace', 'add_choice', 'remove_choice', 'modify_text']),
    data: z.record(z.string(), z.any()),
  })),
  conditions: z.record(z.string(), z.any()).optional(),
  priority: z.number().int().default(0),
  is_nsfw: z.boolean().default(false),
});

export type YAMLOverlay = z.infer<typeof YAMLOverlaySchema>;

export const YAMLSceneSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  district: z.string().max(50),
  image_url: z.string().url().optional(),
  available_dialogues: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type YAMLScene = z.infer<typeof YAMLSceneSchema>;

// ==================== Migration Types ====================

export const MigrationLogSchema = z.object({
  id: z.string().uuid(),
  file_path: z.string(),
  file_checksum: z.string(),
  content_type: z.enum(['character', 'dialogue', 'overlay', 'scene']),
  content_id: z.string().uuid(),
  applied_at: z.string().datetime(),
  applied_by: z.string().uuid().optional(),
});

export type MigrationLog = z.infer<typeof MigrationLogSchema>;

// ==================== Event Sourcing (OLAP) ====================

export const PlayerEventSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  event_type: z.enum([
    'dialogue_start',
    'dialogue_choice',
    'dialogue_end',
    'location_enter',
    'location_exit',
    'time_block_spent',
    'item_acquired',
    'item_used',
    'flag_set',
    'mystery_progress',
  ]),
  event_data: z.record(z.string(), z.any()),
  time_blocks_cost: z.number().int().min(0).optional(),
  session_id: z.string().uuid().optional(),
  created_at: z.string().datetime(),
});

export type PlayerEvent = z.infer<typeof PlayerEventSchema>;

// ==================== Content Validation ====================

export const ContentTypeSchema = z.enum(['character', 'dialogue', 'overlay', 'scene']);

export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ContentFileSchema = z.object({
  type: ContentTypeSchema,
  id: z.string().uuid(),
  data: z.record(z.string(), z.any()),
});

export type ContentFile = z.infer<typeof ContentFileSchema>;
