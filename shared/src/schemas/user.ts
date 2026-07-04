import { z } from 'zod';

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
