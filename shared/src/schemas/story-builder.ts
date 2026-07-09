import { z } from 'zod';
import { ContentTypeSchema } from './content-validation.js';

export const AssetNeedSchema = z.object({
  promptType: z.string(),
  targetField: z.string(),
  status: z.enum(['pending', 'generated', 'assigned']).default('pending'),
});

export const ContentPlanItemSchema = z.object({
  id: z.string().uuid(),
  type: ContentTypeSchema,
  action: z.enum(['create', 'update']),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, { message: 'Slug must contain only lowercase alphanumeric characters and underscores' }),
  fields: z.record(z.string(), z.any()),
  assetNeeds: z.array(AssetNeedSchema).default([]),
  dependsOn: z.array(z.string().uuid()).default([]),
});

export const ContentLinkSchema = z.object({
  fromItem: z.string().uuid(),
  toItem: z.string().uuid(),
  field: z.string(),
  action: z.enum(['add', 'set']),
});

export const ContentPlanSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  items: z.array(ContentPlanItemSchema),
  links: z.array(ContentLinkSchema).default([]),
  status: z.enum(['draft', 'approved', 'executing', 'complete', 'failed']).default('draft'),
});

export type AssetNeed = z.infer<typeof AssetNeedSchema>;
export type ContentPlanItem = z.infer<typeof ContentPlanItemSchema>;
export type ContentLink = z.infer<typeof ContentLinkSchema>;
export type ContentPlan = z.infer<typeof ContentPlanSchema>;
