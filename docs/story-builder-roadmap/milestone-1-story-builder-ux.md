# Milestone 1: Story Builder UX Refinement

**Goal**: Replace the raw JSON editor in Step 2 ("Review Plan") with user-friendly text + image cards.

**Effort**: Medium (2-3 hours)

**Prerequisites**: None — this is the first milestone.

## Scope

### In Scope
- Replace `PlanItemCard` JSON textarea with type-specific text forms
- Add plan summary dashboard at top of Step 2
- Improve error messages in Step 4 to be human-readable
- Add image placeholders with "Generate" links for items with `assetNeeds`

### Out of Scope
- YAML path references (Milestone 2)
- Asset path unification (Milestone 3)
- Inline markdown editing (Milestone 4)
- Migration of existing content (Milestone 5)

## Implementation Steps

### Step 1: Create Field Definitions

**File**: `admin/src/app/story-builder/components/FieldDefinitions.ts` (new)

Create a mapping of content types to their editable text fields. Each field definition includes:
- `label`: Human-readable field name
- `key`: Path to the field in `item.fields` (dot notation for nested fields)
- `placeholder`: Example text
- `multiline`: Whether to use a textarea (true) or input (false)

```typescript
export interface FieldDefinition {
  label: string;
  key: string; // e.g. "description" or "metadata.personality"
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}

export const FIELD_DEFINITIONS: Record<string, FieldDefinition[]> = {
  character: [
    { label: 'Name', key: 'name', placeholder: 'Character name' },
    { label: 'Title', key: 'title', placeholder: 'e.g. Bartender at The Neon Flask' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
    { label: 'Personality', key: 'metadata.personality', placeholder: 'e.g. reluctant_hero' },
    { label: 'Faction', key: 'metadata.faction', placeholder: 'e.g. independent' },
    { label: 'Role', key: 'metadata.role', placeholder: 'e.g. npc' },
  ],
  scene: [
    { label: 'Name', key: 'name', placeholder: 'Scene name' },
    { label: 'District', key: 'district', placeholder: 'e.g. downtown' },
    { label: 'Mood', key: 'mood', placeholder: 'e.g. bustling, tense, mysterious' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
  ],
  dialogue: [
    { label: 'Name', key: 'name', placeholder: 'Dialogue name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 500 },
  ],
  mission: [
    { label: 'Title', key: 'title', placeholder: 'Mission title' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
  ],
  location: [
    { label: 'Name', key: 'name', placeholder: 'Location name' },
    { label: 'District', key: 'district', placeholder: 'e.g. central' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
  ],
  story: [
    { label: 'Name', key: 'name', placeholder: 'Story name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
  ],
  shop_item: [
    { label: 'Name', key: 'name', placeholder: 'Item name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 500 },
    { label: 'Price', key: 'price', placeholder: 'e.g. 100' },
    { label: 'Currency', key: 'currency', placeholder: 'e.g. credits' },
  ],
  gig: [
    { label: 'Name', key: 'name', placeholder: 'Gig name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
    { label: 'Reward', key: 'reward', placeholder: 'e.g. 500 credits' },
  ],
  vault: [
    { label: 'Name', key: 'name', placeholder: 'Vault item name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 500 },
    { label: 'Item Type', key: 'item_type', placeholder: 'e.g. clue, memento, premium_cg' },
  ],
  overlay: [
    { label: 'Name', key: 'name', placeholder: 'Overlay name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 500 },
  ],
  story_beat: [
    { label: 'Description', key: 'description', multiline: true, maxLength: 500 },
  ],
  map_tile: [
    { label: 'Terrain Type', key: 'terrain_type', placeholder: 'e.g. street, building, park' },
  ],
};

export function getFieldsForType(type: string): FieldDefinition[] {
  return FIELD_DEFINITIONS[type] || [
    { label: 'Name', key: 'name', placeholder: 'Name' },
    { label: 'Description', key: 'description', multiline: true },
  ];
}
```

### Step 2: Create ContentCard Component

**File**: `admin/src/app/story-builder/components/ContentCard.tsx` (new)

Create a card component that renders type-specific text fields and image placeholders.

