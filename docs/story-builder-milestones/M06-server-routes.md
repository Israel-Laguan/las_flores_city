# Milestone 6: Server Routes

> **Depends on**: [M03-content-plan-service.md](M03-content-plan-service.md), [M05-orchestrator.md](M05-orchestrator.md)
> **Next**: [M07-admin-proxy-routes.md](M07-admin-proxy-routes.md)

## Context

The server routes expose the Story Builder's plan generation and execution endpoints to the admin frontend. We follow the established router pattern from `server/src/routes/admin-content.ts`: `express.Router()` with `authAndAdminMiddleware`.

## Goals

- [x] Create `server/src/routes/admin-story-builder.ts` with `POST /plan` and `POST /execute`
- [x] Mount router in `server/src/index.ts` at `/admin/story-builder`
- [x] Write integration tests
- [x] Rebuild server container and verify health

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `server/src/routes/admin-story-builder.ts` | Create | Express router with `/plan` and `/execute` |
| `server/src/index.ts` | Modify | Mount `adminStoryBuilderRouter` |
| `server/tests/integration/adminStoryBuilder.test.ts` | Create | Integration tests |

## Implementation Details

### Router Structure

```typescript
// server/src/routes/admin-story-builder.ts
import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { ContentPlanSchema } from '@shared/index';
import { contentPlanService } from '../services/ContentPlanService.js';
import { executePlan } from '../services/StoryBuilderOrchestrator.js';

export const adminStoryBuilderRouter = express.Router();

adminStoryBuilderRouter.use(authAndAdminMiddleware);

// POST /admin/story-builder/plan
// Body: { description: string }
// Returns: { success: true, data: { plan: ContentPlan } }
adminStoryBuilderRouter.post('/plan', async (req, res) => {
  try {
    const { description } = req.body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'description is required and must be a non-empty string',
        timestamp: new Date().toISOString(),
      });
    }

    const plan = await contentPlanService.parseDescription(description.trim());

    return res.json({
      success: true,
      data: { plan },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /plan error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate plan',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /admin/story-builder/execute
// Body: { plan: ContentPlan }
// Returns: { success: true, data: ExecutionResult }
adminStoryBuilderRouter.post('/execute', async (req, res) => {
  try {
    const { plan: rawPlan } = req.body;

    if (!rawPlan) {
      return res.status(400).json({
        success: false,
        error: 'plan is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Validate plan against schema
    const plan = ContentPlanSchema.parse(rawPlan);

    const result = await executePlan(plan);

    return res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[story-builder] POST /execute error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute plan',
      timestamp: new Date().toISOString(),
    });
  }
});
```

### Mount in `server/src/index.ts`

Add near the other admin route mounts:

```typescript
import { adminStoryBuilderRouter } from './routes/admin-story-builder.js';
// ...
app.use('/admin/story-builder', adminStoryBuilderRouter);
```

### Integration Test Structure

```typescript
// server/tests/integration/adminStoryBuilder.test.ts
import request from 'supertest';
import { app } from '../../src/index.js';

describe('POST /admin/story-builder/plan', () => {
  it('should return 400 for empty description', async () => {
    const res = await request(app)
      .post('/admin/story-builder/plan')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ description: '' });
    expect(res.status).toBe(400);
  });

  it('should return a plan for a valid description', async () => {
    // Set LLM_PROVIDER=mock for this test
    const res = await request(app)
      .post('/admin/story-builder/plan')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ description: 'Add a bartender named Diego' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plan.items.length).toBeGreaterThan(0);
  });
});

describe('POST /admin/story-builder/execute', () => {
  it('should execute a plan and return created files', async () => {
    // First generate a plan, then execute it
    // Use a temp content directory for test isolation
  });
});
```

### Key Design Decisions

1. **Follow `admin-content.ts` pattern** — Same middleware, same response format
2. **Validate input with Zod** — `ContentPlanSchema.parse()` on `/execute` body
3. **Use `contentPlanService` singleton** — From M03
4. **Use `executePlan()` function** — From M05
5. **Standard error response** — `{ success: false, error, timestamp }`

## Completion Checklist

Before proceeding to Milestone 7, verify:

- [x] `server/src/routes/admin-story-builder.ts` exists with `/plan` and `/execute`
- [x] Router mounted in `server/src/index.ts` at `/admin/story-builder`
- [x] Integration tests pass (with `LLM_PROVIDER=mock`)
- [x] `npm run lint --workspace=server` passes
- [x] `npm run build --workspace=server` passes
- [x] Server health check passes after rebuild: `docker exec las-flores-server wget -qO- http://localhost:3000/health`

## Next Milestone

→ [Milestone 7: Admin Proxy Routes](M07-admin-proxy-routes.md)