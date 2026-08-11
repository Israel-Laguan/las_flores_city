import { z } from 'zod';
import { zodUuid, zodUuidArray } from './uuid.js';
import { ContentTypeSchema } from './content-validation.js';

// Reuse the existing ContentType enum
const contentType = ContentTypeSchema;

export const AssetNeedSchema = z.object({
  promptType: z.string(),        // 'portrait' | 'background' | 'biometric' | etc.
  targetField: z.string(),       // e.g. "portrait_urls[0].url"
  status: z.enum(['pending', 'generating', 'drafted', 'chosen', 'published', 'assigned', 'failed']).default('pending'),
});

export const ContentPlanItemSchema = z.object({
  id: zodUuid(),
  type: contentType,             // 'character' | 'dialogue' | 'scene' | etc.
  action: z.enum(['create', 'update']),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, { message: 'Slug must contain only lowercase alphanumeric characters and underscores' }),
  fields: z.record(z.string(), z.any()),
  assetNeeds: z.array(AssetNeedSchema).default([]),
  dependsOn: zodUuidArray().default([]),  // Optional for MVP
  lore_refs: z.array(z.string()).optional(),  // LLM-suggested related lore items
  filled_fields: z.array(z.string()).optional(),  // dot-paths of fields filled by the LLM fill pass (provenance)
});

export const ContentLinkSchema = z.object({
  fromItem: zodUuid(),
  toItem: zodUuid(),
  field: z.string(),             // e.g. "available_dialogues"
  action: z.enum(['add', 'set']),
});

const ContentPlanMetaSchema = z.object({
  outline_source: z.enum(['llm', 'fallback']).optional(),
  outline_repaired: z.boolean().optional(),
  scaffolded_at: z.string().optional(),
  jobPrefix: z.string().optional(),
  fill_attempts: z.record(z.string(), z.number()).optional(),
  entity_roster: z.array(z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    description: z.string().optional(),
  })).optional(),
}).optional();

export const ContentPlanSchema = z.object({
  id: zodUuid(),
  description: z.string(),
  items: z.array(ContentPlanItemSchema),
  links: z.array(ContentLinkSchema).default([]),
  status: z.enum(['draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed', 'pending', 'staging', 'migrating', 'verifying']).default('draft'),
  _meta: ContentPlanMetaSchema,
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

// ── Intake conflict preview (Moment 1 — LLM surface-level conflict scan) ──
// Produced by `LLMProvider.analyzeIntakeConflicts`. Advisory, non-blocking at
// intake; surfaced to the author as "⚠️ N potential conflicts".
export const IntakeConflictPreviewSchema = z.object({
  type: z.enum(['duplicate_name', 'lore_contradiction', 'timeline_clash', 'scope_overlap']),
  severity: z.enum(['error', 'warning']),
  description: z.string().min(1),
  relatedItems: z.array(z.string()).default([]),
  relatedExisting: z.array(z.string()).optional(),
});

export type IntakeConflictPreview = z.infer<typeof IntakeConflictPreviewSchema>;

// ── Deterministic validation harness (M15.5 — pre-approve gate) ──
// Cheap, reproducible rules the LLM can't be trusted to do faithfully.
// `passed` is false iff any finding has severity === 'error'. Warnings never block.
export const HarnessFindingSchema = z.object({
  code: z.string().min(1),          // stable machine-readable rule id, e.g. 'duplicate_slug_or_name'
  severity: z.enum(['error', 'warning']),
  message: z.string().min(1),
  itemIds: z.array(z.string()).default([]),
});

export type HarnessFinding = z.infer<typeof HarnessFindingSchema>;

export const HarnessReportSchema = z.object({
  passed: z.boolean(),
  findings: z.array(HarnessFindingSchema).default([]),
});

export type HarnessReport = z.infer<typeof HarnessReportSchema>;

// Inferred types
export type AssetNeed = z.infer<typeof AssetNeedSchema>;
export type ContentPlanItem = z.infer<typeof ContentPlanItemSchema>;
export type ContentLink = z.infer<typeof ContentLinkSchema>;
export type ContentPlan = z.infer<typeof ContentPlanSchema>;