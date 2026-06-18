import { z } from 'zod';

export const VaultItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  thumbnail_url: z.string().url(),
  media_path: z.string().min(1),
  item_type: z.enum(['clue', 'memento', 'premium_cg']),
  mystery_id: z.string().uuid().optional(),
  requires_signed_url: z.boolean().optional(),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  // Future Task 5.2 will read this during migration to credit the author.
  written_by: z.string().max(100).optional(),
});

export const VaultFileSchema = z.object({
  vault_items: z.array(VaultItemSchema),
});

export const VaultSignedUrlResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    url: z.string().url(),
  }),
  timestamp: z.string(),
});

export type VaultItem = z.infer<typeof VaultItemSchema>;
export type VaultFile = z.infer<typeof VaultFileSchema>;
export type VaultSignedUrlResponse = z.infer<typeof VaultSignedUrlResponseSchema>;
