# Milestone 2: YAML Path References & Lore Integration

**Goal**: Add `lore_path` and `narrative_path` fields to YAML schemas, and add a "View Lore" button to content cards.

**Effort**: Medium (2-3 hours)

**Prerequisites**: Milestone 1 complete (text + image cards in place).

## Scope

### In Scope
- Add `lore_path` and `narrative_path` optional fields to YAML schemas
- Add server endpoint to read markdown files by path
- Add "View Lore" button to ContentCard that opens lore in a modal/viewer
- Add path validation to `validateContent()`
- Update ContentSkeletonGenerator to include path fields in generated YAML

### Out of Scope
- Asset path unification (Milestone 3)
- Inline markdown editing (Milestone 4)
- Migration of existing content (Milestone 5)

## Rationale

Currently, YAML files have no reference to their corresponding lore markdown files. This means:
- The admin UI can't easily link content to lore
- There's no way to navigate from a character YAML to its lore MD
- The dual-track system (lore MD + content YAML) exists but isn't connected

Adding `lore_path` and `narrative_path` creates the bridge:
- `lore_path`: Points to `docs/lore/figures/<name>/<name>.md` (long-form lore)
- `narrative_path`: Points to `content/characters/char_<name>.md` (engine narrative)

These are optional fields — existing content without them continues to work.

## Implementation Steps

### Step 1: Update YAML Schemas

**File**: `shared/src/schemas/yaml-content.ts` (modify)

Add `lore_path` and `narrative_path` to all content type schemas:

```typescript
// Add to YAMLCharacterSchema
lore_path: z.string().max(255).optional(),
narrative_path: z.string().max(255).optional(),

// Add to YAMLDialogueSchema
lore_path: z.string().max(255).optional(),

// Add to YAMLOverlaySchema
lore_path: z.string().max(255).optional(),

// Add to YAMLMissionSchema
lore_path: z.string().max(255).optional(),

// Add to YAMLSceneSchema
lore_path: z.string().max(255).optional(),

// Add to YAMLLocationSchema
lore_path: z.string().max(255).optional(),
```

**Note**: `lore_ref` already exists on these schemas. `lore_ref` is for short references/tags (e.g., `#lithium`, `#lw_group`). `lore_path` is for file paths to full markdown documents. They serve different purposes and can coexist.

### Step 2: Update ContentSkeletonGenerator

**File**: `server/src/services/ContentSkeletonGenerator.ts` (modify)

When generating YAML for new content, include `lore_path` and `narrative_path` fields based on naming conventions:

```typescript
// In each template function, add:
lore_path: `docs/lore/figures/${item.slug}/${item.slug}.md`,
narrative_path: `content/${item.type === 'character' ? 'characters' : item.type + 's'}/${item.type === 'character' ? 'char_' : ''}${item.slug}.md`,
```

For example, for a character with slug `diego`:
```yaml
lore_path: docs/lore/figures/diego/diego.md
narrative_path: content/characters/char_diego.md
```

**Note**: These paths are suggestions — the admin can edit them later. For types that don't have a lore convention (e.g., `shop_item`, `gig`), omit these fields.

### Step 3: Create Lore File Server Endpoint

**File**: `server/src/routes/admin-lore.ts` (new)

Create an Express router that serves markdown files by path:

```typescript
import express from 'express';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import type { AuthRequest } from '../middleware/auth.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const adminLoreRouter = express.Router();

adminLoreRouter.use(authAndAdminMiddleware);

const LorePathSchema = z.string().max(500);

// GET /admin/lore/file?path=docs/lore/figures/diego/diego.md
adminLoreRouter.get('/file', async (req: AuthRequest, res) => {
  try {
    const { path: lorePath } = req.query;
    
    if (!lorePath || typeof lorePath !== 'string') {
      res.status(400).json({ success: false, error: 'path query parameter is required', timestamp: new Date().toISOString() });
      return;
    }

    const parsed = LorePathSchema.safeParse(lorePath);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid lore path', timestamp: new Date().toISOString() });
      return;
    }

    // Security: prevent path traversal
    const normalizedPath = path.normalize(parsed.data);
    if (normalizedPath.includes('..') || !normalizedPath.startsWith('docs/lore/')) {
      res.status(403).json({ success: false, error: 'Access denied', timestamp: new Date().toISOString() });
      return;
    }

    const fullPath = path.resolve(process.cwd(), normalizedPath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      res.json({
        success: true,
        data: {
          path: normalizedPath,
          content,
          exists: true,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        res.json({
          success: true,
          data: {
            path: normalizedPath,
            content: '',
            exists: false,
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        throw error;
      }
    }
  } catch (error: any) {
    console.error('[admin-lore] GET /file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to read lore file',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /admin/lore/file (save)
adminLoreRouter.post('/file', async (req: AuthRequest, res) => {
  try {
    const { path: lorePath, content } = req.body;

    if (!lorePath || typeof lorePath !== 'string' || content === undefined || typeof content !== 'string') {
      res.status(400).json({ success: false, error: 'path and content are required', timestamp: new Date().toISOString() });
      return;
    }

    const parsed = LorePathSchema.safeParse(lorePath);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid lore path', timestamp: new Date().toISOString() });
      return;
    }

    // Security: prevent path traversal
    const normalizedPath = path.normalize(parsed.data);
    if (normalizedPath.includes('..') || !normalizedPath.startsWith('docs/lore/')) {
      res.status(403).json({ success: false, error: 'Access denied', timestamp: new Date().toISOString() });
      return;
    }

    const fullPath = path.resolve(process.cwd(), normalizedPath);
    const dir = path.dirname(fullPath);
    
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');

    res.json({
      success: true,
      data: {
        path: normalizedPath,
        saved: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[admin-lore] POST /file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save lore file',
      timestamp: new Date().toISOString(),
    });
  }
});
```

