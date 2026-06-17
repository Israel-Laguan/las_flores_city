import { z } from 'zod';

export const VaultItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  media_url: z.string().url(),
  item_type: z.enum(['clue', 'memento', 'premium_cg']),
  mystery_id: z.string().uuid().optional(),
  requires_signed_url: z.boolean().optional(),
});

export const VaultFileSchema = z.object({
  vault_items: z.array(VaultItemSchema),
});

export type VaultItem = z.infer<typeof VaultItemSchema>;
export type VaultFile = z.infer<typeof VaultFileSchema>;
