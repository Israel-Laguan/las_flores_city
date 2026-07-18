// Re-exports from schema modules (no inline definitions)
export {
  DialogueChoiceSchema,
  DialogueNodeSchema,
  DialogueNodeTypeSchema,
  RelationshipChangeSchema,
  EffectsSchema,
  DialogueTreeSchema,
  DialogueOverlaySchema,
} from './schemas/dialogue.js';
export type {
  DialogueChoice,
  DialogueNode,
  DialogueNodeType,
  RelationshipChange,
  Effects,
  DialogueTree,
  DialogueOverlay,
} from './schemas/dialogue.js';

export { TimeBlockSchema, TimeBlockCostSchema } from './schemas/timeblock.js';
export type { TimeBlock, TimeBlockCost } from './schemas/timeblock.js';

export { UserSchema, UserEntitlementsSchema } from './schemas/user.js';
export type { User, UserEntitlements } from './schemas/user.js';

export { OverlaySchema, OverlayFileSchema } from './schemas/overlay.js';
export type { Overlay, OverlayFile } from './schemas/overlay.js';
export { VaultItemSchema, VaultFileSchema, VaultSignedUrlResponseSchema } from './schemas/vault.js';
export type { VaultItem, VaultFile, VaultSignedUrlResponse } from './schemas/vault.js';

export { LocationSchema } from './schemas/location.js';
export type { Location } from './schemas/location.js';

export {
  PlayerFlagsSchema,
  PlayerStateSchema,
  ScenePayloadSchema,
  MoveRequestSchema,
  MoveResponseSchema,
  SleepResponseSchema,
  BankTransactionSchema,
  PlayerEventSchema,
} from './schemas/player.js';
export type {
  PlayerFlags,
  PlayerState,
  ScenePayload,
  MoveRequest,
  MoveResponse,
  SleepResponse,
  BankTransaction,
  PlayerEvent,
} from './schemas/player.js';

export {
  ApiResponseSchema,
  ScenePayloadResponseSchema,
  LocationResponseSchema,
  DialogueResponseSchema,
  PlayerStateResponseSchema,
  MoveResponseWrapperSchema,
  SleepResponseWrapperSchema,
  AssetListResponseWrapperSchema,
} from './schemas/api-response.js';
export type {
  ApiResponse,
  ScenePayloadResponse,
  LocationResponse,
  DialogueResponse,
  PlayerStateResponse,
  MoveResponseWrapper,
  SleepResponseWrapper,
  AssetListResponseWrapper,
} from './schemas/api-response.js';

export {
  AssetEntrySchema,
  YAMLCharacterSchema,
  YAMLDialogueSchema,
  YAMLOverlaySchema,
  YAMLMissionSchema,
  YAMLMissionFileSchema,
  YAMLSceneSchema,
  YAMLLocationSchema,
} from './schemas/yaml-content.js';
export type {
  AssetEntry,
  YAMLCharacter,
  YAMLDialogue,
  YAMLOverlay,
  YAMLMission,
  YAMLMissionFile,
  YAMLScene,
  YAMLLocation,
} from './schemas/yaml-content.js';

export { MigrationLogSchema } from './schemas/migration.js';
export type { MigrationLog } from './schemas/migration.js';

export {
  LeaderboardBadgeTypeSchema,
  LeaderboardBadgeSchema,
  LeaderboardEntrySchema,
} from './types/leaderboard.js';
export type { LeaderboardBadgeType, LeaderboardBadge, LeaderboardEntry } from './types/leaderboard.js';

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

export { AftermathSchema } from './schemas/aftermath.js';
export type { Aftermath } from './schemas/aftermath.js';

export { GigSchema, GigFileSchema } from './schemas/gig.js';
export type { Gig } from './schemas/gig.js';

export { StoryBeatSchema, StoryBeatRegistrySchema } from './schemas/story-beat.js';
export type { StoryBeat, StoryBeatRegistry } from './schemas/story-beat.js';

export { YAMLStorySchema, YAMLStoryFileSchema } from './schemas/story.js';
export type { YAMLStory, YAMLStoryFile } from './schemas/story.js';

export { ContentTypeSchema, ContentFileSchema } from './schemas/content-validation.js';
export type { ContentType, ContentFile } from './schemas/content-validation.js';

export { MapTileSchema, MapTileFileSchema } from './schemas/map.js';
export type { MapTile, MapTileFile } from './schemas/map.js';

export { preserveImportantTags } from './importantTags.js';

export { ChunkSchema, FreeLeafSchema, GuardedLeafSchema, LeafSchema, BoundaryReasonSchema } from './schemas/chunk.js';
export type { Chunk, FreeLeaf, GuardedLeaf, Leaf, BoundaryReason } from './schemas/chunk.js';
export { evaluateBoundary } from './schemas/chunk.js';

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

export {
  AssetNeedSchema,
  ContentPlanItemSchema,
  ContentLinkSchema,
  ContentPlanSchema,
  FeedbackLogEntrySchema,
} from './schemas/story-builder.js';
export type {
  AssetNeed,
  ContentPlanItem,
  ContentLink,
  ContentPlan,
  FeedbackLogEntry,
} from './schemas/story-builder.js';

export {
  CheckResultSchema,
  VerificationReportSchema,
} from './schemas/verification.js';
export type {
  CheckResult,
  VerificationReport,
} from './schemas/verification.js';
