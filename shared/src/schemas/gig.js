import { z } from 'zod';
export const GigSchema = z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().min(1),
    time_block_cost: z.number().int().min(1).max(48),
    credit_payout: z.number().int().min(1),
    reputation_target: z.string().optional(),
    reputation_reward: z.number().int().optional(),
    location_restriction_id: z.string().uuid().optional(),
});
export const GigFileSchema = z.object({
    gigs: z.array(GigSchema),
});
