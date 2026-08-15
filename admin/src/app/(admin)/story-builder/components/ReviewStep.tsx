'use client';

import type { ContentPlan } from '@las-flores/shared';
import type { IntakeConflictPreview } from '@las-flores/shared';
import type { ResolutionAlternative } from '@las-flores/shared';
import type { CritiqueAnnotation } from '@las-flores/shared';
import { cn } from '@las-flores/ui';
import type { GenerationStatus } from '../types';
import * as api from '../hooks/useStoryBuilderApi';
import PlanSummary from './PlanSummary';
import RefineSection from './RefineSection';
import LinksSection from './LinksSection';
import ConflictPreview from './ConflictPreview';
import IdentityResolutionPicker from './IdentityResolutionPicker';
import {
  ProgressSection,
  CoverageSection,
  ShipFooter,
  PlanItems,
  CritiqueSection,
  FallbackBanner,
  buildGenStatusByItem,
  computeUnplannedEntities,
  collectAmbiguousItems,
} from './ReviewStepSections';
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
  onResolveIdentity?: (index: number, chosen: ResolutionAlternative) => void;
  // M26 — AI semantic critique (analyze panel + conflict overlays + dismiss)
  critiqueAnnotations?: CritiqueAnnotation[];
  onRunCritique?: (scope?: 'entity' | 'cross_entity', plan?: unknown) => void;
  onDismissAnnotation?: (id: string) => void;
  critiqueAnalyzeLoading?: boolean;
}

export default function ReviewStep({
  plan, planId, loading, onRegenerateLore, refineFeedback, setRefineFeedback, showRefine, setShowRefine,
  onRefine, onUpdateItem, onRemoveItem, onAddItem, onAddFromRoster, onRefineItem, onAssetPathRemove,
  onDependsOnChange, onUpdateLink, onAddLink, onRemoveLink,
  onGenerateDrafts, onChooseDraft, draftAssetsByItem, draftLoading,
  onApproveAndShip, approving, genStatus,
  conflicts = [], fileConflicts = [], onGenerateFullPlan, onRefineInstead,
  onResolveIdentity,
  critiqueAnnotations = [], onRunCritique, onDismissAnnotation, critiqueAnalyzeLoading,
}: ReviewStepProps) {
  const items = plan?.items ?? [];
  const allNeeds = items.flatMap(item => item.assetNeeds ?? []);
  const pendingNeeds = allNeeds.filter(n => n.status === 'pending');
  const chosenNeeds = allNeeds.filter(n => n.status === 'chosen');
  const publishedNeeds = allNeeds.filter(n => n.status === 'published');

  const genStatusByItem = buildGenStatusByItem(genStatus);
  const isGenerationActive = !!(genStatus && (genStatus.status === 'filling' || genStatus.status === 'pending' || genStatus.status === 'generating'));
  const unplannedEntities = computeUnplannedEntities(plan, items);
  const ambiguousItems = collectAmbiguousItems(items);

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Review Plan</h2>
      <p className={styles.description}>
        Review and edit the proposed content. All text fields are editable.
      </p>

      <FallbackBanner outlineSource={plan._meta?.outline_source} />

      <ConflictPreview
        conflicts={conflicts}
        fileConflicts={fileConflicts}
        hasPlanId={!!planId}
        loading={loading}
        onGenerateFullPlan={() => onGenerateFullPlan?.()}
        onRefineInstead={() => onRefineInstead?.()}
      />

      {/* M26 — AI semantic critique */}
      <CritiqueSection
        planId={planId}
        plan={plan}
        annotations={critiqueAnnotations}
        onRunCritique={onRunCritique}
        onDismissAnnotation={onDismissAnnotation}
        loading={critiqueAnalyzeLoading}
      />

      {isGenerationActive && <ProgressSection genStatus={genStatus} />}

      <PlanSummary plan={plan} />

      <CoverageSection unplannedEntities={unplannedEntities} onAddFromRoster={onAddFromRoster} />

      {onResolveIdentity && ambiguousItems.length > 0 && (
        <IdentityResolutionPicker
          items={ambiguousItems}
          loading={loading}
          onResolve={onResolveIdentity}
        />
      )}

      <PlanItems
        plan={plan}
        planId={planId}
        loading={loading}
        onRegenerateLore={onRegenerateLore}
        onRefineItem={onRefineItem}
        onUpdateItem={onUpdateItem}
        onRemoveItem={onRemoveItem}
        onAssetPathRemove={onAssetPathRemove}
        onDependsOnChange={onDependsOnChange}
        onGenerateDrafts={onGenerateDrafts}
        onChooseDraft={onChooseDraft}
        draftAssetsByItem={draftAssetsByItem}
        draftLoading={draftLoading}
        genStatusByItem={genStatusByItem}
      />

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
