# Milestone 7: Admin Proxy Routes

> **Depends on**: [M06-server-routes.md](M06-server-routes.md)
> **Next**: [M08-admin-ui.md](M08-admin-ui.md)

## Context

The Next.js admin frontend needs API routes that proxy requests to the server. This follows the established pattern from `admin/src/app/api/admin/content/file/route.ts`, using `adminFetch()` from `admin/src/lib/adminApi.ts`.

## Goals

- [ ] Create `admin/src/app/api/admin/story-builder/plan/route.ts`
- [ ] Create `admin/src/app/api/admin/story-builder/execute/route.ts`
- [ ] Verify admin build and lint pass

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `admin/src/app/api/admin/story-builder/plan/route.ts` | Create | POST proxy to `/admin/story-builder/plan` |
| `admin/src/app/api/admin/story-builder/execute/route.ts` | Create | POST proxy to `/admin/story-builder/execute` |

## Implementation Details

### Plan Route

```typescript
// admin/src/app/api/admin/story-builder/plan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { description } = body;

    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { success: false, error: 'description is required' },
        { status: 400 }
      );
    }

    const response = await adminFetch('/admin/story-builder/plan', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Proxy error' },
      { status: 500 }
    );
  }
}
```

### Execute Route

```typescript
// admin/src/app/api/admin/story-builder/execute/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { plan } = body;

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'plan is required' },
        { status: 400 }
      );
    }

    const response = await adminFetch('/admin/story-builder/execute', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Proxy error' },
      { status: 500 }
    );
  }
}
```

### Key Design Decisions

1. **Follow existing proxy pattern** — Use `adminFetch()` from `admin/src/lib/adminApi.ts`
2. **Pass through response** — Return server's response with same status code
3. **Basic input validation** — Check required fields before proxying
4. **Error handling** — Catch and return proxy errors as JSON

## Completion Checklist

Before proceeding to Milestone 8, verify:

- [ ] `admin/src/app/api/admin/story-builder/plan/route.ts` exists
- [ ] `admin/src/app/api/admin/story-builder/execute/route.ts` exists
- [ ] Both routes use `adminFetch()` pattern
- [ ] `npm run build --workspace=admin` passes
- [ ] `npm run lint --workspace=admin` passes

## Next Milestone

→ [Milestone 8: Admin UI (Wizard)](M08-admin-ui.md)