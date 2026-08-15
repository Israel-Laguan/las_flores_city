'use client';

import type { ContentPlan } from '@las-flores/shared';
import * as api from '../hooks/useStoryBuilderApi';
import { cn } from '@las-flores/ui';
import ContentCard from './ContentCard';
import CritiqueOverlay from './CritiqueOverlay';
import styles from './ReviewStep.module.css';

function buildGenStatusByItem(genStatus: import('../types').GenerationStatus | null | undefined) {
  const map = new Map<string, { status: import('../types').GenerationItemStatus; error?: string }>();
  if (genStatus?.items) {
    for (const item of genStatus.items) {
      map.set(item.itemId, item);
    }
  }
  return map;
}

function computeUnplannedEntities(plan: import('@las-flores/shared').ContentPlan, items: import('@las-flores/shared').ContentPlan['items']) {
  const roster = plan._meta?.entity_roster;
  if (!roster) return [];
  const normalizeForCompare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return roster.filter(r =>
    !items.some(item =>
      normalizeForCompare(item.name) === normalizeForCompare(r.name) &&
      item.type === r.type
    )
  );
}

function collectAmbiguousItems(items: import('@las-flores/shared').ContentPlan['items']) {
  const result: Array<{ index: number; name: string; type: string; resolution: NonNullable<import('@las-flores/shared').ContentPlan['items'][number]['resolution']> }> = [];
  for (let i = 0; i < items.length; i++) {
    const res = items[i].resolution;
    if (res && res.status === 'ambiguous') {
      result.push({ index: i, name: items[i].name, type: items[i].type, resolution: res });
    }
  }
  return result;
}

function FallbackBanner({ outlineSource }: { outlineSource?: string }) {
  if (outlineSource !== 'fallback') return null;
  return (
    <div className={styles.fallbackBanner}>
      <strong>Notice:</strong> The outline was auto-generated because the AI outline step
      failed or returned no items. The plan structure may be incomplete — review carefully
      and consider using &ldquo;Refine&rdquo; to improve it.
    </div>
  );
}

