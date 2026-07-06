import { z } from 'zod';

export const YAMLStorySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  mission_id: z.string().uuid(),
  characters: z.array(z.string().uuid()).default([]),
  scenes: z.array(z.string().uuid()).default([]),
  dialogues: z.array(z.string().uuid()).default([]),
  overlays: z.array(z.string().uuid()).default([]),
  vault_items: z.array(z.string().uuid()).default([]),
  written_by: z.string().max(100).optional(),
  lore_ref: z.string().max(255).optional(),
});

export const YAMLStoryFileSchema = z.object({
  stories: z.array(YAMLStorySchema),
});

export type YAMLStory = z.infer<typeof YAMLStorySchema>;
export type YAMLStoryFile = z.infer<typeof YAMLStoryFileSchema>;
