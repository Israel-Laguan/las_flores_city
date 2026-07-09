# Story Builder Milestones

> **Status**: Implementation Planning
> **Created**: 2026-07-08
> **Related**: `docs/STORY_BUILDER_DESIGN.md`

## Overview

This directory contains the sequential implementation milestones for the **Story Builder** feature — a unified admin-panel flow that turns natural-language descriptions into coordinated content YAML files, prompt files, and asset generation tasks.

Each milestone is a self-contained unit of work with:
- **Context** — why this milestone exists
- **Goals** — specific deliverables
- **Files to Create/Modify** — exact file paths and actions
- **Implementation Details** — key patterns to follow
- **Completion Checklist** — what must be true before proceeding
- **Next Milestone** — pointer to the following file

## Milestone Index

| # | File | Title | Key Deliverables | Depends On |
|---|------|-------|-----------------|------------|
| 1 | [M01-shared-schema.md](M01-shared-schema.md) | Shared Schema & Types | `shared/src/schemas/story-builder.ts`, update `shared/src/index.ts` | — |
| 2 | [M02-llm-service.md](M02-llm-service.md) | LLM Service | `server/src/services/LLMService.ts` (Gemini/Groq/Mock), `.env.example` | M1 |
| 3 | [M03-content-plan-service.md](M03-content-plan-service.md) | Content Plan Service | `server/src/services/ContentPlanService.ts`, unit tests | M1, M2 |
| 4 | [M04-skeleton-generator.md](M04-skeleton-generator.md) | Content Skeleton Generator | `server/src/services/ContentSkeletonGenerator.ts`, unit tests | M1 |
| 5 | [M05-orchestrator.md](M05-orchestrator.md) | Story Builder Orchestrator | `server/src/services/StoryBuilderOrchestrator.ts` | M1, M4 |
| 6 | [M06-server-routes.md](M06-server-routes.md) | Server Routes | `server/src/routes/admin-story-builder.ts`, mount in `index.ts`, integration tests | M3, M5 |
| 7 | [M07-admin-proxy-routes.md](M07-admin-proxy-routes.md) | Admin Proxy Routes | `admin/src/app/api/admin/story-builder/plan/route.ts`, `execute/route.ts` | M6 |
| 8 | [M08-admin-ui.md](M08-admin-ui.md) | Admin UI (Wizard) | `admin/src/app/story-builder/page.tsx`, update `AdminNav.tsx` | M7 |
| 9 | [M09-final-verification.md](M09-final-verification.md) | Final Verification | Full lint/build/test, content validation, manual E2E | M1–M8 |

## Architecture Summary

```text
User input: "Add a bartender named Diego at the Plaza"
                    ↓
ContentPlanService.parseDescription()  [M3]
                    ↓
ContentPlan {
  items: [
    { type: 'character', action: 'create', name: 'Diego', ... },
    { type: 'scene', action: 'update', name: 'Plaza de la Constitución', ... },
    { type: 'dialogue', action: 'create', name: 'Diego bartender intro', ... }
  ],
  links: [
    { fromItem: '<dialogue-uuid>', toItem: '<character-uuid>', field: 'available_dialogues', action: 'add' }
  ]
}
                    ↓
User reviews/edits plan in UI  [M8]
                    ↓
User approves → Orchestrator.executePlan(plan)  [M5]
                    ↓
1. ContentSkeletonGenerator → writes YAML to content/  [M4]
2. validateContent() → migrateContent()
3. Return asset generation task list
                    ↓
User generates assets via existing /assets page
User links assets via existing /admin/content/assign-asset
```

## Codebase Patterns (Established)

- **Router pattern**: `express.Router()` + `authAndAdminMiddleware` (see `server/src/routes/admin-content.ts`)
- **Proxy pattern**: `adminFetch()` in `admin/src/lib/adminApi.ts`
- **Content path validation**: `validateContentPath()` + `resolveContentDir()` from `admin-content.ts`
- **Atomic YAML write**: `.tmp` + `rename` (see `admin-content.ts:PUT /file`)
- **Content types**: `ContentType` from `shared/src/schemas/content-validation.ts`
- **Zod schemas**: Defined in `shared/src/schemas/`, exported from `shared/src/index.ts`
- **DB access**: `queryOLTP` / `withOLTPTransaction` (no new pools)
- **Cache**: `getCache` / `setCache` / `deleteCache` (no new cache layers)
- **Migration**: `migrateContent(contentDir)` from `server/src/content/migrate.ts`
- **Validation**: `validateContent(contentDir)` from `server/src/content/validate.ts`
- **UI template**: `admin/src/app/missions/new/page.tsx` (6-step wizard, monospace theme)

## LLM Providers (Already Configured)

`.env.example` already has:
- `GEMINI_API_KEY` + `GEMINI_MODEL=gemini-3-pro-preview`
- `GROQ_API_KEY`
- `NVIDIA_API_KEY`

We support these existing providers plus a `MockProvider` for deterministic tests.