import { z } from 'zod';

export const ContentTypeSchema = z.enum(['character', 'dialogue', 'overlay', 'scene', 'gig', 'vault', 'mystery', 'shop_item', 'location', 'map_tile', 'story_beat']);

export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ContentFileSchema = z.object({
  type: ContentTypeSchema,
  id: z.string().uuid(),
  data: z.record(z.string(), z.any()),
});

export type ContentFile = z.infer<typeof ContentFileSchema>;
