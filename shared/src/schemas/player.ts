import { z } from 'zod';

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
  alignment: z.enum(['neutral', 'loyalist', 'fugitive']).default('neutral'),
  storyBeat: z.string().default('prologue'),
  flags: z.record(z.string(), z.boolean()).default({}),
  lastLogin: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PlayerState = z.infer<typeof PlayerStateSchema>;

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
    'alignment_locked',
  ]),
  event_data: z.record(z.string(), z.any()),
  time_blocks_cost: z.number().int().min(0).optional(),
  session_id: z.string().uuid().optional(),
  created_at: z.string().datetime(),
});

export type PlayerEvent = z.infer<typeof PlayerEventSchema>;
