'use client';

import { useState } from 'react';
import type { ContentPlanItem } from '@las-flores/shared';
import { cn } from '@las-flores/ui';
import { serverAssetUrl } from '@/lib/client-api';
import { getFieldsForType, type FieldDefinition } from './FieldDefinitions';
import LoreViewer from './LoreViewer';
import * as api from '../hooks/useStoryBuilderApi';
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
  planId?: string | null;
  disabled?: boolean;
  onRegenerateLore?: (itemId: string) => void;
  onFieldChange: (index: number, field: string, value: string) => void;
  onRemove: (index: number) => void;
  onAssetPathRemove?: (index: number, key: string) => void;
  onDependsOnChange?: (index: number, dependsOn: string[]) => void;
  onGenerateDrafts?: () => void;
  onChooseDraft?: (itemId: string, promptType: string, filename: string) => void;
  draftAssets?: api.DraftAsset[];
  draftLoading?: boolean;
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

function AssetNeedsSection({
  item,
  assetNeeds,
  assetPaths,
  onRemoveAssetPath,
  onGenerateDrafts,
  onChooseDraft,
  draftAssets,
  draftLoading,
}: {
  item: ContentPlanItem;
  assetNeeds: ContentPlanItem['assetNeeds'];
  assetPaths?: Record<string, string>;
  onRemoveAssetPath?: (key: string) => void;
  onGenerateDrafts?: () => void;
  onChooseDraft?: (itemId: string, promptType: string, filename: string) => void;
  draftAssets?: api.DraftAsset[];
  draftLoading?: boolean;
}) {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState(true);

  function getAssetImageUrl(assetPath: string): string {
    if (!assetPath) return '';
    return serverAssetUrl(assetPath);
  }

  const defaultAssetName = `${item.slug}__default.png`;
  const selectedFilename = assetPaths
    ? Object.values(assetPaths)[0]
    : undefined;

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

            {imageUrl && !imageErrors[imageUrl] ? (
              <img
                src={imageUrl}
                alt={need.promptType}
                className={styles.assetPreview}
                onError={() => setImageErrors(prev => ({ ...prev, [imageUrl]: true }))}
              />
            ) : (
              <div className={styles.imagePlaceholder}>
                {assetPath ? 'Failed to load image' : 'No image selected'}
              </div>
            )}

            <div className={styles.assetActions}>
              <button
                className={cn('btn', 'btn--primary')}
                onClick={() => onGenerateDrafts?.()}
                disabled={draftLoading}
                title="Generate local PNG drafts from the entity prompt"
              >
                {draftLoading ? 'Generating…' : 'Generate Drafts'}
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

      {(draftAssets && draftAssets.length > 0) && (
        <div className={styles.draftGridSection}>
          <button className={cn('btn', 'btn--secondary', 'btn--small', styles.draftToggle)} onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Hide' : 'Show'} drafts ({draftAssets.length})
          </button>
          {expanded && <DraftGrid item={item} draftAssets={draftAssets} assetNeeds={assetNeeds} selectedFilename={selectedFilename} defaultAssetName={defaultAssetName} onChooseDraft={onChooseDraft} />}
        </div>
      )}
    </div>
  );
}

function DraftGrid({ item, draftAssets, assetNeeds, selectedFilename, defaultAssetName, onChooseDraft }: {
  item: ContentPlanItem;
  draftAssets: api.DraftAsset[];
  assetNeeds: ContentPlanItem['assetNeeds'];
  selectedFilename?: string;
  defaultAssetName: string;
  onChooseDraft?: (itemId: string, promptType: string, filename: string) => void;
}) {
  return (
    <div className={styles.draftGrid}>
      {draftAssets.map(draft => {
        const isSelected = draft.filename === selectedFilename;
        const isDefault = draft.filename === defaultAssetName;
        return (
          <button
            key={draft.filename}
            className={cn(styles.draftThumb, isSelected && styles.draftThumbSelected)}
            onClick={() => {
              const need = assetNeeds.find(n => (n.status === 'pending' || n.status === 'drafted' || n.status === 'chosen'));
              if (need) onChooseDraft?.(item.id, need.promptType, draft.filename);
            }}
            title={`Select ${draft.filename}${isDefault ? ' (default)' : ''}`}
            type="button"
          >
            <img src={draft.previewUrl} alt={draft.filename} className={styles.draftImage} />
            {isSelected && <span className={styles.draftCheck}>✓</span>}
            {isDefault && !isSelected && <span className={styles.draftDefaultBadge}>D</span>}
            <span className={styles.draftLabel}>{draft.filename}</span>
          </button>
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
        const isTodo = value.startsWith('TODO');
        const isFilled = !isTodo && !!value && item.filled_fields?.includes(field.key);
        return (
          <div key={field.key} className={styles.fieldGroup}>
            <label className={styles.label}>
              {field.label}
              {isTodo && <span className={styles.todoBadge}>TODO</span>}
              {isFilled && <span className={styles.filledBadge}>AI-filled</span>}
            </label>
            {field.multiline ? (
              <textarea
                className={cn(styles.textarea, isTodo && styles.todoField, isFilled && styles.filledField)}
                value={value}
                onChange={(e) => onFieldChange(field, e.target.value)}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
              />
            ) : (
              <input
                type="text"
                className={cn(styles.input, isTodo && styles.todoField, isFilled && styles.filledField)}
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

export default function ContentCard({ item, index, allItems = [], planId, disabled, onRegenerateLore, onFieldChange, onRemove, onAssetPathRemove, onDependsOnChange, onGenerateDrafts, onChooseDraft, draftAssets, draftLoading }: ContentCardProps) {
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
            <>
              <button
                className={cn('btn', 'btn--secondary', 'btn--small')}
                onClick={() => setShowLore(true)}
              >
                Lore
              </button>
              {onRegenerateLore && planId && (
                <button
                  className={cn('btn', 'btn--secondary', 'btn--small')}
                  onClick={() => onRegenerateLore(item.id)}
                  disabled={disabled}
                  title="Regenerate lore content"
                >
                  Regenerate
                </button>
              )}
            </>
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
          item={item}
          assetNeeds={item.assetNeeds}
          assetPaths={assetPaths}
          onRemoveAssetPath={onAssetPathRemove ? (key) => onAssetPathRemove(index, key) : undefined}
          onGenerateDrafts={onGenerateDrafts}
          onChooseDraft={onChooseDraft}
          draftAssets={draftAssets}
          draftLoading={draftLoading}
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