```typescript
'use client';

import { useState } from 'react';
import type { ContentPlanItem } from '@las-flores/shared';
import { getFieldsForType, type FieldDefinition } from './FieldDefinitions';

const styles = {
  card: {
    border: '1px solid #333',
    padding: '1.5rem',
    borderRadius: '5px',
    marginBottom: '1rem',
    backgroundColor: '#0d0d1a',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    borderBottom: '1px solid #333',
    paddingBottom: '0.5rem',
  },
  cardTitle: {
    color: '#00ff00',
    fontSize: '1rem',
    fontWeight: 'bold' as const,
    margin: 0,
  },
  cardMeta: {
    color: '#888',
    fontSize: '0.85rem',
  },
  fieldGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    color: '#888',
    fontSize: '0.85rem',
    marginBottom: '0.25rem',
  },
  input: {
    width: '100%',
    padding: '0.5rem',
    backgroundColor: '#1a1a2e',
    color: '#00ff00',
    border: '1px solid #333',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%',
    padding: '0.5rem',
    backgroundColor: '#1a1a2e',
    color: '#00ff00',
    border: '1px solid #333',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    minHeight: '80px',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  imageSection: {
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: '#1a1a2e',
    borderRadius: '5px',
    border: '1px solid #333',
  },
  imageLabel: {
    color: '#888',
    fontSize: '0.85rem',
    marginBottom: '0.5rem',
  },
  imagePlaceholder: {
    width: '100%',
    height: '150px',
    backgroundColor: '#333',
    borderRadius: '5px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#888',
    fontSize: '0.9rem',
    marginBottom: '0.5rem',
  },
  imagePreview: {
    width: '100%',
    maxHeight: '200px',
    objectFit: 'contain' as const,
    borderRadius: '5px',
    marginBottom: '0.5rem',
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
  dangerButton: {
    backgroundColor: '#ff4444',
    color: '#fff',
  },
  removeButton: {
    padding: '0.3rem 0.6rem',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    cursor: 'pointer',
    border: 'none',
    backgroundColor: '#ff4444',
    color: '#fff',
  },
  assetTag: {
    display: 'inline-block',
    backgroundColor: '#ff000022',
    color: '#ff6666',
    padding: '0.15rem 0.5rem',
    borderRadius: '3px',
    fontSize: '0.75rem',
    marginRight: '0.5rem',
    marginBottom: '0.25rem',
  },
};

const TYPE_ICONS: Record<string, string> = {
  character: '👤',
  dialogue: '💬',
  scene: '🗺️',
  mission: '🔍',
  story: '📚',
  overlay: '🔄',
  vault: '🔐',
  gig: '💼',
  shop_item: '🛒',
  location: '📍',
  story_beat: '📖',
  map_tile: '🗺️',
};

interface ContentCardProps {
  item: ContentPlanItem;
  index: number;
  onFieldChange: (index: number, field: string, value: string) => void;
  onRemove: (index: number) => void;
}

export default function ContentCard({ item, index, onFieldChange, onRemove }: ContentCardProps) {
  const fields = getFieldsForType(item.type);
  const icon = TYPE_ICONS[item.type] || '📄';

  function handleFieldChange(field: FieldDefinition, value: string) {
    onFieldChange(index, field.key, value);
  }

  function getNestedValue(obj: Record<string, any>, path: string): string {
    const parts = path.split('.');
    let current: any = obj;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return '';
      }
    }
    return typeof current === 'string' ? current : '';
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h3 style={styles.cardTitle}>
            {icon} {item.name || 'Untitled'}
          </h3>
          <span style={styles.cardMeta}>
            {item.type} · {item.action}
          </span>
        </div>
        <button style={styles.removeButton} onClick={() => onRemove(index)}>
          Remove
        </button>
      </div>

      <div>
        {fields.map((field) => {
          const value = getNestedValue(item.fields, field.key);
          return (
            <div key={field.key} style={styles.fieldGroup}>
              <label style={styles.label}>{field.label}</label>
              {field.multiline ? (
                <textarea
                  style={styles.textarea}
                  value={value}
                  onChange={(e) => handleFieldChange(field, e.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                />
              ) : (
                <input
                  type="text"
                  style={styles.input}
                  value={value}
                  onChange={(e) => handleFieldChange(field, e.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                />
              )}
            </div>
          );
        })}
      </div>

      {item.assetNeeds.length > 0 && (
        <div style={styles.imageSection}>
          <div style={styles.imageLabel}>📷 Assets Needed</div>
          {item.assetNeeds.map((need, i) => (
            <div key={i} style={{ marginBottom: '0.75rem' }}>
              <div style={{ marginBottom: '0.25rem' }}>
                <span style={styles.assetTag}>
                  {need.promptType}: {need.targetField}
                </span>
                <span style={{ color: '#888', fontSize: '0.75rem' }}>
                  [{need.status}]
                </span>
              </div>
              <div style={styles.imagePlaceholder}>
                No image yet
              </div>
              <button
                style={{ ...styles.button, ...styles.primaryButton }}
                onClick={() => {
                  // TODO: Link to asset generation (future milestone)
                  window.open('/assets', '_blank');
                }}
              >
                Generate Image
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Step 3: Create Plan Summary Component

**File**: `admin/src/app/story-builder/components/PlanSummary.tsx` (new)

Create a summary dashboard showing plan overview.

```typescript
'use client';

