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
  onFieldChange: (index: number, field: string, value: string) => void;
  onRemove: (index: number) => void;
}

function AssetNeedsSection({ assetNeeds }: { assetNeeds: ContentPlanItem['assetNeeds'] }) {
  return (
    <div style={styles.imageSection}>
      <div style={styles.imageLabel}>Assets Needed</div>
      {assetNeeds.map((need, i) => (
        <div key={i} style={{ marginBottom: '0.75rem' }}>
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={styles.assetTag}>{need.promptType}: {need.targetField}</span>
            <span style={{ color: '#888', fontSize: '0.75rem' }}>[{need.status}]</span>
          </div>
          <div style={styles.imagePlaceholder}>No image yet</div>
          <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => window.open('/assets', '_blank')}>
            Generate Image
          </button>
        </div>
      ))}
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
  return typeof current === 'string' ? current : '';
}

export default function ContentCard({ item, index, onFieldChange, onRemove }: ContentCardProps) {
  const fields = getFieldsForType(item.type);
  const icon = TYPE_ICONS[item.type] || '\u{1F4C4}';
  const [showLore, setShowLore] = useState(false);
  const lorePath = item.fields.lore_path || item.fields.narrative_path || null;

  function handleFieldChange(field: FieldDefinition, value: string) {
    onFieldChange(index, field.key, value);
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h3 style={styles.cardTitle}>
            {icon} {item.name || 'Untitled'}
          </h3>
          <span style={styles.cardMeta}>
            {item.type} &middot; {item.action}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {lorePath && (
            <button
              style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.75rem', padding: '0.3rem 0.6rem', marginRight: 0 }}
              onClick={() => setShowLore(true)}
            >
              View Lore
            </button>
          )}
          <button style={styles.removeButton} onClick={() => onRemove(index)}>
            Remove
          </button>
        </div>
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

      {item.assetNeeds.length > 0 && <AssetNeedsSection assetNeeds={item.assetNeeds} />}

      {showLore && lorePath && (
        <LoreViewer lorePath={lorePath} onClose={() => setShowLore(false)} />
      )}
    </div>
  );
}
