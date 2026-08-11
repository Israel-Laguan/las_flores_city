'use client';

import type { ContentPlan } from '@las-flores/shared';
import type { IntakeConflictPreview } from '@las-flores/shared';
import { cn } from '@las-flores/ui';
import type { GenerationStatus } from '../types';
import * as api from '../hooks/useStoryBuilderApi';
import ContentCard from './ContentCard';
import PlanSummary from './PlanSummary';
import RefineSection from './RefineSection';
import LinksSection from './LinksSection';
import ConflictPreview from './ConflictPreview';
import styles from './ReviewStep.module.css';

interface ReviewStepProps {
  plan: ContentPlan;
  planId: string | null;
  loading: boolean;
  onRegenerateLore: (itemId: string) => void;
  refineFeedback: string;
  setRefineFeedback: (v: string) => void;
  showRefine: boolean;
  setShowRefine: (v: boolean) => void;
  onRefine: () => void;
  onUpdateItem: (index: number, field: string, value: string) => void;
  onRemoveItem: (index: number) => void;
  onAddItem: () => void;
  onAddFromRoster?: (entity: { name: string; type: string; description?: string }) => void;
  onRefineItem?: (itemId: string) => void;
  onAssetPathRemove: (index: number, key: string) => void;
  onDependsOnChange: (index: number, dependsOn: string[]) => void;
  onUpdateLink: (index: number, field: string, value: string) => void;
  onAddLink: () => void;
  onRemoveLink: (index: number) => void;
  onGenerateDrafts?: (count?: number) => void;
  onChooseDraft?: (itemId: string, promptType: string, filename: string) => void;
  draftAssetsByItem?: Record<string, api.DraftAsset[]>;
  draftLoading?: boolean;
  onApproveAndShip?: () => void;
  approving?: boolean;
  genStatus?: GenerationStatus | null;
  conflicts?: IntakeConflictPreview[];
  fileConflicts?: string[];
  onGenerateFullPlan?: () => void;
  onRefineInstead?: () => void;
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
  'use client';
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
  'use client';
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

export default function ReviewStep({
  plan, planId, loading, onRegenerateLore, refineFeedback, setRefineFeedback, showRefine, setShowRefine,
  onRefine, onUpdateItem, onRemoveItem, onAddItem, onAddFromRoster, onRefineItem, onAssetPathRemove,
  onDependsOnChange, onUpdateLink, onAddLink, onRemoveLink,
  onGenerateDrafts, onChooseDraft, draftAssetsByItem, draftLoading,
  onApproveAndShip, approving, genStatus,
  conflicts = [], fileConflicts = [], onGenerateFullPlan, onRefineInstead,
}: ReviewStepProps) {
  // Asset needs that were never given a selected draft. The system will
  // auto-pick the `<slug>__default.png` historical default for these.
  const items = plan?.items ?? [];
  const allNeeds = items.flatMap(item => item.assetNeeds ?? []);
  const pendingNeeds = allNeeds.filter(n => n.status === 'pending');
  const chosenNeeds = allNeeds.filter(n => n.status === 'chosen');
  const publishedNeeds = allNeeds.filter(n => n.status === 'published');

  // Build a lookup from genStatus items for quick access per ContentCard
  const genStatusByItem = new Map<string, { status: import('../types').GenerationItemStatus; error?: string }>();
  if (genStatus?.items) {
    for (const item of genStatus.items) {
      genStatusByItem.set(item.itemId, item);
    }
  }
  const isGenerationActive = !!(genStatus && (genStatus.status === 'filling' || genStatus.status === 'pending' || genStatus.status === 'generating'));

  // Coverage check: entities extracted from the description but not in the plan
  const roster = plan._meta?.entity_roster;
  const normalizeForCompare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const unplannedEntities = roster?.filter(r =>
    !items.some(item =>
      normalizeForCompare(item.name) === normalizeForCompare(r.name) &&
      item.type === r.type
    )
  ) ?? [];

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Review Plan</h2>
      <p className={styles.description}>
        Review and edit the proposed content. All text fields are editable.
      </p>

      {plan._meta?.outline_source === 'fallback' && (
        <div className={styles.fallbackBanner}>
          <strong>Notice:</strong> The outline was auto-generated because the AI outline step
          failed or returned no items. The plan structure may be incomplete — review carefully
          and consider using &ldquo;Refine&rdquo; to improve it.
        </div>
      )}

      <ConflictPreview
        conflicts={conflicts}
        fileConflicts={fileConflicts}
        hasPlanId={!!planId}
        loading={loading}
        onGenerateFullPlan={() => onGenerateFullPlan?.()}
        onRefineInstead={() => onRefineInstead?.()}
      />

      {isGenerationActive && <ProgressSection genStatus={genStatus} />}

      <PlanSummary plan={plan} />

      <CoverageSection unplannedEntities={unplannedEntities} onAddFromRoster={onAddFromRoster} />

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

      <button className={cn(styles.button, styles.secondaryButton)} onClick={onAddItem}>
        + Add Item
      </button>

      <RefineSection
        refineFeedback={refineFeedback}
        setRefineFeedback={setRefineFeedback}
        showRefine={showRefine}
        setShowRefine={setShowRefine}
        loading={loading}
        onRefine={onRefine}
      />

      {plan.items.length >= 2 && (
        <LinksSection
          plan={plan}
          onUpdateLink={onUpdateLink}
          onAddLink={onAddLink}
          onRemoveLink={onRemoveLink}
        />
      )}

      <ShipFooter
        pendingNeeds={pendingNeeds}
        chosenNeeds={chosenNeeds}
        publishedNeeds={publishedNeeds}
        onApproveAndShip={onApproveAndShip}
        approving={!!approving}
        planId={planId}
        isGenerationActive={isGenerationActive}
      />
    </div>
  );
}
