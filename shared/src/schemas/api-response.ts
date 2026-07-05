import { z } from 'zod';
import { AssetListResponseSchema } from './assets.js';
import { DialogueTreeSchema, DialogueNodeSchema, DialogueChoiceSchema } from './dialogue.js';
import { PlayerStateSchema } from './player.js';
import { MoveResponseSchema } from './player.js';
import { SleepResponseSchema } from './player.js';

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

export const ScenePayloadResponseSchema = ApiResponseSchema.extend({
  data: z.object({
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
  }).optional(),
});

export type ScenePayloadResponse = z.infer<typeof ScenePayloadResponseSchema>;

export const LocationResponseSchema = ApiResponseSchema.extend({
  data: z.object({
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
  }).optional(),
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
