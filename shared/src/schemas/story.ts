import { z } from 'zod';
import { zodUuid } from './uuid.js';

export const StoryBeatEntrySchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
  description: z.string(),
});

export const YAMLStoryArcSchema = z.object({
  id: zodUuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  beats: z.array(StoryBeatEntrySchema).default([]),
});

export const YAMLStoryArcFileSchema = z.object({
  story: YAMLStoryArcSchema,
});

export type YAMLStoryArc = z.infer<typeof YAMLStoryArcSchema>;
export type YAMLStoryArcFile = z.infer<typeof YAMLStoryArcFileSchema>;
