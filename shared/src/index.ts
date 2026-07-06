/* eslint-disable max-lines */
import { z } from 'zod';
import { AftermathSchema } from './schemas/aftermath.js';
import { RelationshipSchema } from './schemas/character.js';
import { AssetListResponseSchema } from './schemas/assets.js';

import { DialogueNodeSchema, DialogueChoiceSchema } from './schemas/dialogue.js';
export {
  DialogueChoiceSchema,
  DialogueNodeSchema,
  DialogueNodeTypeSchema,
  RelationshipChangeSchema,
  EffectsSchema,
} from './schemas/dialogue.js';
export type { DialogueChoice, DialogueNode, DialogueNodeType, RelationshipChange, Effects } from './schemas/dialogue.js';

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

// Mystery Overlay Schema
// Re-export from the dedicated overlay module for convenience.
export { OverlaySchema, OverlayFileSchema } from './schemas/overlay.js';
export type { Overlay, OverlayFile } from './schemas/overlay.js';
export { VaultItemSchema, VaultFileSchema, VaultSignedUrlResponseSchema } from './schemas/vault.js';
export type { VaultItem, VaultFile, VaultSignedUrlResponse } from './schemas/vault.js';

// ==================== Location & Scene ====================

export const LocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  district: z.string().max(50),
  image_url: z.string().url().optional(),
  background_url: z.string().optional(),
  ambient_sound_url: z.string().nullable().optional(),
  mood: z.string().max(50).optional(),
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
  userId: z.string().uuid(),
  username: z.string(),
  locationId: z.string().uuid().nullable(),
  timeBlocks: z.number().int().min(0).max(48),
  credits: z.number().int(),
  goldCredits: z.number().int().default(0),
  currentNodeId: z.string().nullable().optional(),
  currentDay: z.number().int().min(1).default(1),
  // Meta-plot finale alignment. Set by /dialogue/choose
  // when a YAML choice carries an `alignment_change` directive;
  // once flipped away from 'neutral', the player has made their
  // finale choice and the field is effectively permanent.
  alignment: z.enum(['neutral', 'loyalist', 'fugitive']).default('neutral'),
  // Story-progression cursor — set by effects.story_beat in YAML.
  storyBeat: z.string().default('prologue'),
  // Player flags bag — written by effects.flag_set in YAML.
  flags: z.record(z.string(), z.boolean()).default({}),
  lastLogin: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PlayerState = z.infer<typeof PlayerStateSchema>;

// ==================== Scene Payload ====================

export const ScenePayloadSchema = z.object({
  scene: z.object({
    id: z.string().uuid(),
    title: z.string(),
    backgroundUrl: z.string(),
    ambientSoundUrl: z.string().nullable(),
    mood: z.string(),
  }),
  npcs: z.array(z.object({
    characterId: z.string().uuid(),
    name: z.string(),
    portraitUrl: z.string(),
    currentMood: z.string(),
    relationship: z.object({
      friendship: z.number().int().min(0).max(100),
      romance: z.number().int().min(0).max(100),
    }),
    canInteract: z.boolean(),
    atlasUrl: z.string().optional(),
    expression: z.string().optional(),
  })),
});

export type ScenePayload = z.infer<typeof ScenePayloadSchema>;

// ==================== Movement ====================

export const MoveRequestSchema = z.object({
  target_location_id: z.string().uuid(),
});

export type MoveRequest = z.infer<typeof MoveRequestSchema>;

export const MoveResponseSchema = z.object({
  from_location_id: z.string().uuid(),
  to_location_id: z.string().uuid(),
  tb_cost: z.number().int().min(0),
  time_blocks_remaining: z.number().int().min(0).max(48),
  scene: ScenePayloadSchema.shape.scene,
  npcs: ScenePayloadSchema.shape.npcs,
});

export type MoveResponse = z.infer<typeof MoveResponseSchema>;

// ==================== Sleep ====================

export const SleepResponseSchema = z.object({
  time_blocks: z.number().int().min(0).max(48),
  credits: z.number().int(),
  current_day: z.number().int().min(1),
  credits_deducted: z.number().int(),
  rent_paid: z.boolean(),
});

export type SleepResponse = z.infer<typeof SleepResponseSchema>;

export const BankTransactionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  transaction_type: z.enum(['debit', 'credit', 'transfer']),
  amount: z.number().int(),
  description: z.string().max(200),
  balance_after: z.number().int(),
  reference_type: z.string().max(50).optional(),
  reference_id: z.string().uuid().optional(),
  created_at: z.string().datetime(),
});

export type BankTransaction = z.infer<typeof BankTransactionSchema>;

// ==================== API Responses ====================

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

export const ScenePayloadResponseSchema = ApiResponseSchema.extend({
  data: ScenePayloadSchema.optional(),
});

