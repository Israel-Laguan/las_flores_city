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
export const TimeBlockCostSchema = z.object({
    amount: z.number().int().min(1).max(24),
    description: z.string().max(200),
});
// ==================== User & Auth ====================
export const UserSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    username: z.string().min(3).max(30),
    display_name: z.string().max(50),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
});
export const UserEntitlementsSchema = z.object({
    user_id: z.string().uuid(),
    is_premium: z.boolean().default(false),
    is_nsfw_unlocked: z.boolean().default(false),
    patreon_tier: z.enum(['none', 'supporter', 'premium', 'exclusive']).default('none'),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
});
// ==================== Content & Dialogue ====================
export const DialogueNodeTypeSchema = z.enum([
    'narrator',
    'character',
    'choice',
    'system',
    'monologue',
]);
export const RelationshipChangeSchema = z.object({
    stat: z.enum(['friendship', 'romance']),
    amount: z.number().int(),
});
export const DialogueChoiceSchema = z.object({
    id: z.string(),
    text: z.string().max(500),
    next_node_id: z.string(),
    time_block_cost: TimeBlockCostSchema.optional(),
    relationship_change: RelationshipChangeSchema.optional(),
    required_flags: z.record(z.string(), z.boolean()).optional(),
    hidden_if: z.record(z.string(), z.boolean()).optional(),
});
export const DialogueNodeSchema = z.object({
    id: z.string(),
    type: DialogueNodeTypeSchema,
    speaker_id: z.string().optional(),
    text: z.string().max(2000),
    thought: z.string().max(2000).optional(),
    is_end: z.boolean().optional(),
    choices: z.array(DialogueChoiceSchema).optional(),
    effects: z.record(z.string(), z.any()).optional(),
    conditions: z.record(z.string(), z.any()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});
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
// ==================== Player State ====================
export const PlayerFlagsSchema = z.record(z.string(), z.boolean());
export const PlayerStateSchema = z.object({
    userId: z.string().uuid(),
    username: z.string(),
    locationId: z.string().uuid(),
    timeBlocks: z.number().int().min(0).max(48),
    credits: z.number().int(),
    goldCredits: z.number().int().default(0),
    currentNodeId: z.string().nullable().optional(),
    currentDay: z.number().int().min(1).default(1),
    lastLogin: z.string().datetime(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
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
    })),
});
// ==================== Movement ====================
export const MoveRequestSchema = z.object({
    target_location_id: z.string().uuid(),
});
export const MoveResponseSchema = z.object({
    from_location_id: z.string().uuid(),
    to_location_id: z.string().uuid(),
    tb_cost: z.number().int().min(0),
    time_blocks_remaining: z.number().int().min(0).max(48),
    scene: ScenePayloadSchema.shape.scene,
    npcs: ScenePayloadSchema.shape.npcs,
});
// ==================== Sleep ====================
export const SleepResponseSchema = z.object({
    time_blocks: z.number().int().min(0).max(48),
    credits: z.number().int(),
    current_day: z.number().int().min(1),
    credits_deducted: z.number().int(),
    rent_paid: z.boolean(),
});
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
// ==================== API Responses ====================
export const ApiResponseSchema = z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: z.string().optional(),
    timestamp: z.string().datetime(),
});
export const ScenePayloadResponseSchema = ApiResponseSchema.extend({
    data: ScenePayloadSchema.optional(),
});
export const LocationResponseSchema = ApiResponseSchema.extend({
    data: LocationSchema.optional(),
});
export const DialogueResponseSchema = ApiResponseSchema.extend({
    data: z.object({
        tree: DialogueTreeSchema,
        current_node: DialogueNodeSchema,
        available_choices: z.array(DialogueChoiceSchema),
        is_end: z.boolean().optional(),
    }).optional(),
});
export const PlayerStateResponseSchema = ApiResponseSchema.extend({
    data: PlayerStateSchema.optional(),
});
export const MoveResponseWrapperSchema = ApiResponseSchema.extend({
    data: MoveResponseSchema.optional(),
});
export const SleepResponseWrapperSchema = ApiResponseSchema.extend({
    data: SleepResponseSchema.optional(),
});
// ==================== YAML Content Types ====================
export const YAMLCharacterSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    title: z.string().max(100).optional(),
    description: z.string().max(1000),
    avatar_url: z.string().url().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});
export const YAMLDialogueSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    start_node_id: z.string(),
    nodes: z.record(z.string(), DialogueNodeSchema),
    metadata: z.record(z.string(), z.any()).optional(),
});
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
export const YAMLSceneSchema = z.object({
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
});
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
    ]),
    event_data: z.record(z.string(), z.any()),
    time_blocks_cost: z.number().int().min(0).optional(),
    session_id: z.string().uuid().optional(),
    created_at: z.string().datetime(),
});
// ==================== Content Validation ====================
export const ContentTypeSchema = z.enum(['character', 'dialogue', 'overlay', 'scene']);
export const ContentFileSchema = z.object({
    type: ContentTypeSchema,
    id: z.string().uuid(),
    data: z.record(z.string(), z.any()),
});