import type { ContentPlan } from '@las-flores/shared';

const styles = {
  summary: {
    border: '1px solid #00ff00',
    padding: '1.5rem',
    borderRadius: '5px',
    marginBottom: '2rem',
    backgroundColor: '#0d0d1a',
  },
  heading: {
    color: '#00ff00',
    fontSize: '1.1rem',
    fontWeight: 'bold' as const,
    marginBottom: '0.5rem',
    margin: '0 0 0.5rem 0',
  },
  description: {
    color: '#aaa',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  stats: {
    display: 'flex',
    gap: '1.5rem',
    flexWrap: 'wrap' as const,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold' as const,
    color: '#00ff00',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#888',
  },
  breakdown: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #333',
  },
  breakdownTitle: {
    fontSize: '0.85rem',
    color: '#888',
    marginBottom: '0.5rem',
  },
  badge: {
    display: 'inline-block',
    backgroundColor: '#00ff0022',
    color: '#00ff00',
    padding: '0.15rem 0.5rem',
    borderRadius: '3px',
    fontSize: '0.75rem',
    marginRight: '0.5rem',
    marginBottom: '0.25rem',
  },
  assetBadge: {
    display: 'inline-block',
    backgroundColor: '#ff000022',
    color: '#ff6666',
    padding: '0.15rem 0.5rem',
    borderRadius: '3px',
    fontSize: '0.75rem',
    marginRight: '0.5rem',
    marginBottom: '0.25rem',
  },
};

interface PlanSummaryProps {
  plan: ContentPlan;
}

