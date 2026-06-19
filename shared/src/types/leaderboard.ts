import { z } from 'zod';

// ==================== Leaderboard ====================

export const LeaderboardBadgeTypeSchema = z.enum(['breakthrough', 'diamond', 'gold']);
export type LeaderboardBadgeType = z.infer<typeof LeaderboardBadgeTypeSchema>;

export const LeaderboardBadgeSchema = z.object({
  mystery_id: z.string().uuid(),
  badge_type: LeaderboardBadgeTypeSchema,
  earned_at: z.string().datetime(),
});
export type LeaderboardBadge = z.infer<typeof LeaderboardBadgeSchema>;

export const LeaderboardEntrySchema = z.object({
  mystery_id: z.string().uuid(),
  user_id: z.string().uuid(),
  username: z.string(),
  rank: z.number().int().min(1),
  total_tb_spent: z.number().int().min(0),
  delta_time_seconds: z.number().int().min(0),
  is_breakthrough: z.boolean(),
  badge_type: LeaderboardBadgeTypeSchema,
  created_at: z.string().datetime(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