function ProgressSection({ genStatus }: { genStatus: import('../types').GenerationStatus }) {
  if (!genStatus.progress || genStatus.progress.total === 0) return null;
  return (
    <div className={styles.progressSection}>
      <div className={styles.progressHeader}>
        <span className={styles.progressLabel}>
          Filling content&hellip; {genStatus.progress.completed}/{genStatus.progress.total} items complete
        </span>
        {genStatus.progress.failed > 0 && (
          <span className={styles.progressFailed}>{genStatus.progress.failed} failed</span>
        )}
      </div>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${(genStatus.progress.completed / genStatus.progress.total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function CoverageSection({
  unplannedEntities,
  onAddFromRoster,
}: {
  unplannedEntities: Array<{ name: string; type: string; description?: string }>;
  onAddFromRoster?: (entity: { name: string; type: string; description?: string }) => void;
}) {
  if (unplannedEntities.length === 0) return null;
  return (
    <div className={styles.coverageSection}>
      <h3 className={styles.coverageHeading}>
        Mentioned but not planned ({unplannedEntities.length})
      </h3>
      <p className={styles.description}>
        These entities were extracted from your description but don&apos;t have plan items yet.
      </p>
      {unplannedEntities.map((entity: { name: string; type: string; description?: string }, i: number) => (
        <div key={i} className={styles.coverageItem}>
          <span className={styles.coverageType}>{entity.type}</span>
          <span className={styles.coverageName}>{entity.name}</span>
          {entity.description && (
            <span className={styles.coverageDesc}>{entity.description}</span>
          )}
          {onAddFromRoster && (
            <button
              className={styles.coverageAddBtn}
              onClick={() => onAddFromRoster(entity)}
            >
              + Add
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ShipFooter({
  pendingNeeds,
  chosenNeeds,
  publishedNeeds,
  onApproveAndShip,
  approving,
  planId,
  isGenerationActive,
}: {
  pendingNeeds: any[];
  chosenNeeds: any[];
  publishedNeeds: any[];
  onApproveAndShip?: () => void;
  approving: boolean;
  planId: string | null;
  isGenerationActive: boolean;
}) {
  return (
    <div className={styles.shipFooter}>
      {pendingNeeds.length > 0 && (
        <p className={styles.shipNote}>
          {pendingNeeds.length} asset{pendingNeeds.length === 1 ? ' is' : 's are'} still missing
          a selected draft. The system will auto-pick <code>{'<slug>__default.png'}</code>{' '}
          for each. Choose a draft above to override.
        </p>
      )}

      <button
        className={cn(styles.shipButton, styles.shipPrimary)}
        onClick={onApproveAndShip}
        disabled={approving || !planId || !!isGenerationActive}
      >
        {approving ? 'Approving & Shipping…' : 'Approve & Ship →'}
      </button>

      <p className={styles.shipHint}>
        One click writes the files, uploads chosen drafts to MinIO (dev cascade),
        migrates the database, and verifies references. This can take up to a few
        minutes for plans with many images.
      </p>

      {(chosenNeeds.length > 0 || publishedNeeds.length > 0) && (
        <p className={styles.shipCounts}>
          {chosenNeeds.length} chosen · {publishedNeeds.length} published
        </p>
      )}
    </div>
  );
}

function PlanItems({
  plan, planId, loading, onRegenerateLore, onRefineItem, onUpdateItem, onRemoveItem,
  onAssetPathRemove, onDependsOnChange, onGenerateDrafts, onChooseDraft,
  draftAssetsByItem, draftLoading, genStatusByItem,
}: {
  plan: ContentPlan;
  planId: string | null;
  loading: boolean;
  onRegenerateLore: (itemId: string) => void;
  onRefineItem?: (itemId: string) => void;
  onUpdateItem: (index: number, field: string, value: string) => void;
  onRemoveItem: (index: number) => void;
  onAssetPathRemove: (index: number, key: string) => void;
  onDependsOnChange: (index: number, dependsOn: string[]) => void;
  onGenerateDrafts?: (count?: number) => void;
  onChooseDraft?: (itemId: string, promptType: string, filename: string) => void;
  draftAssetsByItem?: Record<string, api.DraftAsset[]>;
  draftLoading?: boolean;
  genStatusByItem: Map<string, { status: import('../types').GenerationItemStatus; error?: string }>;
}) {
  return (
    <>
      {plan.items.map((item, i) => (
        <ContentCard
          key={item.id}
          item={item}
          index={i}
          allItems={plan.items}
          planId={planId}
          disabled={loading}
          onRegenerateLore={onRegenerateLore}
          onRefineItem={onRefineItem}
          onFieldChange={onUpdateItem}
          onRemove={onRemoveItem}
          onAssetPathRemove={onAssetPathRemove}
          onDependsOnChange={onDependsOnChange}
          onGenerateDrafts={() => onGenerateDrafts?.()}
          onChooseDraft={onChooseDraft}
          draftAssets={draftAssetsByItem?.[item.id]}
          draftLoading={draftLoading}
          fillStatus={genStatusByItem.get(item.id)}
        />
      ))}
    </>
  );
}

function CritiqueSection({
  planId,
  plan,
  annotations,
  onRunCritique,
  onDismissAnnotation,
  loading,
}: {
  planId: string | null;
  plan: unknown;
  annotations: import('@las-flores/shared').CritiqueAnnotation[];
  onRunCritique?: (scope?: 'entity' | 'cross_entity', plan?: unknown) => void;
  onDismissAnnotation?: (id: string) => void;
  loading?: boolean;
}) {
  if (!planId) return null;
  return (
    <section className={styles.critiqueSection}>
      <div className={styles.critiqueHeader}>
        <span className={styles.critiqueTitle}>AI Critique</span>
        <button
          className={cn(styles.button, styles.secondaryButton)}
          disabled={loading}
          onClick={() => onRunCritique?.('entity', plan)}
          title="Per-item/local critique (cheap model)"
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
        <button
          className={cn(styles.button, styles.secondaryButton)}
          disabled={loading}
          onClick={() => onRunCritique?.('cross_entity', plan)}
          title="Cross-entity narrative/timeline critique (deep model)"
        >
          {loading ? 'Analyzing…' : 'Deep Analyze'}
        </button>
        {annotations.length > 0 && (
          <span className={styles.critiqueCount}>
            {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <CritiqueOverlay annotations={annotations} onDismiss={onDismissAnnotation} />
    </section>
  );
}

export { ProgressSection, CoverageSection, ShipFooter, PlanItems, CritiqueSection, FallbackBanner, buildGenStatusByItem, computeUnplannedEntities, collectAmbiguousItems };
