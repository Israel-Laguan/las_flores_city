import { z } from 'zod';
import { ContentTypeSchema } from './content-validation.js';

// Reuse the existing ContentType enum
const contentType = ContentTypeSchema;

export const AssetNeedSchema = z.object({
  promptType: z.string(),        // 'portrait' | 'background' | 'biometric' | etc.
  targetField: z.string(),       // e.g. "portrait_urls[0].url"
  status: z.enum(['pending', 'generating', 'drafted', 'chosen', 'published', 'assigned', 'failed']).default('pending'),
});

export const ContentPlanItemSchema = z.object({
  id: z.string().uuid(),
  type: contentType,             // 'character' | 'dialogue' | 'scene' | etc.
  action: z.enum(['create', 'update']),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, { message: 'Slug must contain only lowercase alphanumeric characters and underscores' }),
  fields: z.record(z.string(), z.any()),
  assetNeeds: z.array(AssetNeedSchema).default([]),
  dependsOn: z.array(z.string().uuid()).default([]),  // Optional for MVP
  lore_refs: z.array(z.string()).optional(),  // LLM-suggested related lore items
  filled_fields: z.array(z.string()).optional(),  // dot-paths of fields filled by the LLM fill pass (provenance)
});

export const ContentLinkSchema = z.object({
  fromItem: z.string().uuid(),
  toItem: z.string().uuid(),
  field: z.string(),             // e.g. "available_dialogues"
  action: z.enum(['add', 'set']),
});

export const ContentPlanSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  items: z.array(ContentPlanItemSchema),
  links: z.array(ContentLinkSchema).default([]),
  status: z.enum(['draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed', 'pending', 'staging', 'migrating', 'verifying']).default('draft'),
}).superRefine((plan, ctx) => {
  // 1. Reject duplicate (type, slug). Duplicate items silently overwrite files
  // on write, so they must be caught before staging.
  const seen = new Map<string, number>();
  plan.items.forEach((item, i) => {
    const key = `${item.type}:${item.slug}`;
    const prev = seen.get(key);
    if (prev !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', i, 'slug'],
        message: `Duplicate (type, slug) "${key}" with item at index ${prev}`,
      });
    } else {
      seen.set(key, i);
    }
  });

  // 2. Reject cross-links that reference unknown items (conflicting cross-links).
  const itemIds = new Set(plan.items.map(i => i.id));
  plan.links.forEach((link, i) => {
    if (!itemIds.has(link.fromItem)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['links', i, 'fromItem'],
        message: `Link references unknown fromItem "${link.fromItem}"`,
      });
    }
    if (!itemIds.has(link.toItem)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['links', i, 'toItem'],
        message: `Link references unknown toItem "${link.toItem}"`,
      });
    }
  });
});

export const FeedbackLogEntrySchema = z.object({
  feedback: z.string(),
  timestamp: z.string(),
  planSnapshot: ContentPlanSchema,
});

export type FeedbackLogEntry = z.infer<typeof FeedbackLogEntrySchema>;

// Inferred types
export type AssetNeed = z.infer<typeof AssetNeedSchema>;
export type ContentPlanItem = z.infer<typeof ContentPlanItemSchema>;
export type ContentLink = z.infer<typeof ContentLinkSchema>;
export type ContentPlan = z.infer<typeof ContentPlanSchema>;