export default function PlanSummary({ plan }: PlanSummaryProps) {
  const totalItems = plan.items.length;
  const createCount = plan.items.filter((i) => i.action === 'create').length;
  const updateCount = plan.items.filter((i) => i.action === 'update').length;
  const totalAssets = plan.items.reduce((sum, i) => sum + i.assetNeeds.length, 0);

  // Count by type
  const typeCounts: Record<string, number> = {};
  for (const item of plan.items) {
    typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
  }

  return (
    <div style={styles.summary}>
      <h2 style={styles.heading}>Plan Summary</h2>
      <p style={styles.description}>{plan.description}</p>

      <div style={styles.stats}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{totalItems}</span>
          <span style={styles.statLabel}>Total Items</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{createCount}</span>
          <span style={styles.statLabel}>New</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{updateCount}</span>
          <span style={styles.statLabel}>Updates</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{totalAssets}</span>
          <span style={styles.statLabel}>Assets Needed</span>
        </div>
      </div>

      <div style={styles.breakdown}>
        <div style={styles.breakdownTitle}>Items by Type:</div>
        {Object.entries(typeCounts).map(([type, count]) => (
          <span key={type} style={styles.badge}>
            {type}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}
```

### Step 4: Refactor Story Builder Page

**File**: `admin/src/app/story-builder/page.tsx` (modify)

Changes:
1. Import `ContentCard` and `PlanSummary`
2. Replace `PlanItemCard` usage with `ContentCard`
3. Add `PlanSummary` at top of Step 2
4. Improve error messages in Step 4

**Specific changes**:

```typescript
// Add imports at top
import ContentCard from './components/ContentCard';
import PlanSummary from './components/PlanSummary';

// In renderStep2(), replace PlanItemCard with ContentCard:
function renderStep2() {
  if (!plan) return null;
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionHeading}>Step 2: Review Plan</h2>
      <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Review and edit the proposed content. All text fields are editable.
      </p>
      
      <PlanSummary plan={plan} />

      {plan.items.map((item, i) => (
        <ContentCard
          key={item.id}
          item={item}
          index={i}
          onFieldChange={updateItemField}
          onRemove={removeItem}
        />
      ))}

      <button style={{ ...styles.button, ...styles.secondaryButton, marginTop: '0.5rem' }} onClick={addItem}>
        + Add Item
      </button>
    </div>
  );
}

// In renderStep4(), improve error messages:
function renderStep4() {
  if (!executionResult) return null;
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionHeading}>Step 4: Results & Assets</h2>

      {executionResult.success ? (
        <div style={styles.successBox}>
          <p style={{ fontWeight: 'bold' }}>✅ Plan executed successfully!</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Created {executionResult.createdFiles?.length ?? 0} files.
          </p>
        </div>
      ) : (
        <div style={styles.errorBox}>
          <p style={{ fontWeight: 'bold' }}>❌ Execution failed</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            {executionResult.error || 'Validation failed'}
          </p>
          {executionResult.validationErrors && executionResult.validationErrors.length > 0 && (
            <ul style={{ fontSize: '0.85rem', marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
              {executionResult.validationErrors.map((e: string, i: number) => (
                <li key={i} style={{ color: '#ff6666' }}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ... rest of the component stays the same ... */}
    </div>
  );
}
```

### Step 5: Update Field Change Handlers

The existing `updateItemField` function needs to support nested field paths (e.g., `metadata.personality`).

**In `admin/src/app/story-builder/page.tsx`**:

```typescript
function updateItemField(index: number, fieldPath: string, value: string) {
  if (!plan) return;
  const items = [...plan.items];
  const item = { ...items[index] };
  const fields = { ...item.fields };

  // Handle nested fields (e.g., "metadata.personality")
  const parts = fieldPath.split('.');
  if (parts.length === 1) {
    fields[fieldPath] = value;
  } else {
    let current: any = fields;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = { ...current[part] };
    }
    current[parts[parts.length - 1]] = value;
    
    // Rebuild nested object
    let rebuilt: any = fields;
    for (let i = parts.length - 2; i >= 0; i--) {
      rebuilt = { ...rebuilt, [parts[i]]: { ...(typeof rebuilt[parts[i]] === 'object' ? rebuilt[parts[i]] : {}), [parts[i + 1]]: current } };
      current = rebuilt;
    }
    Object.assign(fields, rebuilt);
  }

  items[index] = { ...item, fields };
  setPlan({ ...plan, items });
}
```

## Verification

```bash
# 1. Lint admin
npm run lint --workspace=admin

# 2. Build admin
npm run build --workspace=admin

# 3. Start dev server (if not running)
npm run dev

# 4. Manual test:
#    - Go to http://localhost:3001/story-builder
#    - Enter a description: "Add a bartender named Diego who works at the Plaza"
#    - Click "Generate Plan"
#    - Verify Step 2 shows text fields (not JSON)
#    - Edit a text field, verify it updates
#    - Verify image placeholders show for asset needs
#    - Verify plan summary shows correct counts
#    - Click "Approve & Execute"
#    - Verify Step 4 shows friendly error messages (if any)
```

## Rollback

If issues arise:
1. Revert `admin/src/app/story-builder/page.tsx` to previous version
2. Delete new component files:
   - `admin/src/app/story-builder/components/FieldDefinitions.ts`
   - `admin/src/app/story-builder/components/ContentCard.tsx`
   - `admin/src/app/story-builder/components/PlanSummary.tsx`
3. Commit with message: `revert: rollback Milestone 1`

## Files Modified

- `admin/src/app/story-builder/page.tsx` (modified)
- `admin/src/app/story-builder/components/FieldDefinitions.ts` (new)
- `admin/src/app/story-builder/components/ContentCard.tsx` (new)
- `admin/src/app/story-builder/components/PlanSummary.tsx` (new)

## Next Steps

After this milestone:
- Milestone 2 adds `lore_path`/`narrative_path` to YAML schemas and a "View Lore" button
- The text cards are already in place, so adding lore viewing is straightforward