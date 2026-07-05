import { z } from 'zod';

export const StoryBeatSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(100),
  order: z.number().int().nonnegative(),
  description: z.string().max(500),
}).strict();

export const StoryBeatRegistrySchema = z.object({
  beats: z.array(StoryBeatSchema),
}).strict().superRefine((data, ctx) => {
  const slugs = data.beats.map(b => b.slug);
  const orders = data.beats.map(b => b.order);

  const dupSlug = slugs.find((s, i) => slugs.indexOf(s) !== i);
  if (dupSlug) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate slug: "${dupSlug}"` });
  }

  const dupOrder = orders.find((o, i) => orders.indexOf(o) !== i);
  if (dupOrder !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate order: ${dupOrder}` });
  }
});

export type StoryBeat = z.infer<typeof StoryBeatSchema>;
export type StoryBeatRegistry = z.infer<typeof StoryBeatRegistrySchema>;
