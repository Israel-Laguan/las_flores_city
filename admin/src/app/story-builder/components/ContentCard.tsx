'use client';

import { useState } from 'react';
import type { ContentPlanItem } from '@las-flores/shared';
import { cn } from '@/lib/cn';
import { serverAssetUrl } from '@/lib/client-api';
import { getFieldsForType, type FieldDefinition } from './FieldDefinitions';
import LoreViewer from './LoreViewer';
import styles from './ContentCard.module.css';

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

function AssetNeedsSection({ assetNeeds, assetPaths, onRemoveAssetPath }: {
  assetNeeds: ContentPlanItem['assetNeeds'];
  assetPaths?: Record<string, string>;
  onRemoveAssetPath?: (key: string) => void;
}) {
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});

  function getAssetImageUrl(assetPath: string): string {
    if (!assetPath) return '';
    return serverAssetUrl(assetPath);
  }

  return (
    <div className={styles.imageSection}>
      <div className={styles.imageLabel}>Assets Needed</div>
      {assetNeeds.map((need, i) => {
        const assetPath = assetPaths?.[need.promptType] || assetPaths?.[need.targetField];
        const imageUrl = assetPath ? getAssetImageUrl(assetPath) : null;

        return (
          <div key={i} className={styles.assetItem}>
            <div className={styles.assetHeader}>
              <span className={styles.assetTag}>{need.promptType}: {need.targetField}</span>
              <span className={styles.assetStatus}>[{need.status}]</span>
            </div>

            {imageUrl && !imageErrors[i] ? (
              <img
                src={imageUrl}
                alt={need.promptType}
                style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '5px', marginBottom: '0.5rem', background: 'var(--page-bg)' }}
                onError={() => setImageErrors(prev => ({ ...prev, [i]: true }))}
              />
            ) : (
              <div className={styles.imagePlaceholder}>
                {assetPath ? 'Failed to load image' : 'No image path specified'}
              </div>
            )}

            <div className={styles.assetActions}>
              <button className={cn('btn', 'btn--primary')} onClick={() => window.open('/assets', '_blank')}>
                {assetPath ? 'Replace Image' : 'Generate Image'}
              </button>
              {assetPath && onRemoveAssetPath && (
                <button
                  className={cn('btn', 'btn--secondary')}
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
          <div key={field.key} className={styles.fieldGroup}>
            <label className={styles.label}>{field.label}</label>
            {field.multiline ? (
              <textarea
                className={styles.textarea}
                value={value}
                onChange={(e) => onFieldChange(field, e.target.value)}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
              />
            ) : (
              <input
                type="text"
                className={styles.input}
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
    <div className={styles.fieldGroup}>
      <label className={styles.label}>Dependencies (items that must be created first)</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {allItems
          .filter(other => other.id !== item.id)
          .map(other => {
            const isSelected = item.dependsOn?.includes(other.id) ?? false;
            return (
              <button
                key={other.id}
                className={cn('btn', 'btn--small', isSelected ? 'btn--primary' : 'btn--secondary')}
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
    <div className="card">
      <div className="card__header">
        <div>
          <h3 className="card__title">
            {icon} {item.name || 'Untitled'}
          </h3>
          <span className="card__meta">
            {item.type} &middot; {item.action}
          </span>
        </div>
        <div className={styles.headerActions}>
          {lorePath && (
            <button
              className={cn('btn', 'btn--secondary', 'btn--small')}
              onClick={() => setShowLore(true)}
            >
              Lore
            </button>
          )}
          {narrativePath && (
            <button
              className={cn('btn', 'btn--secondary', 'btn--small')}
              onClick={() => setShowNarrative(true)}
            >
              Narrative
            </button>
          )}
          <button className="btn btn--danger" onClick={() => onRemove(index)}>
            Remove
          </button>
        </div>
      </div>

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
