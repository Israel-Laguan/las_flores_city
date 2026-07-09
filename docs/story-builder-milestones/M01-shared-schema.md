# Milestone 1: Shared Schema & Types

> **Depends on**: None (first milestone)
> **Next**: [M02-llm-service.md](M02-llm-service.md)

## Context

The Story Builder needs a shared data model that defines what a `ContentPlan` looks like — the items to create/update, the links between them, and the asset needs. This schema is shared between the server (which generates and executes plans) and the admin frontend (which displays and edits plans).

We use the project's established pattern: Zod schemas defined in `shared/src/schemas/`, exported from `shared/src/index.ts`.

## Goals

- [ ] Create `shared/src/schemas/story-builder.ts` with Zod schemas for `ContentPlan`, `ContentPlanItem`, `AssetNeed`, and `ContentLink`
- [ ] Export schemas and inferred types from `shared/src/index.ts`
- [ ] Verify build passes

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `shared/src/schemas/story-builder.ts` | Create | Zod schemas for Story Builder data model |
| `shared/src/index.ts` | Modify | Re-export new schemas and types |

## Implementation Details

### Schema Design (Option B: Dependency-Graph, simplified for MVP)

```typescript
// shared/src/schemas/story-builder.ts
import { z } from 'zod';
import { ContentTypeSchema } from './content-validation.js';

// Reuse the existing ContentType enum
const contentType = ContentTypeSchema;

export const AssetNeedSchema = z.object({
  promptType: z.string(),        // 'portrait' | 'background' | 'biometric' | etc.
  targetField: z.string(),       // e.g. "portrait_urls[0].url"
  status: z.enum(['pending', 'generated', 'assigned']).default('pending'),
});

export const ContentPlanItemSchema = z.object({
  id: z.string().uuid(),
  type: contentType,             // 'character' | 'dialogue' | 'scene' | etc.
  action: z.enum(['create', 'update']),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  fields: z.record(z.string(), z.any()),
  assetNeeds: z.array(AssetNeedSchema).default([]),
  dependsOn: z.array(z.string().uuid()).default([]),  // Optional for MVP
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
  status: z.enum(['draft', 'approved', 'executing', 'complete', 'failed']).default('draft'),
});

// Inferred types
export type AssetNeed = z.infer<typeof AssetNeedSchema>;
export type ContentPlanItem = z.infer<typeof ContentPlanItemSchema>;
export type ContentLink = z.infer<typeof ContentLinkSchema>;
export type ContentPlan = z.infer<typeof ContentPlanSchema>;
```

### Export Pattern

Add to `shared/src/index.ts`:

```typescript
// ==================== Story Builder ====================
export {
  AssetNeedSchema,
  ContentPlanItemSchema,
  ContentLinkSchema,
  ContentPlanSchema,
} from './schemas/story-builder.js';
export type {
  AssetNeed,
  ContentPlanItem,
  ContentLink,
  ContentPlan,
} from './schemas/story-builder.js';
```

### Key Design Decisions

1. **Reuse `ContentTypeSchema`** — Don't redefine content types; import from `content-validation.js`
2. **`dependsOn` is optional** — Array defaults to `[]`, so MVP can use flat plans
3. **`fields` is `Record<string, any>`** — Flexible bag for proposed YAML fields (LLM fills this)
4. **`assetNeeds` defaults to `[]`** — Not all items need assets
5. **`status` tracks lifecycle** — `draft` → `approved` → `executing` → `complete`/`failed`

## Completion Checklist

Before proceeding to Milestone 2, verify:

- [ ] `shared/src/schemas/story-builder.ts` exists with all 4 schemas
- [ ] `shared/src/index.ts` exports all schemas and types
- [ ] `npm run build --workspace=shared` passes (if build script exists)
- [ ] `ContentPlan` type is importable: `import { ContentPlan } from '@shared/index'`
- [ ] Schema validation works: `ContentPlanSchema.parse({ id: '550e8400-e29b-41d4-a716-446655440000', description: 'test', items: [] })` succeeds

## Next Milestone

→ [Milestone 2: LLM Service](M02-llm-service.md)