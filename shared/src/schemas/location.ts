import { z } from 'zod';

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
