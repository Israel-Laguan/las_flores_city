import { z } from 'zod';
import { zodUuid } from './uuid.js';

export const StoryBeatEntrySchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
  description: z.string().min(1),
});

export const YAMLStoryArcSchema = z.object({
  id: zodUuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  beats: z.array(StoryBeatEntrySchema),
});

// The canonical story-arc file (e.g. content/stories/real_heroism_in_latam/…yaml)
// uses the root-level shape { id, name, description, beats } directly — there is
// no `story:` wrapper. YAMLStoryArcFileSchema therefore validates the same shape
// as YAMLStoryArcSchema so it matches the real files and the consumers in
// validate-types.ts / upsert.ts that read data.id and data.beats at the root.
export const YAMLStoryArcFileSchema = YAMLStoryArcSchema;

export type YAMLStoryArc = z.infer<typeof YAMLStoryArcSchema>;
export type YAMLStoryArcFile = z.infer<typeof YAMLStoryArcFileSchema>;
