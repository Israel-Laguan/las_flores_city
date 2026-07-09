# Milestone 8: Admin UI (Wizard)

> **Depends on**: [M07-admin-proxy-routes.md](M07-admin-proxy-routes.md)
> **Next**: [M09-final-verification.md](M09-final-verification.md)

## Context

The Story Builder UI is a 4-step wizard: Describe → Review → Execute → Assets. We clone the pattern from `admin/src/app/missions/new/page.tsx` (a 6-step mission wizard that uses the monospace cyberpunk theme, React state for step navigation, and calls the API routes).

This follows **Option A (Single-Page Wizard)** from the design document — the plan lives in React state; if the user navigates away, they lose the plan (acceptable for session-only MVP).

## Goals

- [ ] Create `admin/src/app/story-builder/page.tsx` (4-step wizard)
- [ ] Add "Story Builder" link to `admin/src/app/components/AdminNav.tsx`
- [ ] Verify admin build and lint pass

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `admin/src/app/story-builder/page.tsx` | Create | 4-step wizard UI |
| `admin/src/app/components/AdminNav.tsx` | Modify | Add nav link |

## Implementation Details

### Page Structure

```typescript
// admin/src/app/story-builder/page.tsx
'use client';
import { useState } from 'react';
import AdminNav from '../components/AdminNav';
import type { ContentPlan, ContentPlanItem } from '@shared/index';

type Step = 1 | 2 | 3 | 4;

export default function StoryBuilderPage() {
  const [step, setStep] = useState<Step>(1);
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);

  // Step 1: Generate plan
  async function handleGeneratePlan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/story-builder/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP error ${res.status}: ${text || res.statusText}`);
      }
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Expected JSON response from server');
      }
      const data = await res.json();
      if (data.success) {
        setPlan(data.data.plan);
        setStep(2);
      } else {
        setError(data.error || 'Failed to generate plan');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Execute plan
  async function handleExecutePlan() {
    if (!plan) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/story-builder/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP error ${res.status}: ${text || res.statusText}`);
      }
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Expected JSON response from server');
      }
      const data = await res.json();
      if (data.success) {
        setExecutionResult(data.data);
        setStep(4);
      } else {
        setError(data.error || 'Failed to execute plan');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Render steps...
}
```

### Step 1: Describe

- Large textarea for natural language description
- Example prompts: "Add a bartender named Diego at the Plaza"
- "Generate Plan" button → calls `/api/admin/story-builder/plan`

### Step 2: Review Plan

- Editable list of plan items (cards with type, name, key fields)
- Add/remove items
- Edit fields inline (name, slug, description)
- "Approve & Execute" button → advances to step 3

### Step 3: Execute

- "Execute Plan" button → calls `/api/admin/story-builder/execute`
- Progress indicator (loading state)
- Shows created files list
- Shows validation/migration results

### Step 4: Assets

- Lists asset needs per content item
- Links to `/assets` page for each pending asset
- Links to `/admin/content/assign-asset` for assignment

### AdminNav Update

Add to the "Tools" section in `AdminNav.tsx`:

```tsx
<Link href="/story-builder" style={navLinkStyle}>🏗️ Story Builder</Link>
```

### Styling

Follow the monospace cyberpunk theme from the mission wizard:
- Background: `#0d0d1a`
- Text: `#00ff00`
- Borders: `1px solid #333`
- Font: `monospace`

### Key Design Decisions

1. **Single-page wizard** — All state in React `useState`; no routing between steps
2. **Clone mission wizard pattern** — Same theme, same step navigation approach
3. **Editable plan items** — User can modify name, slug, fields before execution
4. **Asset links** — Step 4 links to existing `/assets` and `/admin/content/assign-asset` pages
5. **Error display** — Show errors inline, allow retry

## Completion Checklist

Before proceeding to Milestone 9, verify:

- [ ] `admin/src/app/story-builder/page.tsx` exists with 4 steps
- [ ] Step 1: textarea + "Generate Plan" button works
- [ ] Step 2: editable plan items display
- [ ] Step 3: "Execute Plan" button works, shows results
- [ ] Step 4: asset needs listed with links to `/assets`
- [ ] `AdminNav.tsx` has "Story Builder" link
- [ ] Monospace theme consistent with rest of admin
- [ ] `npm run build --workspace=admin` passes
- [ ] `npm run lint --workspace=admin` passes

## Next Milestone

→ [Milestone 9: Final Verification](M09-final-verification.md)