**Register the router** in `server/src/routes/index.ts` (or wherever admin routers are mounted):

```typescript
import { adminLoreRouter } from './admin-lore.js';
// ...
adminRouter.use('/admin/lore', adminLoreRouter);
```

### Step 4: Create Admin Proxy Route

**File**: `admin/src/app/api/admin/lore/file/route.ts` (new)

```typescript
import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get('path');
    
    if (!path) {
      return NextResponse.json({ success: false, error: 'path is required' }, { status: 400 });
    }

    const data = await adminFetch(`/admin/lore/file?path=${encodeURIComponent(path)}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin lore file GET error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({
      success: false,
      error: (error as Error).message || 'Failed to fetch lore file',
    }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { path, content } = body;

    if (!path || content === undefined) {
      return NextResponse.json({ success: false, error: 'path and content are required' }, { status: 400 });
    }

    const data = await adminFetch('/admin/lore/file', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin lore file POST error:', error);
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({
      success: false,
      error: (error as Error).message || 'Failed to save lore file',
    }, { status });
  }
}
```

### Step 5: Add Lore Viewer Modal

**File**: `admin/src/app/story-builder/components/LoreViewer.tsx` (new)

Create a modal component that displays markdown content:

```typescript
'use client';

import { useState, useEffect } from 'react';

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #00ff00',
    borderRadius: '5px',
    padding: '1.5rem',
    maxWidth: '800px',
    width: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    borderBottom: '1px solid #333',
    paddingBottom: '0.5rem',
  },
  title: {
    color: '#00ff00',
    fontSize: '1.1rem',
    fontWeight: 'bold' as const,
    margin: 0,
  },
  closeButton: {
    background: 'transparent',
    color: '#00ff00',
    border: '1px solid #00ff00',
    borderRadius: '3px',
    padding: '0.3rem 0.6rem',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    backgroundColor: '#0d0d1a',
    padding: '1rem',
    borderRadius: '5px',
    border: '1px solid #333',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    lineHeight: '1.6',
    color: '#fff',
    whiteSpace: 'pre-wrap' as const,
  },
  path: {
    color: '#888',
    fontSize: '0.8rem',
    marginBottom: '0.5rem',
    fontFamily: 'monospace',
  },
  errorBox: {
    background: '#ff000033',
    border: '1px solid #ff4444',
    padding: '0.75rem',
    borderRadius: '5px',
    color: '#ff6666',
    fontSize: '0.85rem',
  },
  button: {
    padding: '0.4rem 0.8rem',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    cursor: 'pointer',
    border: 'none',
    marginRight: '0.5rem',
  },
  primaryButton: {
    backgroundColor: '#00ff00',
    color: '#000',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    color: '#00ff00',
    border: '1px solid #00ff00',
  },
};

interface LoreViewerProps {
  lorePath: string | null;
  onClose: () => void;
}

