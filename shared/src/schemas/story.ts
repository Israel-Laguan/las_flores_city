import { z } from 'zod';
import { zodUuid, zodUuidArray } from './uuid.js';

export const YAMLStorySchema = z.object({
  id: zodUuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  mission_id: zodUuid(),
  characters: zodUuidArray().default([]),
  scenes: zodUuidArray().default([]),
  dialogues: zodUuidArray().default([]),
  overlays: zodUuidArray().default([]),
  vault_items: zodUuidArray().default([]),
  written_by: z.string().max(100).optional(),
  lore_ref: z.string().max(255).optional(),
});

export const YAMLStoryFileSchema = z.object({
  stories: z.array(YAMLStorySchema),
});

export type YAMLStory = z.infer<typeof YAMLStorySchema>;
export type YAMLStoryFile = z.infer<typeof YAMLStoryFileSchema>;