export type ScenePayloadResponse = z.infer<typeof ScenePayloadResponseSchema>;

export const LocationResponseSchema = ApiResponseSchema.extend({
  data: LocationSchema.optional(),
});

export type LocationResponse = z.infer<typeof LocationResponseSchema>;

export const DialogueResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    tree: DialogueTreeSchema,
    current_node: DialogueNodeSchema,
    available_choices: z.array(DialogueChoiceSchema),
    is_end: z.boolean().optional(),
  }).optional(),
});

export type DialogueResponse = z.infer<typeof DialogueResponseSchema>;

export const PlayerStateResponseSchema = ApiResponseSchema.extend({
  data: PlayerStateSchema.optional(),
});

export type PlayerStateResponse = z.infer<typeof PlayerStateResponseSchema>;

export const MoveResponseWrapperSchema = ApiResponseSchema.extend({
  data: MoveResponseSchema.optional(),
});

export type MoveResponseWrapper = z.infer<typeof MoveResponseWrapperSchema>;

export const SleepResponseWrapperSchema = ApiResponseSchema.extend({
  data: SleepResponseSchema.optional(),
});

export type SleepResponseWrapper = z.infer<typeof SleepResponseWrapperSchema>;

export const AssetListResponseWrapperSchema = ApiResponseSchema.extend({
  data: z.array(AssetListResponseSchema).optional(),
});

export type AssetListResponseWrapper = z.infer<typeof AssetListResponseWrapperSchema>;

// ==================== YAML Content Types ====================

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
  // UGC authorship metadata. Optional so existing content parses unchanged.
  written_by: z.string().max(100).optional(),
});

export type YAMLCharacter = z.infer<typeof YAMLCharacterSchema>;

export const YAMLDialogueSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  start_node_id: z.string(),
  nodes: z.record(z.string(), DialogueNodeSchema),
  metadata: z.record(z.string(), z.any()).optional(),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  written_by: z.string().max(100).optional(),
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
  // UGC authorship metadata. Optional so existing content parses unchanged.
  written_by: z.string().max(100).optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  priority: z.number().int().default(0),
  is_nsfw: z.boolean().default(false),
});

export type YAMLOverlay = z.infer<typeof YAMLOverlaySchema>;

export const YAMLMissionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  status: z.enum(['ACTIVE', 'RESOLVING', 'ARCHIVED']).default('ACTIVE'),
  expires_at: z.string().datetime().optional(),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  written_by: z.string().max(100).optional(),
  // Aftermath directives executed atomically by the
  // LeaderboardWorker when this mission's Breakthrough window
  // closes. Defaults to {} so existing mission YAMLs still parse.
  aftermath_payload: AftermathSchema.optional().default({}),
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
  // UGC authorship metadata. Optional so existing content parses unchanged.
  written_by: z.string().max(100).optional(),
  image_url: z.string().url().optional(),
  background_url: z.string().optional(),
  ambient_sound_url: z.string().nullable().optional(),
  mood: z.string().max(50).optional(),
  available_dialogues: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
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
});

export type YAMLLocation = z.infer<typeof YAMLLocationSchema>;

// ==================== Migration Types ====================

export const MigrationLogSchema = z.object({
  id: z.string().uuid(),
  file_path: z.string(),
  file_checksum: z.string(),
  content_type: z.enum(['character', 'dialogue', 'overlay', 'scene', 'gig', 'vault', 'mission', 'story', 'shop_item', 'location', 'map_tile', 'story_beat']),
  content_id: z.string(),
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
    'move',
    'sleep',
    'gig_completed',
    'post_liked',
    'sms_received',
    'sms_reply_submitted',
    'vault_item_unlocked',
    'mystery_solved',
    'iap_completed',
    'shop_purchase',
    // Emitted by /dialogue/choose when a YAML choice
    // applies an `alignment_change` (the meta-plot finale lock).
    // Mirrors the OLAP CHECK constraint extended in migration 028.
    'alignment_locked',
  ]),
  event_data: z.record(z.string(), z.any()),
  time_blocks_cost: z.number().int().min(0).optional(),
  session_id: z.string().uuid().optional(),
  created_at: z.string().datetime(),
});

export type PlayerEvent = z.infer<typeof PlayerEventSchema>;

// ==================== Leaderboard ====================
export {
  LeaderboardBadgeTypeSchema,
  LeaderboardBadgeSchema,
  LeaderboardEntrySchema,
} from './types/leaderboard.js';
export type { LeaderboardBadgeType, LeaderboardBadge, LeaderboardEntry } from './types/leaderboard.js';