export default function LoreViewer({ lorePath, onClose }: LoreViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!lorePath) return;
    
    setLoading(true);
    setError(null);
    setEditing(false);

    fetch(`/api/admin/lore/file?path=${encodeURIComponent(lorePath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setContent(data.data.content);
          setExists(data.data.exists);
        } else {
          setError(data.error || 'Failed to load lore');
        }
      })
      .catch(() => setError('Failed to load lore'))
      .finally(() => setLoading(false));
  }, [lorePath]);

  function handleSave() {
    if (!lorePath) return;

    fetch('/api/admin/lore/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: lorePath, content }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setEditing(false);
          alert('Lore saved!');
        } else {
          setError(data.error || 'Failed to save');
        }
      })
      .catch(() => setError('Failed to save'));
  }

  if (!lorePath) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>📖 Lore</h3>
            <div style={styles.path}>{lorePath}</div>
          </div>
          <button style={styles.closeButton} onClick={onClose}>Close</button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {!exists && !loading && (
          <div style={{ marginBottom: '1rem', color: '#888', fontSize: '0.85rem' }}>
            This lore file doesn't exist yet.
          </div>
        )}

        {editing ? (
          <textarea
            style={{
              flex: 1,
              width: '100%',
              backgroundColor: '#0d0d1a',
              color: '#00ff00',
              border: '1px solid #333',
              padding: '1rem',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              resize: 'none',
              marginBottom: '1rem',
            }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus
          />
        ) : (
          <div style={styles.content}>
            {loading ? 'Loading...' : content || 'No content'}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          {editing ? (
            <>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={handleSave}>
                Save
              </button>
              <button style={{ ...styles.button, ...styles.secondaryButton }} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => setEditing(true)}>
              {exists ? 'Edit Lore' : 'Create Lore'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Step 6: Update ContentCard to Show Lore Button

**File**: `admin/src/app/story-builder/components/ContentCard.tsx` (modify)

Add a "View Lore" button if `item.fields.lore_path` or `item.fields.narrative_path` exists:

```typescript
// Add state for lore viewer
const [showLore, setShowLore] = useState(false);
const lorePath = item.fields.lore_path || item.fields.narrative_path || null;

// In the card header, add a lore button:
<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
  {lorePath && (
    <button
      style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
      onClick={() => setShowLore(true)}
    >
      📖 View Lore
    </button>
  )}
  <button style={styles.removeButton} onClick={() => onRemove(index)}>
    Remove
  </button>
</div>

// At the end of the component, add the LoreViewer:
{showLore && lorePath && (
  <LoreViewer lorePath={lorePath} onClose={() => setShowLore(false)} />
)}
```

### Step 7: Add Path Validation

**File**: `server/src/content/validate.ts` (modify)

Add a validation check for `lore_path` and `narrative_path` fields:

```typescript
// In validateYAMLFile(), after schema validation:
const lorePath = data?.lore_path;
const narrativePath = data?.narrative_path;

if (lorePath) {
  const fullPath = path.resolve(contentDir, '..', lorePath); // lore paths are relative to project root
  try {
    await fs.access(fullPath);
  } catch {
    warnings.push({
      file: filePath,
      message: `Lore file not found: ${lorePath}`,
      severity: 'warning',
    });
  }
}

if (narrativePath) {
  const fullPath = path.join(contentDir, narrativePath);
  try {
    await fs.access(fullPath);
  } catch {
    warnings.push({
      file: filePath,
      message: `Narrative file not found: ${narrativePath}`,
      severity: 'warning',
    });
  }
}
```

## Verification

```bash
# 1. Lint admin and server
npm run lint --workspace=admin
npm run lint --workspace=server

# 2. Build both
npm run build --workspace=admin
npm run build --workspace=server

# 3. Rebuild server container (if using Docker)
docker compose build server && docker compose up -d server

# 4. Verify server health
docker exec las-flores-server wget -qO- http://localhost:3000/health

# 5. Manual test:
#    - Go to http://localhost:3001/story-builder
#    - Generate a plan for a character
#    - Verify Step 2 shows a "View Lore" button
#    - Click "View Lore" — should show empty lore file with "Create Lore" button
#    - Click "Create Lore", write some markdown, save
#    - Verify the lore file is created on disk
#    - Refresh the page, verify lore persists
#    - Verify validation warns if lore_path points to non-existent file
```

## Rollback

1. Revert changes to `shared/src/schemas/yaml-content.ts`
2. Revert changes to `server/src/services/ContentSkeletonGenerator.ts`
3. Delete `server/src/routes/admin-lore.ts`
4. Delete `admin/src/app/api/admin/lore/file/route.ts`
5. Delete `admin/src/app/story-builder/components/LoreViewer.tsx`
6. Revert changes to `admin/src/app/story-builder/components/ContentCard.tsx`
7. Revert changes to `server/src/content/validate.ts`
8. Commit: `revert: rollback Milestone 2`

## Files Modified

- `shared/src/schemas/yaml-content.ts` (modified)
- `server/src/services/ContentSkeletonGenerator.ts` (modified)
- `server/src/content/validate.ts` (modified)
- `server/src/routes/admin-lore.ts` (new)
- `server/src/routes/index.ts` (modified — register new router)
- `admin/src/app/api/admin/lore/file/route.ts` (new)
- `admin/src/app/story-builder/components/LoreViewer.tsx` (new)
- `admin/src/app/story-builder/components/ContentCard.tsx` (modified)

## Next Steps

After this milestone:
- Milestone 3 adds asset path unification (store relative paths instead of MinIO URLs)
- The lore integration is already in place, so asset path unification can follow the same pattern