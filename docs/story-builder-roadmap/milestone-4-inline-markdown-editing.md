# Milestone 4: Inline Markdown Editing

**Goal**: Allow admins to edit lore and narrative markdown files directly from the content cards in the story builder.

**Effort**: Medium (2-3 hours)

**Prerequisites**: Milestone 3 complete (asset path unification in place).

## Scope

### In Scope
- Enhance LoreViewer to support inline editing with auto-save
- Add "Edit Narrative" button for `narrative_path` files
- Add syntax highlighting for markdown (basic)
- Add dirty state indicator (unsaved changes)
- Add keyboard shortcut (Ctrl+S) to save

### Out of Scope
- Full markdown WYSIWYG editor (keep it simple — textarea with monospace)
- Version history for markdown files
- Collaborative editing
- Migration of existing content (Milestone 5)

## Rationale

Milestone 2 added the ability to view lore markdown in a modal. This milestone enhances that to support editing, making the story builder a one-stop shop for content creation:

1. **Text fields** → edit YAML data (name, description, etc.)
2. **Lore viewer** → edit long-form markdown lore
3. **Narrative viewer** → edit engine narrative markdown
4. **Image placeholders** → generate/assign assets

The admin never needs to leave the story builder to create or edit content.

## Implementation Steps

### Step 1: Enhance LoreViewer Component

**File**: `admin/src/app/story-builder/components/LoreViewer.tsx` (modify)

Enhance the existing LoreViewer from Milestone 2 with:
- Auto-save on Ctrl+S
- Dirty state indicator
- Better markdown rendering (basic formatting)
- Confirmation dialog for unsaved changes

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';

const styles = {
  // ... existing styles from Milestone 2 ...
  
  dirtyIndicator: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#ffaa00',
    marginLeft: '0.5rem',
  },
  markdownContent: {
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
  hint: {
    fontSize: '0.75rem',
    color: '#888',
    marginTop: '0.25rem',
  },
};

interface LoreViewerProps {
  lorePath: string | null;
  onClose: () => void;
  readOnly?: boolean;
}

