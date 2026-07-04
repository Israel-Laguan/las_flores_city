import { z } from 'zod';
import { DialogueNodeSchema } from './dialogue.js';
import { RelationshipSchema } from './character.js';

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

export type DialogueTree = z.infer<typeof DialogueTreeSchema>;

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

export type DialogueOverlay = z.infer<typeof DialogueOverlaySchema>;
