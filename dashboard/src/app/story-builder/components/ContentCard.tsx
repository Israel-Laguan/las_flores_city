'use client';

import { useState } from 'react';
import type { ContentPlanItem } from '@las-flores/shared';
import { getFieldsForType, type FieldDefinition } from './FieldDefinitions';
import LoreViewer from './LoreViewer';

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
  character: '\u{1F464}',
  dialogue: '\u{1F4AC}',
  scene: '\u{1F5FA}',
  mission: '\u{1F50D}',
  story: '\u{1F4DA}',
  overlay: '\u{1F504}',
  vault: '\u{1F510}',
  gig: '\u{1F4BC}',
  shop_item: '\u{1F6D2}',
  location: '\u{1F4CD}',
  story_beat: '\u{1F4D6}',
  map_tile: '\u{1F5FA}',
};

interface ContentCardProps {
  item: ContentPlanItem;
  index: number;
  allItems?: ContentPlanItem[];
  onFieldChange: (index: number, field: string, value: string) => void;
  onRemove: (index: number) => void;
  onAssetPathRemove?: (index: number, key: string) => void;
  onDependsOnChange?: (index: number, dependsOn: string[]) => void;
}

function AssetNeedsSection({ assetNeeds, assetPaths, onRemoveAssetPath }: { assetNeeds: ContentPlanItem['assetNeeds']; assetPaths?: Record<string, string>; onRemoveAssetPath?: (key: string) => void }) {
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});

  function getAssetImageUrl(assetPath: string): string {
    if (!assetPath) return '';
    return `/api/admin/asset?path=${encodeURIComponent(assetPath)}`;
  }

  return (
    <div style={styles.imageSection}>
      <div style={styles.imageLabel}>Assets Needed</div>
      {assetNeeds.map((need, i) => {
        const assetPath = assetPaths?.[need.promptType] || assetPaths?.[need.targetField];
        const imageUrl = assetPath ? getAssetImageUrl(assetPath) : null;

        return (
          <div key={i} style={{ marginBottom: '0.75rem' }}>
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={styles.assetTag}>{need.promptType}: {need.targetField}</span>
              <span style={{ color: '#888', fontSize: '0.75rem' }}>[{need.status}]</span>
            </div>

            {imageUrl && !imageErrors[i] ? (
              <img
                src={imageUrl}
                alt={need.promptType}
                style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '5px', marginBottom: '0.5rem', backgroundColor: '#1a1a2e' }}
                onError={() => setImageErrors(prev => ({ ...prev, [i]: true }))}
              />
            ) : (
              <div style={styles.imagePlaceholder}>
                {assetPath ? 'Failed to load image' : 'No image path specified'}
              </div>
            )}

            <div style={{ marginTop: '0.5rem' }}>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => window.open('/assets', '_blank')}>
                {assetPath ? 'Replace Image' : 'Generate Image'}
              </button>
              {assetPath && onRemoveAssetPath && (
                <button
                  style={{ ...styles.button, ...styles.secondaryButton }}
                  onClick={() => onRemoveAssetPath(need.promptType || need.targetField)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardHeader({ icon, name, type, action, lorePath, narrativePath, onShowLore, onShowNarrative, onRemove, index }: {
  icon: string;
  name: string;
  type: string;
  action: string;
  lorePath: string | null;
  narrativePath: string | null;
  onShowLore: () => void;
  onShowNarrative: () => void;
  onRemove: (index: number) => void;
  index: number;
}) {
  return (
    <div style={styles.cardHeader}>
      <div>
        <h3 style={styles.cardTitle}>
          {icon} {name || 'Untitled'}
        </h3>
        <span style={styles.cardMeta}>
          {type} &middot; {action}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {lorePath && (
          <button
            style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.75rem', padding: '0.3rem 0.6rem', marginRight: 0 }}
            onClick={onShowLore}
          >
            Lore
          </button>
        )}
        {narrativePath && (
          <button
            style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.75rem', padding: '0.3rem 0.6rem', marginRight: 0 }}
            onClick={onShowNarrative}
          >
            Narrative
          </button>
        )}
        <button style={styles.removeButton} onClick={() => onRemove(index)}>
          Remove
        </button>
      </div>
    </div>
  );
}

function FieldsSection({ fields, item, onFieldChange }: {
  fields: FieldDefinition[];
  item: ContentPlanItem;
  onFieldChange: (field: FieldDefinition, value: string) => void;
}) {
  return (
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
                onChange={(e) => onFieldChange(field, e.target.value)}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
              />
            ) : (
              <input
                type="text"
                style={styles.input}
                value={value}
                onChange={(e) => onFieldChange(field, e.target.value)}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DependenciesSection({ allItems, item, onDependsOnChange, index }: {
  allItems: ContentPlanItem[];
  item: ContentPlanItem;
  onDependsOnChange?: (index: number, dependsOn: string[]) => void;
  index: number;
}) {
  if (allItems.length <= 1) return null;
  return (
    <div style={styles.fieldGroup}>
      <label style={styles.label}>Dependencies (items that must be created first)</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {allItems
          .filter(other => other.id !== item.id)
          .map(other => {
            const isSelected = item.dependsOn?.includes(other.id) ?? false;
            return (
              <button
                key={other.id}
                style={{
                  ...styles.button,
                  ...(isSelected ? styles.primaryButton : styles.secondaryButton),
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  marginRight: 0,
                }}
                onClick={() => {
                  if (!onDependsOnChange) return;
                  const newDeps = isSelected
                    ? (item.dependsOn || []).filter(id => id !== other.id)
                    : [...(item.dependsOn || []), other.id];
                  onDependsOnChange(index, newDeps);
                }}
              >
                {other.name || other.slug}
              </button>
            );
          })}
      </div>
    </div>
  );
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
  return current !== undefined && current !== null ? String(current) : '';
}

export default function ContentCard({ item, index, allItems = [], onFieldChange, onRemove, onAssetPathRemove, onDependsOnChange }: ContentCardProps) {
  const fields = getFieldsForType(item.type);
  const icon = TYPE_ICONS[item.type] || '\u{1F4C4}';
  const [showLore, setShowLore] = useState(false);
  const [showNarrative, setShowNarrative] = useState(false);
  const lorePath = item.fields.lore_path || null;
  const narrativePath = item.fields.narrative_path || null;
  const assetPaths = item.fields.asset_paths as Record<string, string> | undefined;

  function handleFieldChange(field: FieldDefinition, value: string) {
    onFieldChange(index, field.key, value);
  }

  return (
    <div style={styles.card}>
      <CardHeader
        icon={icon}
        name={item.name}
        type={item.type}
        action={item.action}
        lorePath={lorePath}
        narrativePath={narrativePath}
        onShowLore={() => setShowLore(true)}
        onShowNarrative={() => setShowNarrative(true)}
        onRemove={onRemove}
        index={index}
      />

      <FieldsSection fields={fields} item={item} onFieldChange={handleFieldChange} />

      <DependenciesSection allItems={allItems} item={item} onDependsOnChange={onDependsOnChange} index={index} />

      {item.assetNeeds.length > 0 && (
        <AssetNeedsSection
          assetNeeds={item.assetNeeds}
          assetPaths={assetPaths}
          onRemoveAssetPath={onAssetPathRemove ? (key) => onAssetPathRemove(index, key) : undefined}
        />
      )}

      {showLore && lorePath && (
        <LoreViewer lorePath={lorePath} onClose={() => setShowLore(false)} />
      )}
      {showNarrative && narrativePath && (
        <LoreViewer lorePath={narrativePath} onClose={() => setShowNarrative(false)} readOnly />
      )}
    </div>
  );
}