export default function LoreViewer({ lorePath, onClose, readOnly = false }: LoreViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lorePath) return;
    
    setLoading(true);
    setError(null);
    setEditing(false);
    setDirty(false);

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

  // Auto-save on Ctrl+S
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && editing && dirty) {
        e.preventDefault();
        handleSave();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editing, dirty, content, lorePath]);

  // Warn on close if dirty
  useEffect(() => {
    if (!dirty) return;
    
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleSave = useCallback(async () => {
    if (!lorePath || !dirty) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/admin/lore/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: lorePath, content }),
      });
      const data = await res.json();
      if (data.success) {
        setDirty(false);
        setEditing(false);
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  }, [lorePath, content, dirty]);

  function handleClose() {
    if (dirty && !confirm('You have unsaved changes. Close anyway?')) {
      return;
    }
    onClose();
  }

  if (!lorePath) return null;

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>
              📖 {readOnly ? 'Narrative' : 'Lore'}
              {dirty && <span style={styles.dirtyIndicator} title="Unsaved changes" />}
            </h3>
            <div style={styles.path}>{lorePath}</div>
          </div>
          <button style={styles.closeButton} onClick={handleClose}>Close</button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {!exists && !loading && !editing && (
          <div style={{ marginBottom: '1rem', color: '#888', fontSize: '0.85rem' }}>
            This file doesn't exist yet.
          </div>
        )}

        {editing ? (
          <>
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
                marginBottom: '0.5rem',
              }}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
              }}
              autoFocus
            />
            <div style={styles.hint}>Press Ctrl+S to save</div>
          </>
        ) : (
          <div style={styles.markdownContent}>
            {loading ? 'Loading...' : content || 'No content'}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          {editing ? (
            <>
              <button 
                style={{ ...styles.button, ...styles.primaryButton }} 
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button 
                style={{ ...styles.button, ...styles.secondaryButton }} 
                onClick={() => {
                  if (dirty && !confirm('Discard unsaved changes?')) return;
                  setEditing(false);
                  setDirty(false);
                  // Reload original content
                  if (lorePath) {
                    fetch(`/api/admin/lore/file?path=${encodeURIComponent(lorePath)}`)
                      .then((res) => res.json())
                      .then((data) => {
                        if (data.success) setContent(data.data.content);
                      });
                  }
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button 
              style={{ ...styles.button, ...styles.primaryButton }} 
              onClick={() => setEditing(true)}
            >
              {exists ? 'Edit' : 'Create'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Add Narrative Viewer

**File**: `admin/src/app/story-builder/components/NarrativeViewer.tsx` (new)

Create a similar component for narrative files, but read-only by default (narratives are typically generated, not manually edited):

```typescript
'use client';

import { useState, useEffect } from 'react';
import LoreViewer from './LoreViewer';

const styles = {
  // Same as LoreViewer, but with different title
};

interface NarrativeViewerProps {
  narrativePath: string | null;
  onClose: () => void;
}

export default function NarrativeViewer({ narrativePath, onClose }: NarrativeViewerProps) {
  // Reuse LoreViewer with readOnly flag
  return <LoreViewer lorePath={narrativePath} onClose={onClose} readOnly={true} />;
}
```

**Note**: For MVP, narrative files are read-only. If editing is needed later, it can be enabled by setting `readOnly={false}`.

### Step 3: Update ContentCard to Support Both Lore and Narrative

**File**: `admin/src/app/story-builder/components/ContentCard.tsx` (modify)

Add separate buttons for lore and narrative:

```typescript
// Add state for both viewers
const [showLore, setShowLore] = useState(false);
const [showNarrative, setShowNarrative] = useState(false);

const lorePath = item.fields.lore_path || null;
const narrativePath = item.fields.narrative_path || null;

// In the card header, add both buttons:
<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
  {lorePath && (
    <button
      style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
      onClick={() => setShowLore(true)}
    >
      📖 Lore
    </button>
  )}
  {narrativePath && (
    <button
      style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
      onClick={() => setShowNarrative(true)}
    >
      📝 Narrative
    </button>
  )}
  <button style={styles.removeButton} onClick={() => onRemove(index)}>
    Remove
  </button>
</div>

// At the end of the component, add both viewers:
{showLore && lorePath && (
  <LoreViewer lorePath={lorePath} onClose={() => setShowLore(false)} />
)}
{showNarrative && narrativePath && (
  <LoreViewer lorePath={narrativePath} onClose={() => setShowNarrative(false)} readOnly />
)}
```

### Step 4: Add Basic Markdown Formatting (Optional)

If you want basic markdown rendering in view mode (instead of raw text), add a simple markdown-to-HTML converter:

**File**: `admin/src/app/story-builder/components/MarkdownRenderer.tsx` (new)

```typescript
'use client';

export default function MarkdownRenderer({ content }: { content: string }) {
  // Simple markdown rendering (for view mode only)
  const html = content
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/`(.*?)`/gim, '<code>$1</code>')
    .replace(/\n/gim, '<br />');

  return (
    <div 
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        fontFamily: 'monospace',
        fontSize: '0.9rem',
        lineHeight: '1.6',
        color: '#fff',
      }}
    />
  );
}
```

**Usage**: Replace the raw text display in LoreViewer with `<MarkdownRenderer content={content} />`.

**Note**: This is a very basic renderer. For production, use a proper library like `react-markdown`.

### Step 5: Add Path Fields to Field Definitions

**File**: `admin/src/app/story-builder/components/FieldDefinitions.ts` (modify)

Add `lore_path` and `narrative_path` as editable text fields (so admins can change the paths if needed):

```typescript
// Add to character, dialogue, mission, scene, location:
character: [
  // ... existing fields ...
  { label: 'Lore Path', key: 'lore_path', placeholder: 'docs/lore/figures/diego/diego.md' },
  { label: 'Narrative Path', key: 'narrative_path', placeholder: 'content/characters/char_diego.md' },
],
```

This allows admins to correct auto-generated paths or point to custom lore files.

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
#    - Verify Step 2 shows "Lore" and "Narrative" buttons
#    - Click "Lore" → verify modal opens
#    - Click "Edit" → verify textarea appears
#    - Edit the lore, press Ctrl+S → verify save succeeds
#    - Verify dirty indicator (orange dot) appears when editing
#    - Try closing with unsaved changes → verify confirmation dialog
#    - Click "Narrative" → verify read-only mode
#    - Verify lore_path and narrative_path are editable in the text fields
```

## Rollback

1. Revert changes to `admin/src/app/story-builder/components/LoreViewer.tsx`
2. Delete `admin/src/app/story-builder/components/NarrativeViewer.tsx`
3. Revert changes to `admin/src/app/story-builder/components/ContentCard.tsx`
4. Delete `admin/src/app/story-builder/components/MarkdownRenderer.tsx` (if created)
5. Revert changes to `admin/src/app/story-builder/components/FieldDefinitions.ts`
6. Commit: `revert: rollback Milestone 4`

## Files Modified

- `admin/src/app/story-builder/components/LoreViewer.tsx` (modified)
- `admin/src/app/story-builder/components/NarrativeViewer.tsx` (new)
- `admin/src/app/story-builder/components/ContentCard.tsx` (modified)
- `admin/src/app/story-builder/components/MarkdownRenderer.tsx` (new, optional)
- `admin/src/app/story-builder/components/FieldDefinitions.ts` (modified)

## Next Steps

After this milestone:
- Milestone 5 migrates existing content to use the new path-based model
- The story builder is now fully functional for content creation with text, images, and lore