// ==================== Shop / Marketplace ====================
export {
  ShopItemSchema,
  ShopItemFileSchema,
  ShopItemTypeSchema,
  ShopCurrencySchema,
  PlayerInventoryItemSchema,
  InventoryAcquisitionSchema,
  ShopPurchaseRequestSchema,
  ShopPurchaseResponseSchema,
  EquipSlotSchema,
  EquipRequestSchema,
  PublicProfileSchema,
  PayPalWebhookEventSchema,
  PayPalResourceSchema,
  PayPalPurchaseUnitSchema,
  PayPalAmountSchema,
  PayPalCaptureStatusSchema,
} from './schemas/shop.js';
export type {
  ShopItem,
  ShopItemFile,
  ShopItemType,
  ShopCurrency,
  PlayerInventoryItem,
  InventoryAcquisition,
  ShopPurchaseRequest,
  ShopPurchaseResponse,
  EquipSlot,
  EquipRequest,
  PublicProfile,
  PayPalWebhookEvent,
  PayPalResource,
  PayPalPurchaseUnit,
  PayPalAmount,
  PayPalCaptureStatus,
} from './schemas/shop.js';

// ==================== Aftermath / Recycle Phase ====================
export { AftermathSchema } from './schemas/aftermath.js';
export type { Aftermath } from './schemas/aftermath.js';

// ==================== Gigs ====================
export { GigSchema, GigFileSchema } from './schemas/gig.js';
export type { Gig } from './schemas/gig.js';

// ==================== Content Validation ====================

export { StoryBeatSchema, StoryBeatRegistrySchema } from './schemas/story-beat.js';
export type { StoryBeat, StoryBeatRegistry } from './schemas/story-beat.js';

export { YAMLStorySchema, YAMLStoryFileSchema } from './schemas/story.js';
export type { YAMLStory, YAMLStoryFile } from './schemas/story.js';

export { ContentTypeSchema, ContentFileSchema } from './schemas/content-validation.js';
export type { ContentType, ContentFile } from './schemas/content-validation.js';

// ==================== Map Tiles ====================

export const MapTileSchema = z.object({
  id: z.string().uuid(),
  district_id: z.string().uuid(),
  x: z.number().int(),
  y: z.number().int(),
  terrain_type: z.string().min(1).max(50),
  base_image_url: z.string().url().nullable().optional().or(z.literal('')),
  overlay_image_url: z.string().url().nullable().optional().or(z.literal('')),
  rotation: z.number().int().refine((v) => [0, 90, 180, 270].includes(v), { message: 'rotation must be 0, 90, 180, or 270' }).default(0),
  is_flipped: z.boolean().default(false),
  metadata: z.record(z.string(), z.any()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type MapTile = z.infer<typeof MapTileSchema>;

export const MapTileFileSchema = z.object({
  district: z.string().min(1).max(50),
  tiles: z.array(z.object({
    x: z.number().int(),
    y: z.number().int(),
    terrain_type: z.string().min(1).max(50),
    base_image_url: z.string().nullable().optional(),
    overlay_image_url: z.string().nullable().optional(),
    rotation: z.number().int().refine((v) => [0, 90, 180, 270].includes(v), { message: 'rotation must be 0, 90, 180, or 270' }).default(0),
    is_flipped: z.boolean().default(false),
    metadata: z.record(z.string(), z.any()).optional(),
  })),
});

export type MapTileFile = z.infer<typeof MapTileFileSchema>;

// ==================== BYOK AI Presentation ====================
export { preserveImportantTags } from './importantTags.js';

// ==================== AOT Dialogue Chunks (Task 7.2) ====================
export { ChunkSchema, FreeLeafSchema, GuardedLeafSchema, LeafSchema, BoundaryReasonSchema } from './schemas/chunk.js';
export type { Chunk, FreeLeaf, GuardedLeaf, Leaf, BoundaryReason } from './schemas/chunk.js';
export { evaluateBoundary } from './schemas/chunk.js';

// ==================== Assets ====================
export {
  AssetBaseSchema,
  AssetVariantSchema,
  GenerateBasesRequestSchema,
  GenerateVariantsRequestSchema,
  ApproveBaseRequestSchema,
  AssetListResponseSchema,
  PromptCatalogEntrySchema,
  PromptCatalogResponseSchema,
  PublishAssetRequestSchema,
  PublishAssetResponseSchema,
  AssetGroupSummarySchema,
  AssetListAllResponseSchema,
} from './schemas/assets.js';
export type {
  AssetBase,
  AssetVariant,
  GenerateBasesRequest,
  GenerateVariantsRequest,
  ApproveBaseRequest,
  AssetListResponse,
  PromptCatalogEntry,
  PromptCatalogResponse,
  PublishAssetRequest,
  PublishAssetResponse,
  AssetGroupSummary,
  AssetListAllResponse,
} from './schemas/assets.js';
