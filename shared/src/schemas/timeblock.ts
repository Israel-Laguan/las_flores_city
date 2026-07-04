import { z } from 'zod';

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
